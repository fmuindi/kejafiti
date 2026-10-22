import type { Metadata } from "next";
import Link from "next/link";
import { FiltersSheet } from "@/components/tenant/filters-sheet";
import { ListingCard, type SearchRow } from "@/components/tenant/listing-card";
import { NoResults } from "@/components/tenant/no-results";
import { RememberSearch } from "@/components/tenant/remember-search";
import { SaveSearchButton } from "@/components/tenant/save-search";
import { ResultsLocation } from "@/components/tenant/results-location";
import { RadiusSelect, SortSelect } from "@/components/tenant/sort-select";
import { Icon } from "@/components/ui/icon";
import { Notice, cx } from "@/components/ui/primitives";
import { getSessionUser } from "@/lib/auth";
import { CATEGORIES, HOME_TYPES } from "@/lib/listing/catalog";
import { AI } from "@/lib/ai/config";
import { AiInterpretation } from "@/components/search/ai-interpretation";
import { VoiceSearch } from "@/components/search/ai-search";
import { PAGE_SIZE, describeSearch, factLabel, parseSearch, toQuery, toRpcParams, type SearchParams } from "@/lib/listing/search";
import { formatAmount } from "@/lib/money";
import { PLACES_ENABLED } from "@/lib/places";
import { signListingPhotos } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const { title } = describeSearch(parseSearch(await searchParams));
  return { title, robots: { index: false } };
}

function removeChip(p: SearchParams, change: Partial<SearchParams>) {
  return `/search?${toQuery({ ...p, ...change, page: 1 })}`;
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const p = parseSearch(await searchParams);
  const supabase = await createClient();
  const user = await getSessionUser();

  const [{ data, error }, unconfirmed, saved] = await Promise.all([
    supabase.rpc("search_listings", { params: toRpcParams(p) }),
    p.must.length && !p.unconfirmed
      ? supabase.rpc("search_listings", { params: toRpcParams(p, { includeUnconfirmed: true, limit: 1, offset: 0 }) })
      : Promise.resolve({ data: null }),
    user ? supabase.rpc("my_saved_listings") : Promise.resolve({ data: [] }),
  ]);

  const rows = (data ?? []) as unknown as Array<SearchRow & { total_count: number }>;
  const total = rows[0]?.total_count ?? 0;
  const withUnconfirmed = ((unconfirmed.data ?? []) as Array<{ total_count: number }>)[0]?.total_count ?? total;
  const extra = Math.max(0, withUnconfirmed - total);
  const savedRefs = new Set(((saved.data ?? []) as Array<{ ref: string }>).map((s) => s.ref));
  const photos = await signListingPhotos(supabase, rows.map((r) => r.cover_path));
  const { title, subtitle } = describeSearch(p);
  const query = toQuery(p);
  const returnTo = `/search?${query}`;

  const chips: Array<{ label: string; href: string }> = [
    ...p.types.map((t) => ({ label: HOME_TYPES.find((h) => h.value === t)?.label ?? t, href: removeChip(p, { types: p.types.filter((x) => x !== t) }) })),
    ...(p.max ? [{ label: `${p.basis === "movein" ? "Move-in" : p.basis === "fixed" ? "Rent + charges" : "Rent"} up to KES ${formatAmount(p.max)}`, href: removeChip(p, { max: undefined, basis: "rent" }) }] : []),
    ...p.must.map((m) => ({ label: factLabel(m), href: removeChip(p, { must: p.must.filter((x) => x !== m) }) })),
    ...p.prefer.map((m) => ({ label: `Nice to have: ${factLabel(m)}`, href: removeChip(p, { prefer: p.prefer.filter((x) => x !== m) }) })),
    ...(p.furnishing ? [{ label: p.furnishing === "furnished" ? "Furnished" : "Unfurnished", href: removeChip(p, { furnishing: undefined }) }] : []),
    ...(p.by ? [{ label: p.by === "landlord" ? "Direct landlord" : "Agent or manager", href: removeChip(p, { by: undefined }) }] : []),
    ...(p.min ? [{ label: `From KES ${formatAmount(p.min)}`, href: removeChip(p, { min: undefined }) }] : []),
    ...(p.movein ? [{ label: `Move in by ${p.movein}`, href: removeChip(p, { movein: undefined }) }] : []),
    ...(p.unconfirmed ? [{ label: "Including unconfirmed", href: removeChip(p, { unconfirmed: false }) }] : []),
  ];
  const filterCount = chips.length;

  return (
    <div className="mx-auto max-w-[1360px] px-4 pt-4 pb-10 md:px-6 md:pt-6">
      <RememberSearch label={`${p.q ?? "Anywhere"} · ${subtitle}`} query={query} />
      <div className="mb-3 max-w-xl">
        <ResultsLocation
          placesEnabled={PLACES_ENABLED}
          q={p.q}
          lat={p.lat}
          lng={p.lng}
          r={p.r}
          keep={[...new URLSearchParams(toQuery({ ...p, q: undefined, lat: undefined, lng: undefined, page: 1 })).entries()]}
        />
      </div>
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-cream/95 px-4 pt-1 pb-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Back to Explore" className="grid size-10 place-items-center rounded-full md:hidden">
            <Icon name="chevronLeft" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[20px] font-bold md:text-[34px] md:tracking-[-1px]">{title}</h1>
            <p className="truncate text-[13px] text-muted md:text-[15px]">{subtitle}</p>
          </div>
          <SaveSearchButton label={`${title} · ${subtitle}`} query={query} signedIn={!!user} />
        </div>

        <nav aria-label="Home types" className="-mx-4 mt-3 hidden gap-1 overflow-x-auto px-4 md:mx-0 md:flex md:px-0">
          {CATEGORIES.map((c) => (
            <Link
              key={c.value}
              href={`/search?${toQuery({ ...p, category: p.category === c.value ? undefined : c.value, page: 1 })}`}
              aria-current={p.category === c.value ? "true" : undefined}
              className={cx(
                "border-b-2 px-3 py-2 text-[15px] whitespace-nowrap",
                p.category === c.value ? "border-primary font-semibold" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {c.label}
            </Link>
          ))}
        </nav>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FiltersSheet params={p} count={filterCount} />
          {p.lat !== undefined ? <RadiusSelect query={p} /> : null}
          <SortSelect value={p.sort} query={p} />
        </div>
        {chips.length ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Active filters">
            {chips.map((c) => (
              <li key={c.label}>
                <Link
                  href={c.href}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border-[1.5px] border-primary bg-pink px-3 text-[13.5px] font-semibold text-primary-hover"
                >
                  {c.label}
                  <Icon name="x" size={14} strokeWidth={2.4} />
                  <span className="sr-only">Remove filter</span>
                </Link>
              </li>
            ))}
            <li>
              <Link href={`/search?${toQuery({ q: p.q, lat: p.lat, lng: p.lng, r: p.r, max: p.max, category: p.category })}`} className="inline-flex min-h-9 items-center px-2 text-[13.5px] font-semibold text-ink underline">
                Clear all
              </Link>
            </li>
          </ul>
        ) : null}
      </div>
      {AI.searchEnabled() ? (
        <div className="mt-4 max-w-xl">
          <AiInterpretation query={query} />
          <VoiceSearch currentQuery={query} serverVoice={AI.voiceEnabled()} />
        </div>
      ) : null}

      {error ? (
        <Notice tone="error" role="alert" className="mt-4" title="We couldn't load homes right now.">
          Your search is kept. Check your connection and try again.
        </Notice>
      ) : total === 0 ? (
        <NoResults params={p} />
      ) : (
        <>
          <p className="mt-4 text-[14px]" aria-live="polite">
            <strong>
              {total} home{total === 1 ? "" : "s"}
            </strong>{" "}
            match.
            {p.max || p.min ? <span className="text-muted"> Budgets compare homes priced per month.</span> : null}
            {extra > 0 ? (
              <>
                {" "}
                {extra} more {extra === 1 ? "has" : "have"} an unconfirmed must-have.{" "}
                <Link href={removeChip(p, { unconfirmed: true })} className="font-semibold text-primary underline">
                  Include them
                </Link>
              </>
            ) : null}
          </p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <li key={r.ref} className="flex">
                <div className="w-full">
                  <ListingCard row={r} photoUrl={r.cover_path ? photos.get(r.cover_path) : undefined} saved={savedRefs.has(r.ref)} signedIn={!!user} returnTo={returnTo} back={query} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col items-center gap-3">
            <p className="text-[14px] text-muted">
              Showing {(p.page - 1) * PAGE_SIZE + 1}–{(p.page - 1) * PAGE_SIZE + rows.length} of {total} homes
            </p>
            <div className="flex gap-2">
              {p.page > 1 ? (
                <Link href={`/search?${toQuery({ ...p, page: p.page - 1 })}`} className="rounded-[12px] border-[1.5px] border-ink px-4 py-2.5 font-semibold">
                  Previous
                </Link>
              ) : null}
              {p.page * PAGE_SIZE < total ? (
                <Link href={`/search?${toQuery({ ...p, page: p.page + 1 })}`} className="rounded-[12px] border-[1.5px] border-ink px-4 py-2.5 font-semibold">
                  Show more homes
                </Link>
              ) : null}
            </div>
            <p className="max-w-xl text-center text-[12.5px] text-muted">
              Sponsored homes are paid placements. They still match every filter you set and get the same checks as other
              listings.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
