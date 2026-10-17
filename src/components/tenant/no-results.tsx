import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { factLabel, toQuery, toRpcParams, type SearchParams } from "@/lib/listing/search";
import { formatAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

// No results: keep the search, name the constraint that blocks results, and offer explicit
// alternatives with real counts. Nothing is changed silently.

type Alt = { label: string; detail: string; count: number; href: string };

async function countFor(p: SearchParams) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_listings", { params: toRpcParams(p, { limit: 1, offset: 0 }) });
  const rows = (data ?? []) as Array<{ total_count: number; rent_amount: number; fixed_monthly_total: number | null }>;
  return { count: rows[0]?.total_count ?? 0, rows };
}

async function cheapest(p: SearchParams) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_listings", {
    params: toRpcParams({ ...p, max: undefined, sort: "lowest_total" }, { limit: 1, offset: 0 }),
  });
  const r = (data ?? [])[0] as { rent_amount: number; fixed_monthly_total: number | null } | undefined;
  if (!r) return null;
  return p.basis === "fixed" ? (r.fixed_monthly_total ?? r.rent_amount) : r.rent_amount;
}

export async function NoResults({ params: p }: { params: SearchParams }) {
  const alts: Alt[] = [];
  let headline = "No homes match everything yet.";
  let explanation = "Nothing has been changed. Pick an option, or keep your search as it is.";

  if (p.max) {
    const low = await cheapest(p);
    if (low && low > p.max) {
      const raised = Math.ceil(low / 1000) * 1000;
      const { count } = await countFor({ ...p, max: raised });
      headline = "Budget is what's holding this search back.";
      explanation = `The cheapest match right now is KES ${formatAmount(low)}. Nothing has been changed. Pick an option, or keep your search as it is.`;
      if (count) alts.push({ label: `Raise budget to KES ${formatAmount(raised)}`, detail: "Keeps everything else", count, href: `/search?${toQuery({ ...p, max: raised, page: 1 })}` });
    }
  }
  if (p.must.length && !p.unconfirmed) {
    const { count } = await countFor({ ...p, unconfirmed: true });
    if (count) alts.push({ label: "Include unconfirmed answers", detail: "Advertiser hasn't said yes or no", count, href: `/search?${toQuery({ ...p, unconfirmed: true, page: 1 })}` });
  }
  for (const m of p.must) {
    const { count } = await countFor({ ...p, must: p.must.filter((x) => x !== m) });
    if (count) alts.push({ label: `Without "${factLabel(m)}"`, detail: "Keeps your area and budget", count, href: `/search?${toQuery({ ...p, must: p.must.filter((x) => x !== m), page: 1 })}` });
  }
  if (p.types.length) {
    const { count } = await countFor({ ...p, types: [] });
    if (count) alts.push({ label: "Any layout", detail: "Same area and budget", count, href: `/search?${toQuery({ ...p, types: [], page: 1 })}` });
  }
  if (p.q) {
    const { count } = await countFor({ ...p, q: undefined });
    if (count) alts.push({ label: "Search everywhere", detail: `Not only ${p.q}`, count, href: `/search?${toQuery({ ...p, q: undefined, page: 1 })}` });
  }

  return (
    <section className="mt-6 max-w-xl" aria-labelledby="none">
      <p className="font-mono text-[12px] tracking-[0.6px] text-muted">0 HOMES MATCH EVERYTHING</p>
      <h2 id="none" className="mt-2 font-display text-[28px] leading-[1.08] font-bold tracking-[-0.8px]">
        {headline}
      </h2>
      <p className="mt-2 text-[15px] text-muted">{explanation}</p>
      {alts.length ? (
        <ul className="mt-5 flex flex-col gap-2">
          {alts.slice(0, 4).map((a) => (
            <li key={a.label}>
              <Link href={a.href} className="flex min-h-[64px] items-center gap-3 rounded-[16px] border border-line bg-surface px-4 hover:border-ink">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{a.label}</span>
                  <span className="text-[13px] text-muted">{a.detail}</span>
                </span>
                <span className="font-mono text-[13px] font-medium">
                  {a.count} home{a.count === 1 ? "" : "s"}
                </span>
                <Icon name="chevronRight" className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-[15px]">There are no published homes for these filters yet. Save the search to hear when one is listed.</p>
      )}
    </section>
  );
}
