"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { RADII, toQuery, type SearchParams } from "@/lib/listing/search";

const OPTIONS: Array<{ value: SearchParams["sort"]; label: string }> = [
  { value: "relevant", label: "Most relevant" },
  { value: "lowest_total", label: "Lowest monthly total" },
  { value: "recent", label: "Recently confirmed" },
  { value: "newest", label: "Newest" },
  { value: "nearest", label: "Nearest first" },
];

export function SortSelect({ value, query }: { value: SearchParams["sort"]; query: SearchParams }) {
  const router = useRouter();
  return (
    <label className="relative inline-flex min-h-11 max-w-full min-w-0 items-center rounded-control border border-line bg-surface pr-9 pl-3 text-body focus-within:ring-2 focus-within:ring-deep/40">
      <span className="shrink-0 text-muted">Sort:&nbsp;</span>
      <select
        value={value}
        onChange={(e) => router.push(`/search?${toQuery({ ...query, sort: e.target.value as SearchParams["sort"], page: 1 })}`)}
        className="min-w-0 flex-1 appearance-none truncate bg-transparent font-semibold focus:outline-none"
      >
        {OPTIONS.filter((o) => o.value !== "nearest" || query.lat !== undefined).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-3 text-muted" />
    </label>
  );
}

/** Distance from the picked place. Shown only for a place search. */
export function RadiusSelect({ query }: { query: SearchParams }) {
  const router = useRouter();
  return (
    <label className="relative inline-flex min-h-11 max-w-full min-w-0 items-center rounded-control border border-line bg-surface pr-9 pl-3 text-body focus-within:ring-2 focus-within:ring-deep/40">
      <span className="shrink-0 text-muted">Within:&nbsp;</span>
      <select
        value={query.r}
        onChange={(e) => router.push(`/search?${toQuery({ ...query, r: Number(e.target.value), page: 1 })}`)}
        className="min-w-0 flex-1 appearance-none truncate bg-transparent font-semibold focus:outline-none"
      >
        {RADII.map((r) => (
          <option key={r} value={r}>
            {r} km
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-3 text-muted" />
    </label>
  );
}
