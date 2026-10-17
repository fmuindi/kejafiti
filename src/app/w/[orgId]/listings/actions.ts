"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const fact = z.enum(["yes", "no", "unknown"]);

function revalidateListing(orgId: string, listingId?: string) {
  revalidatePath(`/w/${orgId}`, "layout");
  if (listingId) revalidatePath(`/w/${orgId}/listings/${listingId}`);
  revalidatePath("/search");
}

export async function startListing(orgId: string, input: { propertyId?: string; unitId?: string; area?: string; road?: string; town?: string; county?: string; landmark?: string; propertyName?: string; unitLabel?: string; layout?: string; bedrooms?: number | null; rentalScope?: string }): Promise<ActionResult<{ listingId: string }>> {
  await requireUser(`/w/${orgId}/listings/new`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_listing", {
    p: {
      org_id: orgId,
      property_id: input.propertyId ?? null,
      unit_id: input.unitId ?? null,
      area: input.area ?? null,
      road: input.road ?? null,
      town: input.town ?? null,
      county: input.county ?? null,
      landmark: input.landmark ?? null,
      property_name: input.propertyName ?? null,
      unit_label: input.unitLabel ?? null,
      layout: input.layout ?? null,
      bedrooms: input.bedrooms ?? null,
      rental_scope: input.rentalScope ?? null,
    },
  });
  if (error) return fail(error);
  revalidateListing(orgId);
  return { ok: true, data: { listingId: data as unknown as string } };
}

// ---------------------------------------------------------------------------
// Wizard steps. Each save is partial and idempotent, so autosave can call it repeatedly.
// ---------------------------------------------------------------------------

const locationSchema = z.object({
  area: z.string().trim().min(2, "Enter the area or estate, for example Ruaka.").max(120),
  town: z.string().trim().max(80).optional(),
  county: z.string().trim().max(80).optional(),
  road: z.string().trim().max(120).optional(),
  landmark: z.string().trim().max(160).optional(),
  viewing_address: z.string().trim().max(300).optional(),
  unit_label: z.string().trim().min(1, "Give this unit a reference, for example B4.").max(40),
});

export async function saveLocation(orgId: string, listingId: string, input: z.input<typeof locationSchema>): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/listings/${listingId}`);
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const supabase = await createClient();
  const { data: l } = await supabase.from("listings").select("property_id, unit_id").eq("id", listingId).maybeSingle();
  if (!l) return { ok: false, message: "Listing not found." };
  const { unit_label, ...prop } = parsed.data;
  const [p, u] = await Promise.all([
    supabase.from("properties").update({ ...prop, town: prop.town || null, county: prop.county || null, road: prop.road || null, landmark: prop.landmark || null, viewing_address: prop.viewing_address || null }).eq("id", l.property_id),
    supabase.from("units").update({ label: unit_label }).eq("id", l.unit_id),
  ]);
  // Only workspace admins may edit shared building details; staff can still edit the unit.
  if (u.error) return fail(u.error);
  if (p.error && p.error.code !== "42501") return fail(p.error);
  await supabase.from("listings").update({ wizard_step: 2 }).eq("id", listingId).lt("wizard_step", 2);
  revalidateListing(orgId, listingId);
  return { ok: true };
}

const homeSchema = z.object({
  rental_scope: z.enum(["entire_home", "private_room", "shared_room", "bedspace"]),
  layout: z.enum(["single_room", "double_room", "multiroom", "bedsitter_studio", "bedroom_home"]),
  bedrooms: z.number().int().min(0).max(30).nullable(),
  bathrooms: z.number().int().min(0).max(30).nullable(),
  floor_level: z.number().int().min(-5).max(100).nullable(),
  size_sqm: z.number().positive().max(10000).nullable(),
  building_style: z.enum(["apartment", "bungalow", "maisonette", "townhouse", "terraced_house", "villa", "mansion", "cottage", "farmhouse", "other"]).nullable(),
  origin: z.enum(["dsq", "guest_wing", "conversion"]).nullable(),
  furnishing: z.enum(["unfurnished", "partly", "fully"]).nullable(),
  student: z.boolean(),
  facts: z.record(z.string(), fact),
});

export async function saveHome(orgId: string, listingId: string, input: z.input<typeof homeSchema>): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/listings/${listingId}`);
  const parsed = homeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the home details." };
  const h = parsed.data;
  if (h.layout === "bedroom_home" && !h.bedrooms) return { ok: false, message: "Enter the number of separate bedrooms.", fieldErrors: { bedrooms: "Enter the number of separate bedrooms." } };
  const supabase = await createClient();
  const { data: l } = await supabase.from("listings").select("unit_id").eq("id", listingId).maybeSingle();
  if (!l) return { ok: false, message: "Listing not found." };
  const u = await supabase.from("units").update({
    rental_scope: h.rental_scope, layout: h.layout, bedrooms: h.layout === "bedroom_home" ? h.bedrooms : h.layout === "bedsitter_studio" ? 0 : h.bedrooms,
    bathrooms: h.bathrooms, floor_level: h.floor_level, size_sqm: h.size_sqm, building_style: h.building_style, origin: h.origin, facts: h.facts,
  }).eq("id", l.unit_id);
  if (u.error) return fail(u.error);
  const r = await supabase.from("listings").update({ furnishing: h.furnishing, student: h.student }).eq("id", listingId);
  if (r.error) return fail(r.error);
  await supabase.from("listings").update({ wizard_step: 3 }).eq("id", listingId).lt("wizard_step", 3);
  revalidateListing(orgId, listingId);
  return { ok: true };
}

const chargeSchema = z.object({
  kind: z.enum(["service_charge", "water", "electricity", "garbage", "security", "internet", "parking", "utility_deposit", "other_deposit", "agency_fee", "viewing_fee", "other"]),
  label: z.string().max(80).nullable().optional(),
  amount: z.number().nonnegative().max(9_999_999).nullable(),
  frequency: z.enum(["monthly", "one_off"]),
  billing: z.enum(["fixed", "metered", "included", "unknown"]),
  compulsory: z.boolean(),
});
const costsSchema = z.object({
  rent_amount: z.number().positive().max(9_999_999).nullable(),
  price_period: z.enum(["month", "week", "night", "semester"]),
  price_basis: z.enum(["entire_unit", "per_person", "per_bed", "per_room"]),
  deposit_months: z.number().min(0).max(12).nullable(),
  deposit_amount: z.number().min(0).max(9_999_999).nullable(),
  charges: z.array(chargeSchema).max(20),
});

export async function saveCosts(orgId: string, listingId: string, input: z.input<typeof costsSchema>): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/listings/${listingId}`);
  const parsed = costsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the amounts. Enter numbers in KES." };
  const c = parsed.data;
  const supabase = await createClient();
  const r = await supabase.from("listings").update({ rent_amount: c.rent_amount, price_period: c.price_period, price_basis: c.price_basis, deposit_months: c.deposit_amount !== null ? null : c.deposit_months, deposit_amount: c.deposit_amount }).eq("id", listingId);
  if (r.error) return fail(r.error);
  // Replace the charge set as a whole: simplest correct model for a small structured list.
  const del = await supabase.from("listing_charges").delete().eq("listing_id", listingId);
  if (del.error) return fail(del.error);
  if (c.charges.length) {
    const ins = await supabase.from("listing_charges").insert(c.charges.map((ch, i) => ({ ...ch, label: ch.label || null, listing_id: listingId, position: i })));
    if (ins.error) return fail(ins.error);
  }
  await supabase.from("listings").update({ wizard_step: 4 }).eq("id", listingId).lt("wizard_step", 4);
  revalidateListing(orgId, listingId);
  return { ok: true };
}

const detailsSchema = z.object({
  title: z.string().trim().max(140),
  description: z.string().trim().max(4000),
  available_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  contact_call: z.boolean(),
  contact_whatsapp: z.boolean(),
  contact_phone: z.string().trim().max(30),
  viewing_instructions: z.string().trim().max(1000),
  house_rules: z.string().trim().max(2000),
});

export async function saveDetails(orgId: string, listingId: string, input: z.input<typeof detailsSchema>): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/listings/${listingId}`);
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the availability and contact details." };
  const d = parsed.data;
  const supabase = await createClient();
  const r = await supabase.from("listings").update({ ...d, title: d.title || null, description: d.description || null, contact_phone: d.contact_phone || null, viewing_instructions: d.viewing_instructions || null, house_rules: d.house_rules || null }).eq("id", listingId);
  if (r.error) return fail(r.error);
  await supabase.from("listings").update({ wizard_step: 6 }).eq("id", listingId).lt("wizard_step", 6);
  revalidateListing(orgId, listingId);
  return { ok: true };
}

export async function submitListing(orgId: string, listingId: string): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/listings/${listingId}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_listing", { p_listing: listingId });
  if (error) return fail(error);
  revalidateListing(orgId, listingId);
  return { ok: true };
}

export async function setListingStatus(orgId: string, listingId: string, action: "pause" | "resume" | "withdraw" | "mark_let", date?: string): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/listings/${listingId}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_listing_status", { p_listing: listingId, p_action: action, p_date: date });
  if (error) return fail(error);
  revalidateListing(orgId, listingId);
  return { ok: true };
}

export async function confirmStillAvailable(orgId: string, listingIds: string[]): Promise<ActionResult<Array<{ id: string; ok: boolean; error?: string }>>> {
  await requireUser(`/w/${orgId}`);
  if (!listingIds.every((id) => uuid.safeParse(id).success)) return { ok: false, message: "Choose listings to confirm." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_still_available", { p_listings: listingIds });
  if (error) return fail(error);
  revalidateListing(orgId);
  return { ok: true, data: data as unknown as Array<{ id: string; ok: boolean; error?: string }> };
}

// ---------------------------------------------------------------------------
// Photos (files go straight from the browser to storage under RLS; rows are written here)
// ---------------------------------------------------------------------------

export async function addPhoto(orgId: string, listingId: string, input: { path: string; thumbPath: string | null; width: number; height: number; size: number; label: "actual_unit" | "building" | "sample" }): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser(`/w/${orgId}/listings/${listingId}`);
  if (!input.path.startsWith(`${orgId}/${listingId}/`)) return { ok: false, message: "Upload the photo to this listing." };
  const supabase = await createClient();
  const { count } = await supabase.from("listing_photos").select("id", { count: "exact", head: true }).eq("listing_id", listingId);
  if ((count ?? 0) >= 24) return { ok: false, message: "A listing can have up to 24 photos." };
  const { data, error } = await supabase
    .from("listing_photos")
    .insert({ listing_id: listingId, org_id: orgId, storage_path: input.path, thumb_path: input.thumbPath, width: input.width, height: input.height, size_bytes: input.size, media_label: input.label, position: count ?? 0, is_cover: (count ?? 0) === 0, uploaded_by: user.id })
    .select("id")
    .single();
  if (error) return fail(error);
  revalidateListing(orgId, listingId);
  return { ok: true, data: { id: data.id } };
}

export async function updatePhotos(orgId: string, listingId: string, photos: Array<{ id: string; position: number; is_cover: boolean; media_label: "actual_unit" | "building" | "sample"; alt_text: string | null }>): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/listings/${listingId}`);
  if (photos.filter((p) => p.is_cover).length > 1) return { ok: false, message: "Choose one cover photo." };
  const supabase = await createClient();
  for (const p of photos) {
    const { error } = await supabase.from("listing_photos").update({ position: p.position, is_cover: p.is_cover, media_label: p.media_label, alt_text: p.alt_text }).eq("id", p.id).eq("listing_id", listingId);
    if (error) return fail(error);
  }
  await supabase.from("listings").update({ wizard_step: 5 }).eq("id", listingId).lt("wizard_step", 5);
  revalidateListing(orgId, listingId);
  return { ok: true };
}

export async function removePhoto(orgId: string, listingId: string, photoId: string): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/listings/${listingId}`);
  const supabase = await createClient();
  const { data: ph } = await supabase.from("listing_photos").select("storage_path, thumb_path").eq("id", photoId).eq("listing_id", listingId).maybeSingle();
  if (!ph) return { ok: false, message: "Photo not found." };
  const { error } = await supabase.from("listing_photos").delete().eq("id", photoId);
  if (error) return fail(error);
  await supabase.storage.from("listing-media").remove([ph.storage_path, ph.thumb_path].filter(Boolean) as string[]);
  revalidateListing(orgId, listingId);
  return { ok: true };
}
