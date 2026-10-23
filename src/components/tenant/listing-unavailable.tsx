import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ButtonLink } from "@/components/ui/primitives";
import { layoutLabel } from "@/lib/listing/catalog";
import { formatDate } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import type { ClosedListing } from "@/lib/listing/types";
import { createClient } from "@/lib/supabase/server";

// Listing no longer available: booking actions are removed, any open viewing request was
// cancelled server-side (and kept in history), and labelled alternatives are offered.
export async function ListingUnavailable({ listing }: { listing: ClosedListing }) {
  const supabase = await createClient();
  const type =
    listing.layout === "bedsitter_studio" ? "bedsitter_studio"
    : listing.layout === "bedroom_home" && listing.bedrooms === 1 ? "1_bedroom"
    : listing.layout === "bedroom_home" && listing.bedrooms === 2 ? "2_bedrooms"
    : listing.layout === "bedroom_home" ? "3_plus_bedrooms"
    : listing.layout === "single_room" ? "single_room" : "double_room";
  const { data } = await supabase.rpc("search_listings", {
    params: { q: listing.area, home_types: [type], max_rent: listing.rent_amount ? Math.round(listing.rent_amount * 1.15) : null, limit: 3, sort: "recent" },
  });
  const similar = (data ?? []) as Array<{ ref: string; title: string | null; area: string; road: string | null; rent_amount: number; availability_confirmed_at: string | null; facts: Record<string, string> }>;
  const word = listing.status === "let" ? "No longer available" : listing.status === "paused" ? "Paused by the advertiser" : "Withdrawn";

  return (
    <div className="mx-auto max-w-[640px] px-4 pt-6 pb-12">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-error-tint px-3 py-1.5 text-[0.84375rem] font-semibold text-error">
        <Icon name="alert" size={15} strokeWidth={2.2} />
        {word}
        {listing.let_on ? ` · let on ${formatDate(listing.let_on, { year: false })}` : ""}
      </p>
      <h1 className="mt-3 font-display text-[1.5rem] leading-[1.1] font-bold tracking-[-0.5px]">
        {listing.title ?? `${layoutLabel(listing)} · ${listing.area}`}
      </h1>
      <p className="mt-2 text-[0.9375rem] text-muted">
        If you had a viewing request for this home, it was cancelled and the advertiser was told. It&apos;s kept in your
        history.
      </p>
      <section aria-labelledby="sim" className="mt-6">
        <h2 id="sim" className="font-display text-[1.125rem] font-bold">
          Similar, still available
        </h2>
        <p className="text-[0.84375rem] text-muted">Same area and layout, within about 15% of the price</p>
        {similar.length ? (
          <ul className="mt-3 flex flex-col divide-y divide-divider rounded-[18px] border border-line bg-surface">
            {similar.map((s) => (
              <li key={s.ref}>
                <Link href={`/homes/${s.ref}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-cool">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.title ?? s.area}</span>
                    <span className="text-[0.8125rem] text-success">
                      {s.availability_confirmed_at ? `Confirmed available ${formatDate(s.availability_confirmed_at, { year: false })}` : "Availability not confirmed"}
                    </span>
                  </span>
                  <span className="font-display text-[1.0625rem] font-bold">{formatAmount(s.rent_amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[0.90625rem]">No similar homes are listed right now.</p>
        )}
      </section>
      <ButtonLink href="/search" variant="secondary" size="lg" className="mt-6 w-full">
        Back to my search
      </ButtonLink>
    </div>
  );
}
