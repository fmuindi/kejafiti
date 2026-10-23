"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const propertySchema = z.object({
  name: z.string().trim().min(2, "Enter the property name.").max(120),
  area: z.string().trim().min(2, "Enter the area or estate.").max(120),
  town: z.string().trim().max(80).optional(),
  county: z.string().trim().max(80).optional(),
  road: z.string().trim().max(120).optional(),
  landmark: z.string().trim().max(160).optional(),
  building_style: z.string().max(40).optional(),
  owner_label: z.string().trim().max(120).optional(),
  rent_due_day: z.number().int().min(1).max(28),
  evidence_policy: z.enum(["optional", "required"]),
});

export async function createProperty(orgId: string, input: z.input<typeof propertySchema>): Promise<ActionResult<{ id: string }>> {
  await requireUser(`/w/${orgId}/properties/new`);
  const parsed = propertySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .insert({ org_id: orgId, ...p, town: p.town || null, county: p.county || null, road: p.road || null, landmark: p.landmark || null, building_style: p.building_style || null, owner_label: p.owner_label || null })
    .select("id")
    .single();
  if (error) return fail(error);
  revalidatePath(`/w/${orgId}`, "layout");
  return { ok: true, data: { id: data.id } };
}

export async function updateProperty(orgId: string, propertyId: string, input: z.input<typeof propertySchema>): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/properties/${propertyId}`);
  const parsed = propertySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("properties").update({ ...p, town: p.town || null, county: p.county || null, road: p.road || null, landmark: p.landmark || null, building_style: p.building_style || null, owner_label: p.owner_label || null }).eq("id", propertyId);
  if (error) return fail(error);
  revalidatePath(`/w/${orgId}`, "layout");
  return { ok: true };
}

/** "A1-A5, B1, B2" -> ["A1","A2","A3","A4","A5","B1","B2"] */
function expandLabels(input: string): string[] | null {
  const out: string[] = [];
  for (const part of input.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^([A-Za-z]*)(\d+)\s*-\s*\1?(\d+)$/);
    if (m) {
      const [, prefix, a, b] = m;
      const from = Number(a), to = Number(b);
      if (to < from || to - from > 200) return null;
      for (let i = from; i <= to; i++) out.push(`${prefix}${a.length > 1 && a.startsWith("0") ? String(i).padStart(a.length, "0") : i}`);
    } else {
      out.push(part);
    }
  }
  return out.length ? out : null;
}

export async function addUnits(orgId: string, propertyId: string, input: { labels: string; layout: string; bedrooms: number | null; rent: number | null }): Promise<ActionResult<{ created: number }>> {
  await requireUser(`/w/${orgId}/properties/${propertyId}`);
  const labels = expandLabels(input.labels);
  if (!labels) return { ok: false, message: 'Enter unit references, for example "A1-A10, B1".', fieldErrors: { labels: 'Enter unit references, for example "A1-A10, B1".' } };
  if (labels.some((l) => l.length > 40)) return { ok: false, message: "Unit references can be up to 40 characters." };
  if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) return { ok: false, message: "Each unit reference must be unique." };
  const supabase = await createClient();
  const { error } = await supabase.from("units").insert(
    labels.map((label) => ({ org_id: orgId, property_id: propertyId, label, layout: input.layout, bedrooms: input.layout === "bedroom_home" ? input.bedrooms : input.layout === "bedsitter_studio" ? 0 : null, default_rent: input.rent })),
  );
  if (error) return error.code === "23505" ? { ok: false, message: "One of those unit references already exists in this property." } : fail(error);
  revalidatePath(`/w/${orgId}`, "layout");
  return { ok: true, data: { created: labels.length } };
}

export async function setUnitOccupancy(orgId: string, propertyId: string, unitId: string, occupancy: "vacant" | "reserved" | "unavailable" | "notice_given" | "occupied", date: string | null): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/properties/${propertyId}`);
  const supabase = await createClient();
  const { error } = await supabase.from("units").update({ occupancy, occupancy_date: date }).eq("id", unitId).eq("property_id", propertyId);
  if (error) return fail(error);
  revalidatePath(`/w/${orgId}`, "layout");
  return { ok: true };
}

export async function bulkPause(orgId: string, listingIds: string[]): Promise<ActionResult<{ ok: number; failed: number }>> {
  await requireUser(`/w/${orgId}/properties`);
  const supabase = await createClient();
  let ok = 0, failed = 0;
  for (const id of listingIds) {
    const { error } = await supabase.rpc("set_listing_status", { p_listing: id, p_action: "pause" });
    if (error) failed++;
    else ok++;
  }
  revalidatePath(`/w/${orgId}`, "layout");
  return { ok: true, data: { ok, failed } };
}

const cellText = z.string().trim().max(200).optional();
const importRowSchema = z.object({
  row: z.number().int().positive(),
  label: z.string().trim().min(1).max(40),
  layout: z.enum(["single_room", "double_room", "multiroom", "bedsitter_studio", "bedroom_home"]).optional(),
  bedrooms: cellText, default_rent: cellText, tenant_name: z.string().trim().max(120).optional(), tenant_phone: cellText,
  tenant_email: cellText, start_date: cellText, rent_amount: cellText, due_day: cellText, deposit_held: cellText,
  opening_balance: cellText, opening_balance_note: cellText,
});
export type ImportResult = { errors: Array<{ row: number; message: string }>; units_created: number; tenancies_created: number; rows: number; committed: boolean };

/** Checks (commit = false) or imports (commit = true) parsed spreadsheet rows. All or nothing. */
export async function importUnits(orgId: string, propertyId: string, rows: unknown, commit: boolean): Promise<ActionResult<ImportResult>> {
  await requireUser(`/w/${orgId}/properties/${propertyId}`);
  const parsed = z.array(importRowSchema).max(500).safeParse(rows);
  if (!parsed.success) return { ok: false, message: "Some rows couldn't be read. Check the file and try again." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_units", { p_property: propertyId, p_rows: parsed.data, p_commit: commit });
  if (error) return fail(error);
  if (commit) revalidatePath(`/w/${orgId}`, "layout");
  return { ok: true, data: data as unknown as ImportResult };
}
