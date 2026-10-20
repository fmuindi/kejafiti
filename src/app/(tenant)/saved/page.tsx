import type { Metadata } from "next";
import Link from "next/link";
import { DeleteSavedSearch } from "@/components/tenant/delete-saved-search";
import { ListingCard, type SearchRow } from "@/components/tenant/listing-card";
import { ButtonLink, EmptyState, PageTitle } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { signListingPhotos } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Saved homes" };

export default async function SavedPage() {
  const user = await requireUser("/saved");
  const supabase = await createClient();
  const [{ data: saved }, { data: searches }] = await Promise.all([
    supabase.from("saved_listings").select("listing_id, created_at, listings(ref, status, let_on, title)").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("saved_searches").select("id, label, params, alert_frequency, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  // Re-read published homes through the public search function so cards show only public fields.
  const refs = (saved ?? []).map((s) => (s.listings as unknown as { ref: string } | null)?.ref).filter(Boolean) as string[];
  const cards: SearchRow[] = [];
  for (const ref of refs) {
    const { data } = await supabase.rpc("get_listing", { p_ref: ref });
    const l = data as unknown as (SearchRow & { unit: SearchRow & { facts: Record<string, string> }; location: { area: string; road: string | null }; photos: Array<{ path: string; thumb: string | null }>; advertiser: { role: string } }) | null;
    if (l && "unit" in l) {
      cards.push({
        ...l,
        area: l.location.area,
        road: l.location.road,
        town: null,
        layout: l.unit.layout,
        bedrooms: l.unit.bedrooms,
        rental_scope: l.unit.rental_scope,
        facts: l.unit.facts,
        floor_level: l.unit.floor_level,
        advertiser_role: l.advertiser.role,
        sponsored: false,
        cover_path: l.photos[0]?.thumb ?? l.photos[0]?.path ?? null,
        photo_count: l.photos.length,
        unconfirmed_match: false,
        distance_km: null,
      });
    }
  }
  const photos = await signListingPhotos(supabase, cards.map((c) => c.cover_path));
  const gone = (saved ?? []).filter((s) => (s.listings as unknown as { status: string } | null)?.status !== "published");

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-4 pt-5 pb-10">
      <PageTitle>Saved</PageTitle>
      {searches?.length ? (
        <section aria-labelledby="ss">
          <h2 id="ss" className="font-display text-[18px] font-bold">Saved searches</h2>
          <ul className="mt-2 flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {searches.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <Link href={`/search?${(s.params as { query?: string }).query ?? ""}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate font-semibold">{s.label}</span>
                  <span className="text-[13px] text-muted">Alert preference: {s.alert_frequency} · saved {formatDate(s.created_at)}</span>
                </Link>
                <DeleteSavedSearch id={s.id} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12.5px] text-muted">Matching-home alerts are not sent yet; this saves your filters so you can rerun them in one tap.</p>
        </section>
      ) : null}
      <section aria-labelledby="sh">
        <h2 id="sh" className="font-display text-[18px] font-bold">Saved homes</h2>
        {cards.length === 0 && gone.length === 0 ? (
          <div className="mt-2">
            <EmptyState title="No saved homes yet" icon="heart" action={<ButtonLink href="/search">Find a home</ButtonLink>}>Tap the heart on any listing to save it here.</EmptyState>
          </div>
        ) : (
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <li key={c.ref}>
                <ListingCard row={c} photoUrl={c.cover_path ? photos.get(c.cover_path) : undefined} saved signedIn returnTo="/saved" />
              </li>
            ))}
          </ul>
        )}
        {gone.length ? (
          <ul className="mt-4 flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {gone.map((s) => {
              const l = s.listings as unknown as { ref: string; title: string | null; let_on: string | null };
              return (
                <li key={s.listing_id}>
                  <Link href={`/homes/${l.ref}`} className="flex flex-col px-4 py-3 hover:bg-cool">
                    <span className="font-semibold">{l.title}</span>
                    <span className="text-[13px] font-semibold text-error">No longer available{l.let_on ? ` · let on ${formatDate(l.let_on, { year: false })}` : ""} · see similar homes</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
