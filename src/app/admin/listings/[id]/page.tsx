import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewDecision } from "@/components/admin/review-decision";
import { CostBreakdown } from "@/components/tenant/cost-breakdown";
import { Gallery } from "@/components/tenant/gallery";
import { Icon } from "@/components/ui/icon";
import { Notice, StatusBadge } from "@/components/ui/primitives";
import { ADVERTISER_ROLE_LABEL, FACTS, layoutLabel } from "@/lib/listing/catalog";
import { formatDate } from "@/lib/dates";
import type { PublicListing } from "@/lib/listing/types";
import { signListingPhotos } from "@/lib/storage";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review listing" };

export default async function AdminListingPage({ params }: PageProps<"/admin/listings/[id]">) {
  // Layouts and pages render in parallel, so every admin page checks for itself.
  await requirePlatformAdmin("/admin");
  const { id } = await params;
  const supabase = await createClient();
  const { data: row } = await supabase.from("listings").select("ref, status, flags, submitted_at, org_id").eq("id", id).maybeSingle();
  if (!row) notFound();
  const { data } = await supabase.rpc("get_listing", { p_ref: row.ref });
  const l = data as unknown as PublicListing;
  if (!l || !("unit" in l)) notFound();
  const urls = await signListingPhotos(supabase, l.photos.map((p) => p.path));
  const photos = l.photos.map((p) => ({ url: urls.get(p.path) ?? "", label: p.label, alt: p.alt })).filter((p) => p.url);
  const flags = (row.flags as string[]) ?? [];

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-1 self-start font-semibold"><Icon name="chevronLeft" /> Review queue</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[28px] font-bold">{l.title}</h1>
        <StatusBadge tone={row.status === "under_review" ? "waiting" : row.status === "published" ? "success" : "neutral"}>{row.status.replace("_", " ")}</StatusBadge>
        <span className="font-mono text-[13px] text-muted">{row.ref}</span>
      </div>
      {flags.length ? (
        <Notice tone="waiting" title="Flags">
          <ul className="list-disc pl-5">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
        </Notice>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Gallery photos={photos} title={l.title ?? ""} />
          <dl className="grid grid-cols-2 gap-2 text-[14px]">
            <div className="rounded-[12px] border border-line bg-surface p-3"><dt className="text-muted">Layout</dt><dd className="font-semibold">{layoutLabel(l.unit)}</dd></div>
            <div className="rounded-[12px] border border-line bg-surface p-3"><dt className="text-muted">Location</dt><dd className="font-semibold">{[l.location.area, l.location.road, l.location.town].filter(Boolean).join(", ")}</dd></div>
            <div className="rounded-[12px] border border-line bg-surface p-3"><dt className="text-muted">Advertiser</dt><dd className="font-semibold">{l.advertiser.name} · {ADVERTISER_ROLE_LABEL[l.advertiser.role]}</dd></div>
            <div className="rounded-[12px] border border-line bg-surface p-3"><dt className="text-muted">Available from</dt><dd className="font-semibold">{formatDate(l.available_from)}</dd></div>
          </dl>
          <ul className="flex flex-wrap gap-1.5 text-[13px]">
            {FACTS.map((f) => <li key={f.key} className="rounded-[8px] bg-cool px-2 py-1">{f.label}: <strong>{l.unit.facts?.[f.key] ?? "unknown"}</strong></li>)}
          </ul>
          {l.description ? <p className="text-[14.5px] whitespace-pre-line">{l.description}</p> : null}
        </div>
        <div className="flex flex-col gap-4">
          <CostBreakdown rent={l.rent_amount} depositAmount={l.deposit_amount} depositMonths={l.deposit_months} charges={l.charges} pricePeriod={l.price_period} priceBasis={l.price_basis} />
          <section className="rounded-[16px] border border-line bg-surface p-4 text-[14px]">
            <h2 className="font-semibold">Checks recorded for this advertiser</h2>
            <p className="text-muted">Identity: {l.advertiser.identity_checked_at ? formatDate(l.advertiser.identity_checked_at) : "not checked"} · Authority: {l.advertiser.authority_checked_at ? formatDate(l.advertiser.authority_checked_at) : "not checked"} · Visit: {l.advertiser.property_visited_at ? formatDate(l.advertiser.property_visited_at) : "not visited"}</p>
            <Link href="/admin/onboarding" className="font-semibold text-primary underline">Record checks in onboarding</Link>
          </section>
          {row.status === "under_review" ? <ReviewDecision listingId={id} /> : null}
        </div>
      </div>
    </div>
  );
}
