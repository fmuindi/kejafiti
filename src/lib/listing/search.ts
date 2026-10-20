import { CATEGORIES, FACTS, HOME_TYPES } from "./catalog";
import { formatAmount, parseAmount } from "@/lib/money";

// URL <-> search parameters. The URL is the source of truth so back navigation, shared
// links and sign-in redirects all preserve the search.

export type SearchParams = {
  q?: string;
  /** Picked place. With these set, q is the place's name and results are within r km of it. */
  lat?: number;
  lng?: number;
  r: number;
  max?: number;
  min?: number;
  basis: "rent" | "fixed";
  types: string[];
  must: string[];
  unconfirmed: boolean;
  furnishing?: "furnished" | "unfurnished";
  by?: "landlord" | "agent";
  movein?: string;
  category?: string;
  sort: "relevant" | "lowest_total" | "recent" | "newest" | "nearest";
  page: number;
};

export const PAGE_SIZE = 24;
export const RADII = [1, 3, 5, 10, 20] as const;
export const DEFAULT_RADIUS = 5;

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).flatMap((x) => x.split(","));

const TYPE_VALUES = new Set<string>(HOME_TYPES.map((t) => t.value));
const FACT_VALUES = new Set<string>(FACTS.map((f) => f.key));
const CAT_VALUES = new Set<string>(CATEGORIES.map((c) => c.value));

export function parseSearch(raw: Raw): SearchParams {
  const num = (k: string) => {
    const n = parseAmount(first(raw[k]) ?? null);
    return n !== null && Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const sort = first(raw.sort);
  const furnishing = first(raw.furnishing);
  const by = first(raw.by);
  const movein = first(raw.movein);
  const category = first(raw.category);
  const coord = (k: string, min: number, max: number) => {
    const n = Number(first(raw[k]));
    return first(raw[k]) && Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 1e5) / 1e5 : undefined;
  };
  const lat = coord("lat", -90, 90);
  const lng = coord("lng", -180, 180);
  const near = lat !== undefined && lng !== undefined;
  const r = Number(first(raw.r));
  return {
    q: first(raw.q)?.trim().slice(0, 80) || undefined,
    lat: near ? lat : undefined,
    lng: near ? lng : undefined,
    r: (RADII as readonly number[]).includes(r) ? r : DEFAULT_RADIUS,
    max: num("max"),
    min: num("min"),
    basis: first(raw.basis) === "fixed" ? "fixed" : "rent",
    types: all(raw.type).filter((t) => TYPE_VALUES.has(t)),
    must: all(raw.must).filter((m) => FACT_VALUES.has(m)),
    unconfirmed: first(raw.unconfirmed) === "1",
    furnishing: furnishing === "furnished" || furnishing === "unfurnished" ? furnishing : undefined,
    by: by === "landlord" || by === "agent" ? by : undefined,
    movein: movein && /^\d{4}-\d{2}-\d{2}$/.test(movein) ? movein : undefined,
    category: category && CAT_VALUES.has(category) ? category : undefined,
    sort: sort === "lowest_total" || sort === "recent" || sort === "newest" || (sort === "nearest" && near) ? sort : "relevant",
    page: Math.max(1, Math.min(50, Number(first(raw.page)) || 1)),
  };
}

export function toQuery(p: Partial<SearchParams>): string {
  const u = new URLSearchParams();
  if (p.q) u.set("q", p.q);
  if (p.lat !== undefined && p.lng !== undefined) {
    u.set("lat", String(p.lat));
    u.set("lng", String(p.lng));
    if (p.r && p.r !== DEFAULT_RADIUS) u.set("r", String(p.r));
  }
  if (p.max) u.set("max", String(p.max));
  if (p.min) u.set("min", String(p.min));
  if (p.basis === "fixed") u.set("basis", "fixed");
  for (const t of p.types ?? []) u.append("type", t);
  for (const m of p.must ?? []) u.append("must", m);
  if (p.unconfirmed) u.set("unconfirmed", "1");
  if (p.furnishing) u.set("furnishing", p.furnishing);
  if (p.by) u.set("by", p.by);
  if (p.movein) u.set("movein", p.movein);
  if (p.category) u.set("category", p.category);
  if (p.sort && p.sort !== "relevant") u.set("sort", p.sort);
  if (p.page && p.page > 1) u.set("page", String(p.page));
  return u.toString();
}

/** Parameters for public.search_listings */
export function toRpcParams(p: SearchParams, opts: { includeUnconfirmed?: boolean; limit?: number; offset?: number } = {}) {
  return {
    q: p.q ?? null,
    near_lat: p.lat ?? null,
    near_lng: p.lng ?? null,
    radius_km: p.r,
    max_rent: p.max ?? null,
    min_rent: p.min ?? null,
    budget_basis: p.basis,
    home_types: p.types,
    must_haves: p.must,
    include_unconfirmed: opts.includeUnconfirmed ?? p.unconfirmed,
    furnishing: p.furnishing ?? null,
    listed_by: p.by ?? null,
    move_in_by: p.movein ?? null,
    category: p.category ?? null,
    sort: p.sort,
    limit: opts.limit ?? PAGE_SIZE,
    offset: opts.offset ?? (p.page - 1) * PAGE_SIZE,
  };
}

export function describeSearch(p: SearchParams): { title: string; subtitle: string } {
  const cat = CATEGORIES.find((c) => c.value === p.category)?.label;
  const type = p.types.length === 1 ? HOME_TYPES.find((t) => t.value === p.types[0])?.label : undefined;
  const what = cat ?? (type ? `${type} homes` : "Homes");
  const near = p.lat !== undefined;
  const title = p.q ? `${what} ${near ? "near" : "in"} ${p.q}` : near ? `${what} near the picked place` : what;
  const parts = [near ? `Within ${p.r} km` : null, type && !cat ? type : null, p.max ? `Up to KES ${formatAmount(p.max)} / month` : null].filter(Boolean);
  return { title, subtitle: parts.join(" · ") || "Any budget" };
}

export function factLabel(key: string) {
  return FACTS.find((f) => f.key === key)?.label ?? key;
}
