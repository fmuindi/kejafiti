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
    <label className="relative inline-flex min-h-11 items-center rounded-[12px] border border-line bg-surface pr-9 pl-3 text-[0.90625rem] focus-within:ring-2 focus-within:ring-deep/40">
      <span className="text-muted">Sort:&nbsp;</span>
      <select
        value={value}
        onChange={(e) => router.push(`/search?${toQuery({ ...query, sort: e.target.value as SearchParams["sort"], page: 1 })}`)}
        className="appearance-none bg-transparent font-semibold focus:outline-none"
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
    <label className="relative inline-flex min-h-11 items-center rounded-[12px] border border-line bg-surface pr-9 pl-3 text-[0.90625rem] focus-within:ring-2 focus-within:ring-deep/40">
      <span className="text-muted">Within:&nbsp;</span>
      <select
        value={query.r}
        onChange={(e) => router.push(`/search?${toQuery({ ...query, r: Number(e.target.value), page: 1 })}`)}
        className="appearance-none bg-transparent font-semibold focus:outline-none"
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
