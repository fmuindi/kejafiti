import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactSheet } from "@/components/tenant/contact-sheet";
import { CostBreakdown } from "@/components/tenant/cost-breakdown";
import { Gallery } from "@/components/tenant/gallery";
import { ListingUnavailable } from "@/components/tenant/listing-unavailable";
import { ReportListing } from "@/components/tenant/report-listing";
import { SaveButton } from "@/components/tenant/save-button";
import { Icon } from "@/components/ui/icon";
import { Avatar, ButtonLink, Notice, cx } from "@/components/ui/primitives";
import { getSessionUser } from "@/lib/auth";
import { ADVERTISER_ROLE_LABEL, FACTS, STYLE_LABEL, layoutLabel } from "@/lib/listing/catalog";
import { isOpenListing, type ClosedListing, type PublicListing } from "@/lib/listing/types";
import { daysSince, formatDate } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { signListingPhotos } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

async function load(ref: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_listing", { p_ref: ref });
  return { supabase, listing: data as unknown as PublicListing | ClosedListing | null };
}

export async function generateMetadata({ params }: PageProps<"/homes/[ref]">): Promise<Metadata> {
  const { ref } = await params;
  const { listing } = await load(ref);
  if (!listing) return { title: "Home not found" };
  if (!isOpenListing(listing)) return { title: "No longer available", robots: { index: false } };
  const title = listing.title ?? `${layoutLabel(listing.unit)} in ${listing.location.area}`;
  return {
    title: `${title} · KES ${formatAmount(listing.rent_amount)}`,
    description: `${title}, ${listing.location.area}. Rent KES ${formatAmount(listing.rent_amount)} per ${listing.price_period}; move-in total KES ${formatAmount(listing.move_in_total)}.`,
    alternates: { canonical: `/homes/${ref}` },
  };
}

function FactTile({ label, value, unknown }: { label: string; value: string; unknown?: boolean }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface px-3.5 py-3">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className={cx("mt-0.5 font-semibold", unknown && "text-waiting-strong")}>{value}</p>
    </div>
  );
}

const yn = (v: string | undefined) => (v === "yes" ? "Yes" : v === "no" ? "No" : "Unknown");

export default async function ListingPage({ params }: PageProps<"/homes/[ref]">) {
  const { ref } = await params;
  const { supabase, listing } = await load(ref);
  if (!listing) notFound();
  if (!isOpenListing(listing)) return <ListingUnavailable listing={listing} />;

  const user = await getSessionUser();
  const [photoUrls, savedRow, myViewing] = await Promise.all([
    signListingPhotos(supabase, listing.photos.map((p) => p.path)),
    user ? supabase.from("saved_listings").select("listing_id").eq("listing_id", listing.id).maybeSingle() : Promise.resolve({ data: null }),
    user
      ? supabase.from("viewings").select("id, status, requested_start, confirmed_start, proposed_start").eq("listing_id", listing.id).eq("tenant_id", user.id).in("status", ["requested", "new_time_proposed", "confirmed"]).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const photos = listing.photos
    .map((p) => ({ url: photoUrls.get(p.path) ?? "", label: p.label, alt: p.alt }))
    .filter((p) => p.url);

  const u = listing.unit;
  const f = u.facts ?? {};
  const title = listing.title ?? `${layoutLabel(u)} · ${listing.location.area}`;
  const age = daysSince(listing.availability_confirmed_at);
  const stale = age !== null && age > 10;
  const adv = listing.advertiser;
  const returnTo = `/homes/${ref}`;
  const viewing = myViewing.data as { status: string; requested_start: string; confirmed_start: string | null } | null;

  const bathroom =
    f.private_bathroom === "yes" ? "Private" : f.private_bathroom === "no" ? "Shared" : "Unknown";
  const otherFacts = FACTS.filter((x) => !["private_bathroom", "parking"].includes(x.key) && f[x.key] && f[x.key] !== "unknown");

  return (
    <div className="mx-auto max-w-[1100px] pb-28 md:px-6 md:pt-6 md:pb-12">
      <div className="no-print flex items-center justify-between px-4 py-3 md:px-0">
        <Link href="/search" className="inline-flex min-h-11 items-center gap-1 font-semibold">
          <Icon name="chevronLeft" /> Back to results
        </Link>
        <SaveButton refId={ref} saved={!!savedRow.data} signedIn={!!user} returnTo={returnTo} />
      </div>

      <div className="md:grid md:grid-cols-[1.25fr_1fr] md:gap-8">
        <div>
          <Gallery photos={photos} title={title} />
          <div className="px-4 pt-4 md:px-0">
            <p className={cx("inline-flex items-center gap-1.5 text-[13.5px] font-semibold", stale ? "text-waiting" : "text-success")}>
              <Icon name={stale ? "clock" : "check"} size={16} strokeWidth={2.2} />
              {listing.available_from ? `Available from ${formatDate(listing.available_from, { year: false })}` : "Availability date not set"}
              {listing.availability_confirmed_at
                ? ` · ${ADVERTISER_ROLE_LABEL[adv.role]?.toLowerCase() ?? "advertiser"} confirmed ${formatDate(listing.availability_confirmed_at, { year: false })}`
                : ""}
            </p>
            <h1 className="mt-2 font-display text-[26px] leading-[1.1] font-bold tracking-[-0.5px] md:text-[34px]">{title}</h1>
            <p className="mt-1 inline-flex items-center gap-1 text-[14.5px] text-muted">
              <Icon name="pin" size={16} />
              {[listing.location.area, listing.location.road].filter(Boolean).join(", ")} · approximate location
            </p>
            <p className="mt-3 md:hidden">
              <span className="font-display text-[26px] font-extrabold">KES {formatAmount(listing.rent_amount)}</span>
              <span className="text-muted"> / {listing.price_period}</span>
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <FactTile label="Layout" value={`${layoutLabel(u)}${u.building_style ? ` · ${STYLE_LABEL[u.building_style] ?? ""}` : ""}`} />
              <FactTile label="Bathroom" value={bathroom} unknown={bathroom === "Unknown"} />
              <FactTile label="Size" value={u.size_sqm ? `${u.size_sqm} m² owner-reported` : "Not given"} unknown={!u.size_sqm} />
              <FactTile label="Parking" value={yn(f.parking)} unknown={yn(f.parking) === "Unknown"} />
              {u.floor_level !== null ? (
                <FactTile label="Floor" value={u.floor_level === 0 ? "Ground floor" : `Floor ${u.floor_level}${f.lift === "yes" ? ", lift" : f.lift === "no" ? ", stairs" : ""}`} />
              ) : null}
              <FactTile
                label="Furnishing"
                value={listing.furnishing === "fully" ? "Furnished" : listing.furnishing === "partly" ? "Partly furnished" : listing.furnishing === "unfurnished" ? "Unfurnished" : "Not given"}
                unknown={!listing.furnishing}
              />
            </div>
            {otherFacts.length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Other facts">
                {otherFacts.map((x) => (
                  <li key={x.key} className="rounded-[8px] bg-cool px-2.5 py-1 text-[13px]">
                    {x.label}: <strong>{yn(f[x.key])}</strong>
                  </li>
                ))}
              </ul>
            ) : null}
            {listing.description ? <p className="mt-4 text-[15px] whitespace-pre-line">{listing.description}</p> : null}
            {listing.house_rules ? (
              <div className="mt-4">
                <h2 className="font-semibold">House rules</h2>
                <p className="mt-1 text-[14.5px] whitespace-pre-line text-muted">{listing.house_rules}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 px-4 md:mt-0 md:px-0">
          {listing.is_staff ? (
            <Notice tone="info" title="You manage this listing">
              This is how tenants see it. Status: {listing.status.replace("_", " ")}.
            </Notice>
          ) : null}
          <CostBreakdown
            rent={listing.rent_amount}
            depositAmount={listing.deposit_amount}
            depositMonths={listing.deposit_months}
            charges={listing.charges}
            pricePeriod={listing.price_period}
            priceBasis={listing.price_basis}
          />

          <section aria-labelledby="adv" className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <Avatar name={adv.name} />
              <div>
                <h2 id="adv" className="font-semibold">
                  {adv.name}
                </h2>
                <p className="text-[13.5px] text-muted">
                  {ADVERTISER_ROLE_LABEL[adv.role] ?? "Advertiser"}
                  {adv.usually_replies ? ` · ${adv.usually_replies}` : ""}
                </p>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5 text-[14px]">
              {adv.identity_checked_at ? (
                <li className="flex items-center gap-2"><Icon name="check" size={16} className="text-deep" /> Identity checked · {formatDate(adv.identity_checked_at)}</li>
              ) : null}
              {adv.authority_checked_at ? (
                <li className="flex items-center gap-2"><Icon name="check" size={16} className="text-deep" /> Authority to advertise checked · {formatDate(adv.authority_checked_at)}</li>
              ) : null}
              {adv.property_visited_at ? (
                <li className="flex items-center gap-2"><Icon name="check" size={16} className="text-deep" /> Property visited by our team · {formatDate(adv.property_visited_at)}</li>
              ) : null}
              {!adv.identity_checked_at && !adv.authority_checked_at && !adv.property_visited_at ? (
                <li className="text-muted">No checks recorded yet. We label each check with its date when it happens.</li>
              ) : null}
            </ul>
            <p className="text-[12.5px] text-muted">Never pay a deposit before viewing the home and meeting the advertiser.</p>
            <ReportListing refId={ref} signedIn={!!user} />
          </section>

          {listing.viewing_instructions || listing.viewing_address ? (
            <Notice tone="success" title="Your viewing is confirmed">
              {listing.viewing_address ? <p>{listing.viewing_address}</p> : null}
              {listing.viewing_instructions ? <p>{listing.viewing_instructions}</p> : null}
            </Notice>
          ) : null}
        </div>
      </div>

      <div className="no-print safe-bottom fixed inset-x-0 bottom-[58px] z-20 border-t border-line bg-surface px-4 pt-3 md:static md:mt-8 md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-[1100px] gap-3 md:justify-end">
          <ContactSheet
            refId={ref}
            advertiser={adv}
            listingTitle={title}
            signedIn={!!user}
          />
          {viewing ? (
            <ButtonLink href="/viewings" variant="secondary" size="lg" className="flex-1 md:flex-none">
              {viewing.status === "confirmed" ? "Viewing confirmed" : "Viewing requested · not confirmed yet"}
            </ButtonLink>
          ) : listing.is_staff ? null : (
            <ButtonLink href={`/homes/${ref}/viewing`} size="lg" className="flex-1 md:flex-none">
              Request viewing
            </ButtonLink>
          )}
        </div>
      </div>
    </div>
  );
}
