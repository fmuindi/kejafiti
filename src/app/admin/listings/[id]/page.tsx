import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewDecision } from "@/components/admin/review-decision";
import { CostBreakdown } from "@/components/tenant/cost-breakdown";
import { Gallery } from "@/components/tenant/gallery";
import { Notice, StatusBadge } from "@/components/ui/primitives";
import { ADVERTISER_ROLE_LABEL, FACTS, layoutLabel } from "@/lib/listing/catalog";
import { formatDate } from "@/lib/dates";
import type { PublicListing } from "@/lib/listing/types";
import { signListingPhotos } from "@/lib/storage";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/shell/back-link";

export const metadata: Metadata = { title: "Review listing" };

const EDIT_LABEL: Record<string, string> = {
  title: "Title",
  description: "Description",
  contact_phone: "Phone",
  contact_call: "Calls allowed",
  contact_whatsapp: "WhatsApp allowed",
  viewing_instructions: "Viewing instructions",
  house_rules: "House rules",
  photos_added: "Photos",
};

export default async function AdminListingPage({ params }: PageProps<"/admin/listings/[id]">) {
  // Layouts and pages render in parallel, so every admin page checks for itself.
  await requirePlatformAdmin("/admin");
  const { id } = await params;
  const supabase = await createClient();
  const { data: row } = await supabase.from("listings").select("ref, status, flags, submitted_at, org_id, pending_edit").eq("id", id).maybeSingle();
  if (!row) notFound();
  const { data } = await supabase.rpc("get_listing", { p_ref: row.ref });
  const l = data as unknown as PublicListing;
  if (!l || !("unit" in l)) notFound();
  const urls = await signListingPhotos(supabase, l.photos.map((p) => p.path));
  const photos = l.photos.map((p) => ({ url: urls.get(p.path) ?? "", label: p.label, alt: p.alt })).filter((p) => p.url);
  const flags = (row.flags as string[]) ?? [];
  const edit = row.pending_edit as Record<string, unknown> | null;

  return (
    <div className="mx-auto flex max-w-standard flex-col gap-5">
      <BackLink href="/admin">Review queue</BackLink>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="heading-page">{l.title}</h1>
        <StatusBadge tone={row.status === "under_review" ? "waiting" : row.status === "published" ? "success" : "neutral"}>{row.status.replace("_", " ")}</StatusBadge>
        <span className="font-mono text-caption text-muted">{row.ref}</span>
      </div>
      {edit ? (
        <Notice tone="waiting" title="Edited after it was published">
          <p>The listing is hidden until you approve these changes. Before the edit:</p>
          <dl className="mt-2 flex flex-col gap-1.5">
            {Object.entries(edit).map(([k, v]) => (
              <div key={k} className="flex flex-col sm:flex-row sm:gap-2">
                <dt className="shrink-0 font-semibold">{EDIT_LABEL[k] ?? k}:</dt>
                <dd className="whitespace-pre-line">{k === "photos_added" ? `${v} new photo${v === 1 ? "" : "s"} (shown in the gallery)` : v === null || v === "" ? "(empty)" : String(v)}</dd>
              </div>
            ))}
          </dl>
        </Notice>
      ) : null}
      {flags.length ? (
        <Notice tone="waiting" title="Flags">
          <ul className="list-disc pl-5">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
        </Notice>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Gallery photos={photos} title={l.title ?? ""} />
          <dl className="grid grid-cols-2 gap-2 text-label">
            <div className="rounded-control border border-line bg-surface p-3"><dt className="text-muted">Layout</dt><dd className="font-semibold">{layoutLabel(l.unit)}</dd></div>
            <div className="rounded-control border border-line bg-surface p-3"><dt className="text-muted">Location</dt><dd className="font-semibold">{[l.location.area, l.location.road, l.location.town].filter(Boolean).join(", ")}</dd></div>
            <div className="rounded-control border border-line bg-surface p-3"><dt className="text-muted">Advertiser</dt><dd className="font-semibold">{l.advertiser.name} · {ADVERTISER_ROLE_LABEL[l.advertiser.role]}</dd></div>
            <div className="rounded-control border border-line bg-surface p-3"><dt className="text-muted">Available from</dt><dd className="font-semibold">{formatDate(l.available_from)}</dd></div>
          </dl>
          <ul className="flex flex-wrap gap-1.5 text-caption">
            {FACTS.map((f) => <li key={f.key} className="rounded-chip bg-cool px-2 py-1">{f.label}: <strong>{l.unit.facts?.[f.key] ?? "unknown"}</strong></li>)}
          </ul>
          {l.description ? <p className="text-body whitespace-pre-line">{l.description}</p> : null}
        </div>
        <div className="flex flex-col gap-4">
          <CostBreakdown rent={l.rent_amount} depositAmount={l.deposit_amount} depositMonths={l.deposit_months} charges={l.charges} pricePeriod={l.price_period} priceBasis={l.price_basis} />
          <section className="surface p-4 text-label">
            <h2 className="font-semibold">Checks recorded for this advertiser</h2>
            <p className="text-muted">Identity: {l.advertiser.identity_checked_at ? formatDate(l.advertiser.identity_checked_at) : "not checked"} · Authority: {l.advertiser.authority_checked_at ? formatDate(l.advertiser.authority_checked_at) : "not checked"} · Visit: {l.advertiser.property_visited_at ? formatDate(l.advertiser.property_visited_at) : "not visited"}</p>
            <Link href="/admin/onboarding" className="link-action">Record checks in onboarding</Link>
          </section>
          {row.status === "under_review" ? <ReviewDecision listingId={id} /> : null}
        </div>
      </div>
    </div>
  );
}
