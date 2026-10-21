// AI-03: "Why this matches", built in code from the listing's current public facts and the
// tenant's search. No model call: every sentence comes from a fact, and anything unknown is
// said to be unknown rather than assumed.

import { FACTS } from "./catalog";
import type { ListingCharge } from "./costs";
import type { SearchParams } from "./search";
import { formatAmount } from "@/lib/money";

export type MatchFacts = {
  rent_amount: number;
  price_period: string;
  fixed_monthly_total: number | null;
  move_in_total: number | null;
  totals_complete: boolean;
  furnishing: string | null;
  available_from: string | null;
  charges: ListingCharge[];
  unit: { floor_level: number | null; facts: Record<string, string> };
};

/** Same rules as app.listing_fact in the database, so search and explanation agree. */
export function factValue(l: MatchFacts, key: string): "yes" | "no" | "unknown" {
  if (key === "water_included") {
    if (l.charges.some((c) => c.kind === "water" && c.billing === "included")) return "yes";
    if (l.charges.some((c) => c.kind === "water" && (c.billing === "metered" || c.billing === "fixed"))) return "no";
    return "unknown";
  }
  if (key === "ground_or_lift") {
    if (l.unit.floor_level === 0 || l.unit.facts?.lift === "yes") return "yes";
    if (l.unit.floor_level !== null && l.unit.facts?.lift === "no") return "no";
    return "unknown";
  }
  const v = l.unit.facts?.[key];
  return v === "yes" || v === "no" ? v : "unknown";
}

const label = (k: string) => (FACTS.find((f) => f.key === k)?.label ?? k).toLowerCase();
const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** Straight-line km between a picked place and the listing's public (rounded) position. */
export function approxDistanceKm(lat: number, lng: number, approxLat: number | null, approxLng: number | null): number | null {
  if (approxLat === null || approxLng === null) return null;
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(approxLat - lat) / 2) ** 2 + Math.cos(r(lat)) * Math.cos(r(approxLat)) * Math.sin(r(approxLng - lng) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(a)) * 10) / 10;
}

export type MatchExplanation = { matches: string[]; unknown: string[]; misses: string[] };

export function explainMatch(p: SearchParams, l: MatchFacts, distanceKm?: number | null): MatchExplanation {
  const matches: string[] = [];
  const unknown: string[] = [];
  const misses: string[] = [];

  if (p.max) {
    const budget = `KSh ${formatAmount(p.max)}`;
    if (p.basis === "rent") {
      if (l.price_period !== "month") unknown.push(`It's priced per ${l.price_period}, so it isn't compared with your monthly budget`);
      else (l.rent_amount <= p.max ? matches : misses).push(`Rent KSh ${formatAmount(l.rent_amount)} ${l.rent_amount <= p.max ? "is within" : "is over"} your ${budget} budget`);
    } else {
      const total = p.basis === "fixed" ? l.fixed_monthly_total : l.move_in_total;
      const what = p.basis === "fixed" ? "fixed monthly total" : "move-in total";
      if (total === null) unknown.push(`No ${what} is shown for this home`);
      else if (!l.totals_complete) unknown.push(`Its ${what} (KSh ${formatAmount(total)}) is incomplete: a charge isn't confirmed`);
      else (total <= p.max ? matches : misses).push(`${what[0].toUpperCase()}${what.slice(1)} KSh ${formatAmount(total)} ${total <= p.max ? "is within" : "is over"} your ${budget} budget`);
    }
  }

  const required = p.must.map((k) => [k, factValue(l, k)] as const);
  const met = required.filter(([, v]) => v === "yes").map(([k]) => label(k));
  if (met.length) matches.push(`Confirmed: ${join(met)}`);
  for (const [k, v] of required) if (v === "unknown") unknown.push(`${label(k)[0].toUpperCase()}${label(k).slice(1)} isn't confirmed by the advertiser`);
  for (const [k, v] of required) if (v === "no") misses.push(`No ${label(k)}`);

  const prefs = p.prefer.map((k) => [k, factValue(l, k)] as const);
  const has = prefs.filter(([, v]) => v === "yes").map(([k]) => label(k));
  if (has.length) matches.push(`Also has ${join(has)}, which you'd like`);
  const notSure = prefs.filter(([, v]) => v === "unknown").map(([k]) => label(k));
  if (notSure.length) unknown.push(`${join(notSure)[0].toUpperCase()}${join(notSure).slice(1)}: not confirmed`);

  if (p.lat !== undefined && distanceKm != null) matches.push(`About ${distanceKm < 1 ? "1" : Math.round(distanceKm)} km from ${p.q ?? "the place you picked"} (straight line, approximate)`);
  if (p.furnishing) {
    const f = l.furnishing === "fully" || l.furnishing === "partly" ? "furnished" : l.furnishing === "unfurnished" ? "unfurnished" : null;
    if (!f) unknown.push("Furnishing isn't stated");
    else (f === p.furnishing ? matches : misses).push(f === "furnished" ? "Furnished" : "Unfurnished");
  }
  if (p.movein) {
    if (!l.available_from) unknown.push("Move-in date isn't stated");
    else (l.available_from <= p.movein ? matches : misses).push(`Available from ${l.available_from}`);
  }
  return { matches, unknown, misses };
}
