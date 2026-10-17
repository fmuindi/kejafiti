import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingStatusPanel } from "@/components/listing/status-panel";
import { Wizard, type WizardData } from "@/components/listing/wizard";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/primitives";
import { isOrgAdmin, requireWorkspace } from "@/lib/auth";
import type { ListingCharge } from "@/lib/listing/costs";
import { signListingPhotos } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "List a home" };

export default async function ListingWizardPage({ params, searchParams }: PageProps<"/w/[orgId]/listings/[listingId]">) {
  const { orgId, listingId } = await params;
  const sp = await searchParams;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/listings/${listingId}`);
  if (!ws.can_manage_listings) notFound();
  const supabase = await createClient();
  const { data: l } = await supabase
    .from("listings")
    .select("*, units(*), properties(*), listing_charges(*), listing_photos(*)")
    .eq("id", listingId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!l) notFound();
  const unit = l.units as unknown as Record<string, unknown>;
  const property = l.properties as unknown as Record<string, unknown>;
  const photos = ((l.listing_photos as unknown as Array<Record<string, unknown>>) ?? []).sort((a, b) => Number(a.position) - Number(b.position));
  const urls = await signListingPhotos(supabase, photos.map((p) => (p.thumb_path as string | null) ?? (p.storage_path as string)));
  const { data: problems } = await supabase.rpc("listing_problems", { p_listing: listingId });
  const { data: org } = await supabase.from("organizations").select("contact_phone").eq("id", orgId).maybeSingle();

  const editable = ["draft", "needs_correction", "published", "paused"].includes(l.status);
  const stepParam = Number(Array.isArray(sp.step) ? sp.step[0] : sp.step);
  const step = Number.isInteger(stepParam) && stepParam >= 1 && stepParam <= 6 ? stepParam : Math.min(l.wizard_step, 6);

  const data: WizardData = {
    orgId,
    listingId,
    ref: l.ref,
    status: l.status,
    reviewNote: l.review_note,
    canEditBuilding: isOrgAdmin(ws),
    location: {
      area: String(property.area ?? ""),
      town: String(property.town ?? ""),
      county: String(property.county ?? ""),
      road: String(property.road ?? ""),
      landmark: String(property.landmark ?? ""),
      viewing_address: String(property.viewing_address ?? ""),
      unit_label: String(unit.label ?? ""),
      property_name: String(property.name ?? ""),
    },
    home: {
      rental_scope: unit.rental_scope as WizardData["home"]["rental_scope"],
      layout: unit.layout as WizardData["home"]["layout"],
      bedrooms: (unit.bedrooms as number | null) ?? null,
      bathrooms: (unit.bathrooms as number | null) ?? null,
      floor_level: (unit.floor_level as number | null) ?? null,
      size_sqm: unit.size_sqm === null || unit.size_sqm === undefined ? null : Number(unit.size_sqm),
      building_style: (unit.building_style as WizardData["home"]["building_style"]) ?? ((property.building_style as WizardData["home"]["building_style"]) ?? null),
      origin: (unit.origin as WizardData["home"]["origin"]) ?? null,
      furnishing: (l.furnishing as WizardData["home"]["furnishing"]) ?? null,
      student: l.student,
      facts: (unit.facts as Record<string, "yes" | "no" | "unknown">) ?? {},
    },
    costs: {
      rent_amount: l.rent_amount === null ? null : Number(l.rent_amount),
      price_period: l.price_period as WizardData["costs"]["price_period"],
      price_basis: l.price_basis as WizardData["costs"]["price_basis"],
      deposit_months: l.deposit_months === null ? null : Number(l.deposit_months),
      deposit_amount: l.deposit_amount === null ? null : Number(l.deposit_amount),
      charges: ((l.listing_charges as unknown as Array<ListingCharge & { position: number }>) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((c) => ({ kind: c.kind, label: c.label ?? null, amount: c.amount === null ? null : Number(c.amount), frequency: c.frequency, billing: c.billing, compulsory: c.compulsory })),
    },
    photos: photos.map((p) => ({
      id: String(p.id),
      url: urls.get((p.thumb_path as string | null) ?? (p.storage_path as string)) ?? "",
      position: Number(p.position),
      is_cover: Boolean(p.is_cover),
      media_label: p.media_label as "actual_unit" | "building" | "sample",
      alt_text: (p.alt_text as string | null) ?? null,
    })),
    details: {
      title: l.title ?? "",
      description: l.description ?? "",
      available_from: l.available_from,
      contact_call: l.contact_call,
      contact_whatsapp: l.contact_whatsapp,
      contact_phone: l.contact_phone ?? org?.contact_phone ?? "",
      viewing_instructions: l.viewing_instructions ?? "",
      house_rules: l.house_rules ?? "",
    },
    problems: (problems ?? []) as string[],
  };

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-4">
      <Link href={`/w/${orgId}/properties/${l.property_id}`} className="inline-flex min-h-11 items-center gap-1 self-start font-semibold">
        <Icon name="chevronLeft" /> {String(property.name)}
      </Link>
      {l.status !== "draft" ? <ListingStatusPanel orgId={orgId} listingId={listingId} status={l.status} refId={l.ref} confirmedAt={l.availability_confirmed_at} reviewNote={l.review_note} /> : null}
      {editable ? (
        <Wizard data={data} step={step} />
      ) : (
        <Notice tone="info" title={l.status === "under_review" ? "Waiting for review" : "This listing is closed"}>
          {l.status === "under_review"
            ? "Our team checks new listings before they go live, usually within a working day. You'll get a notification."
            : "Start a new listing for this unit when it's vacant again."}
        </Notice>
      )}
    </div>
  );
}
