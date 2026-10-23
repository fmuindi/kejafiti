import type { Metadata } from "next";
import Link from "next/link";
import { ComparePicker } from "@/components/tenant/compare-picker";
import { DeleteSavedSearch } from "@/components/tenant/delete-saved-search";
import { ListingCard, type SearchRow } from "@/components/tenant/listing-card";
import { PageHeader } from "@/components/shell/page-header";
import { TenantJumps } from "@/components/shell/tenant-jumps";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, EmptyState } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { signListingPhotos } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Saved" };

export default async function SavedPage() {
  const user = await requireUser("/saved");
  const supabase = await createClient();
  const [{ data: saved }, { data: searches }] = await Promise.all([
    // Tenants can't read listings directly, so a listings(...) embed came back null (IMP-02).
    supabase.rpc("my_saved_listings"),
    supabase.from("saved_searches").select("id, label, params, alert_frequency, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  // Re-read published homes through the public search function so cards show only public fields.
  const refs = (saved ?? []).filter((s) => s.status === "published").map((s) => s.ref);
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
        fixed_monthly_total: (l as unknown as { fixed_monthly_total: number | null }).fixed_monthly_total ?? null,
        move_in_total: (l as unknown as { move_in_total: number | null }).move_in_total ?? null,
        totals_complete: !!(l as unknown as { totals_complete?: boolean }).totals_complete,
      });
    }
  }
  const photos = await signListingPhotos(supabase, cards.map((c) => c.cover_path));
  const gone = (saved ?? []).filter((s) => s.status !== "published");

  const meta = [cards.length ? `${cards.length} home${cards.length === 1 ? "" : "s"}` : null, searches?.length ? `${searches.length} search${searches.length === 1 ? "" : "es"}` : null].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-4 pt-5 pb-10">
      <PageHeader icon="heart" title="Saved" meta={meta || null} />
      <TenantJumps current="/saved" />
      {cards.length === 0 && gone.length === 0 && !searches?.length ? (
        <EmptyState title="Nothing saved yet" icon="heart" action={<ButtonLink href="/search" icon="search">Find a home</ButtonLink>}>
          Tap ♥ on any home to keep it here.
        </EmptyState>
      ) : null}
      {searches?.length ? (
        <section aria-labelledby="ss" className="flex flex-col gap-2">
          <h2 id="ss" className="flex items-center gap-2 text-[15px] font-semibold text-muted"><Icon name="search" size={16} /> Searches</h2>
          <ul className="flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {searches.map((s) => (
              <li key={s.id} className="flex items-center gap-2 pr-2">
                <Link href={`/search?${(s.params as { query?: string }).query ?? ""}`} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 hover:bg-cool">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.label}</span>
                    <span className="text-[12.5px] text-muted">Saved {formatDate(s.created_at, { year: false })}</span>
                  </span>
                  <Icon name="arrowRight" size={18} className="shrink-0 text-primary" />
                </Link>
                <DeleteSavedSearch id={s.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {cards.length ? (
        <section aria-labelledby="sh" className="flex flex-col gap-3">
          <h2 id="sh" className="sr-only">Saved homes</h2>
          <ComparePicker homes={cards.map((c) => ({ ref: c.ref, label: `${c.title ?? c.area} · KES ${(c.fixed_monthly_total ?? c.rent_amount).toLocaleString("en-KE")}` }))} />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <li key={c.ref}>
                <ListingCard row={c} photoUrl={c.cover_path ? photos.get(c.cover_path) : undefined} saved signedIn returnTo="/saved" back="saved" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {gone.length ? (
        <ul className="flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
          {gone.map((l) => (
            <li key={l.listing_id}>
              <Link href={`/homes/${l.ref}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-cool">
                <span className="truncate font-semibold">{l.title ?? `Home in ${l.area}`}</span>
                <span className="shrink-0 rounded-full bg-error-tint px-2 text-[12px] font-semibold text-error">{l.let_on ? `Let ${formatDate(l.let_on, { year: false })}` : "Unavailable"}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
