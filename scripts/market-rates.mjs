// Market-rate dataset: merges the researched batches in <monthDir>/raw/rents_*.json,
// validates them against the listing vocabulary, drops stale rows and duplicates, and writes
// listings.json, listings.csv and summary.json (median rents) into <monthDir>.
//
//   node scripts/market-rates.mjs data/market-rates/2026-11
//
// Rows record public asking prices only: no photos, names or phone numbers.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
if (!out) throw new Error("Usage: node scripts/market-rates.mjs <monthDir>");
const rawDir = join(out, "raw");
const E = {
  rental_scope: ["entire_home", "private_room", "shared_room", "bedspace"],
  layout: ["single_room", "double_room", "multiroom", "bedsitter_studio", "bedroom_home"],
  building_style: ["apartment", "bungalow", "maisonette", "townhouse", "terraced_house", "villa", "mansion", "cottage", "farmhouse", "other"],
  origin: ["dsq", "guest_wing", "conversion", null],
  furnishing: ["unfurnished", "partly", "fully", null],
  price_period: ["month", "week", "night", "semester"],
  price_basis: ["entire_unit", "per_person", "per_bed", "per_room"],
  advertiser_role: ["agent", "owner", "property_manager", "caretaker", "unknown"],
};
const CHARGE_KINDS = ["service_charge", "water", "electricity", "garbage", "security", "internet", "parking", "utility_deposit", "other_deposit", "agency_fee", "viewing_fee", "other"];
const BILLING = ["fixed", "metered", "included", "unknown"];
const FACT_KEYS = ["private_bathroom", "own_meter", "parking", "balcony", "lift", "private_kitchen", "own_compound", "borehole", "backup_power", "cctv", "pets_allowed"];
const PHONE = /(\+?254|\b0)[17]\d{8}\b/;

const rows = [], problems = [];
for (const f of readdirSync(rawDir).filter((f) => /^rents_.*\.json$/.test(f)).sort()) {
  const p = join(rawDir, f);
  for (const [i, r] of JSON.parse(readFileSync(p, "utf8")).entries()) {
    const bad = [];
    for (const [k, allowed] of Object.entries(E)) {
      const v = r[k] ?? null;
      if (!allowed.includes(v) && !(k === "advertiser_role" && v === null)) bad.push(`${k}=${v}`);
    }
    if (!(r.rent_amount > 0)) bad.push(`rent_amount=${r.rent_amount}`);
    if (!r.area || !r.county || !r.source_url) bad.push("missing area/county/source_url");
    for (const c of r.charges ?? []) {
      if (!CHARGE_KINDS.includes(c.kind) || !BILLING.includes(c.billing)) bad.push(`charge ${c.kind}/${c.billing}`);
    }
    for (const [k, v] of Object.entries(r.facts ?? {})) {
      if (!FACT_KEYS.includes(k) || !["yes", "no"].includes(v)) bad.push(`fact ${k}=${v}`);
    }
    if (PHONE.test(JSON.stringify(r))) bad.push("contains phone number");
    // Current market only: nothing posted more than 60 days before observation, and no
    // institutional registers (the KU hostel list is dated Aug 2024).
    const cutoff = new Date(Date.parse(r.observed_on) - 60 * 86400000).toISOString().slice(0, 10);
    if (r.posted_on && r.posted_on < cutoff) bad.push(`stale posted_on=${r.posted_on}`);
    if (/(^|\.)ku\.ac\.ke$/.test(r.source_site ?? "")) bad.push("stale register (ku.ac.ke, 2024)");
    if (bad.length) { problems.push(`${f}#${i}: ${bad.join(", ")}`); continue; }
    rows.push({ student: false, origin: null, ...r, batch: f.replace(/^rents_|\.json$/g, "") });
  }
}

// Same URL, or same area+layout+bedrooms+rent+style, counts as one unit.
const seen = new Set();
const unique = rows.filter((r) => {
  const keys = [r.source_url.replace(/[?#].*$/, ""), [r.area, r.layout, r.bedrooms, r.rent_amount, r.building_style].join("|").toLowerCase()];
  if (keys.some((k) => seen.has(k))) return false;
  keys.forEach((k) => seen.add(k));
  return true;
});

// Same buckets as the HOME_TYPES search filter.
const homeType = (r) =>
  r.layout === "bedroom_home" ? (r.bedrooms >= 3 ? "3_plus_bedrooms" : r.bedrooms === 2 ? "2_bedrooms" : "1_bedroom") : r.layout === "multiroom" ? "multiroom" : r.layout;
for (const r of unique) r.home_type = homeType(r);

writeFileSync(join(out, "listings.json"), JSON.stringify(unique, null, 2) + "\n");

const cols = ["county", "town", "area", "road", "rental_scope", "layout", "home_type", "building_style", "origin", "bedrooms", "bathrooms", "size_sqm", "furnishing", "rent_amount", "price_period", "price_basis", "deposit_months", "student", "advertiser_role", "source_site", "source_url", "posted_on", "observed_on"];
const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
writeFileSync(join(out, "listings.csv"), [cols.join(","), ...unique.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n");

// Medians of monthly whole-unit rents only, so per-bed and nightly prices don't skew them.
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const groups = {};
for (const r of unique.filter((r) => r.price_period === "month" && r.price_basis === "entire_unit")) {
  const k = `${r.county}|${r.town}|${r.area}|${r.home_type}`;
  (groups[k] ??= []).push(r.rent_amount);
}
const summary = Object.entries(groups).map(([k, v]) => {
  const [county, town, area, home_type] = k.split("|");
  return { county, town, area, home_type, n: v.length, median_rent: median(v), min_rent: Math.min(...v), max_rent: Math.max(...v) };
}).sort((a, b) => a.county.localeCompare(b.county) || a.area.localeCompare(b.area) || a.median_rent - b.median_rent);
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

console.log(JSON.stringify({ raw: rows.length, unique: unique.length, rejected: problems.length, problems,
  byBatch: unique.reduce((a, r) => ((a[r.batch] = (a[r.batch] ?? 0) + 1), a), {}),
  byHomeType: unique.reduce((a, r) => ((a[r.home_type] = (a[r.home_type] ?? 0) + 1), a), {}),
  dated: unique.filter((r) => r.posted_on).length }, null, 2));
