// The search-intent contract (AIS-01) and the deterministic rules around it. The model only
// proposes a change; everything here decides whether that change is safe and turns it into
// the same canonical search state the manual filters use (lib/listing/search.ts).

import { CATEGORIES, FACTS, HOME_TYPES } from "@/lib/listing/catalog";
import type { SearchParams } from "@/lib/listing/search";

export const LAYOUTS: readonly string[] = HOME_TYPES.map((t) => t.value);
export const CATEGORY_VALUES: readonly string[] = CATEGORIES.map((c) => c.value);
export const FEATURE_KEYS: readonly string[] = FACTS.map((f) => f.key);

type Op = "keep" | "set" | "clear";

/** What the model returns: a change to the current search, never a list of homes. */
export type IntentPatch = {
  mode: "new" | "refine";
  not_a_search: boolean;
  layout: { op: Op; value: string | null };
  category: { op: Op; value: string | null };
  location: { op: Op; text: string | null };
  budget: { op: Op; max: number | null; min: number | null; basis: "rent" | "fixed" | "movein" | "unspecified"; evidence: string | null };
  add_required: string[];
  add_preferred: string[];
  remove_features: string[];
  furnishing: { op: Op; value: "furnished" | "unfurnished" | null };
  move_in_by: { op: Op; date: string | null; evidence: string | null };
  unsupported: string[];
  clarify: { field: "none" | "amount" | "location" | "other"; question: string | null; options: string[] };
};

const nullable = (t: object) => ({ anyOf: [t, { type: "null" }] });
const opField = { type: "string", enum: ["keep", "set", "clear"] };

/** JSON schema for structured outputs (strict: every property required, no extras). */
export const INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mode", "not_a_search", "layout", "category", "location", "budget", "add_required", "add_preferred", "remove_features", "furnishing", "move_in_by", "unsupported", "clarify"],
  properties: {
    mode: { type: "string", enum: ["new", "refine"] },
    not_a_search: { type: "boolean" },
    layout: { type: "object", additionalProperties: false, required: ["op", "value"], properties: { op: opField, value: nullable({ type: "string", enum: LAYOUTS }) } },
    category: { type: "object", additionalProperties: false, required: ["op", "value"], properties: { op: opField, value: nullable({ type: "string", enum: CATEGORY_VALUES }) } },
    location: { type: "object", additionalProperties: false, required: ["op", "text"], properties: { op: opField, text: nullable({ type: "string" }) } },
    budget: {
      type: "object",
      additionalProperties: false,
      required: ["op", "max", "min", "basis", "evidence"],
      properties: { op: opField, max: nullable({ type: "number" }), min: nullable({ type: "number" }), basis: { type: "string", enum: ["rent", "fixed", "movein", "unspecified"] }, evidence: nullable({ type: "string" }) },
    },
    add_required: { type: "array", items: { type: "string", enum: FEATURE_KEYS } },
    add_preferred: { type: "array", items: { type: "string", enum: FEATURE_KEYS } },
    remove_features: { type: "array", items: { type: "string", enum: FEATURE_KEYS } },
    furnishing: { type: "object", additionalProperties: false, required: ["op", "value"], properties: { op: opField, value: nullable({ type: "string", enum: ["furnished", "unfurnished"] }) } },
    move_in_by: { type: "object", additionalProperties: false, required: ["op", "date", "evidence"], properties: { op: opField, date: nullable({ type: "string" }), evidence: nullable({ type: "string" }) } },
    unsupported: { type: "array", items: { type: "string" } },
    clarify: { type: "object", additionalProperties: false, required: ["field", "question", "options"], properties: { field: { type: "string", enum: ["none", "amount", "location", "other"] }, question: nullable({ type: "string" }), options: { type: "array", items: { type: "string" } } } },
  },
} as const;

// ---------------------------------------------------------------------------------------
// Amounts: the model's number is accepted only when the person's own words support it.
// ---------------------------------------------------------------------------------------

const EN: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
const SW: Record<string, number> = { moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8, tisa: 9, kumi: 10, ishirini: 20, thelathini: 30, arobaini: 40, hamsini: 50, sitini: 60, sabini: 70, themanini: 80, tisini: 90, mia: 100 };

/** Reads the amounts a phrase states: "15k", "15,000", "fifteen thousand", "elfu kumi na tano". */
export function amountsIn(phrase: string): number[] {
  const s = phrase.toLowerCase().replace(/,(?=\d{3}\b)/g, "");
  const out: number[] = [];
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(k|thousand|elfu)?\b/g)) out.push(Math.round(Number(m[1]) * (m[2] ? 1000 : 1)));
  // "elfu kumi na tano" = thousand × 15 (Kiswahili puts "elfu" first).
  const sw = s.match(/elfu\s+((?:[a-z]+(?:\s+na\s+|\s+))*[a-z]+)/);
  if (sw) {
    const n = sw[1].split(/\s+na\s+|\s+/).reduce((t, w) => t + (SW[w] ?? 0), 0);
    if (n) out.push(n * 1000);
  }
  const en = s.match(/((?:[a-z]+[\s-]+)*[a-z]+)\s+(?:thousand|k)\b/);
  if (en) {
    const n = en[1].split(/[\s-]+/).reduce((t, w) => (w === "hundred" ? t * 100 : t + (EN[w] ?? 0)), 0);
    if (n) out.push(n * 1000);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** The quoted evidence must be words the person actually used. */
export const appearsIn = (evidence: string | null, text: string) => !!evidence && norm(text).includes(norm(evidence));

export const MIN_BUDGET = 500;
export const MAX_BUDGET = 5_000_000;

export type Check = { ok: true } | { ok: false; ask: "amount" | "location" | "date"; question: string; options: number[] };

/** Amounts written as negative: "minus 5000", "negative 15k", "-5,000". */
export function negativeAmountsIn(text: string): number[] {
  const s = text.toLowerCase();
  return [...s.matchAll(/(?:\b(?:minus|negative)\s+|(?:^|\s)-\s*)((?:ksh\.?\s*)?[\d,]+(?:\.\d+)?\s*k?\b)/g)].flatMap((m) => amountsIn(m[1].replace(/ksh\.?\s*/, "")));
}

/** Accept a budget only if it is plausible and stated in the input. Otherwise ask, never guess. */
/**
 * Some replies set a budget and quote the amount as evidence but leave max and min empty. When
 * the quoted words are the person's own and state exactly one sensible amount, that is the max.
 */
export function fillBudgetFromEvidence(b: IntentPatch["budget"], text: string): IntentPatch["budget"] {
  if (b.op !== "set" || b.max !== null || b.min !== null || !appearsIn(b.evidence, text)) return b;
  const stated = [...new Set(amountsIn(b.evidence as string))].filter((v) => v >= MIN_BUDGET && v <= MAX_BUDGET);
  if (stated.length !== 1 || negativeAmountsIn(text).includes(stated[0])) return b;
  return { ...b, max: stated[0] };
}

export function checkBudget(b: IntentPatch["budget"], text: string): Check {
  if (b.op !== "set") return { ok: true };
  const values = [b.max, b.min].filter((v): v is number => v !== null);
  if (!values.length) return { ok: true };
  if (values.some((v) => !Number.isFinite(v) || v < MIN_BUDGET || v > MAX_BUDGET) || (b.min !== null && b.max !== null && b.min > b.max)) {
    return { ok: false, ask: "amount", question: "What is your budget in KSh?", options: [] };
  }
  if (!appearsIn(b.evidence, text)) return { ok: false, ask: "amount", question: "We couldn't tell the amount. What is your budget?", options: values };
  // "minus 5000" must not quietly become 5,000: a negative amount is asked about, not fixed.
  if (negativeAmountsIn(text).some((n) => values.includes(n))) return { ok: false, ask: "amount", question: "What is your budget in KSh?", options: [] };
  const stated = amountsIn(b.evidence as string);
  const unsupported = values.filter((v) => !stated.includes(v));
  if (unsupported.length) {
    const options = [...new Set([...values, ...stated.filter((v) => v >= MIN_BUDGET && v <= MAX_BUDGET)])].slice(0, 3);
    return { ok: false, ask: "amount", question: "Which amount did you mean?", options };
  }
  return { ok: true };
}

/** A move-in date must be a real date, from today, within a year, and stated by the person. */
export function checkMoveIn(m: IntentPatch["move_in_by"], text: string, today: string): Check {
  if (m.op !== "set") return { ok: true };
  const ok = !!m.date && /^\d{4}-\d{2}-\d{2}$/.test(m.date) && !Number.isNaN(Date.parse(m.date)) && m.date >= today && m.date <= addDays(today, 366) && appearsIn(m.evidence, text);
  return ok ? { ok: true } : { ok: false, ask: "date", question: "By when do you need to move in?", options: [] };
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------
// Applying a validated change to the current search (refine keeps everything not mentioned).
// ---------------------------------------------------------------------------------------

export type ResolvedPlace = { name: string; lat?: number; lng?: number };

export const EMPTY: SearchParams = { basis: "rent", types: [], must: [], prefer: [], unconfirmed: false, sort: "relevant", page: 1, r: 5 };

export function applyPatch(current: SearchParams, p: IntentPatch, place: ResolvedPlace | null): { next: SearchParams; defaults: string[] } {
  const base: SearchParams = p.mode === "new" ? { ...EMPTY, r: current.r } : { ...current, page: 1 };
  const next: SearchParams = { ...base, types: [...base.types], must: [...base.must], prefer: [...base.prefer] };
  const defaults: string[] = [];

  if (p.layout.op === "set" && p.layout.value && LAYOUTS.includes(p.layout.value)) next.types = [p.layout.value];
  if (p.layout.op === "clear") next.types = [];
  if (p.category.op === "set" && p.category.value && CATEGORY_VALUES.includes(p.category.value)) next.category = p.category.value;
  if (p.category.op === "clear") next.category = undefined;

  if (p.location.op === "set" && place) {
    next.q = place.name;
    next.lat = place.lat;
    next.lng = place.lng;
    if (next.lat === undefined && next.sort === "nearest") next.sort = "relevant";
  }
  if (p.location.op === "clear") Object.assign(next, { q: undefined, lat: undefined, lng: undefined, sort: next.sort === "nearest" ? "relevant" : next.sort });

  if (p.budget.op === "set") {
    if (p.budget.max !== null) next.max = p.budget.max;
    if (p.budget.min !== null) next.min = p.budget.min;
    if (p.budget.basis !== "unspecified") next.basis = p.budget.basis;
    else if (p.mode === "new" || !current.max) {
      next.basis = "rent";
      defaults.push("Your budget is applied to rent only. Switch it to include charges if you meant the total.");
    }
  }
  if (p.budget.op === "clear") Object.assign(next, { max: undefined, min: undefined, basis: "rent" });

  const removed = new Set(p.remove_features);
  next.must = [...new Set([...next.must, ...p.add_required])].filter((k) => FEATURE_KEYS.includes(k) && !removed.has(k));
  // Required wins over preferred; a preference never weakens a requirement.
  next.prefer = [...new Set([...next.prefer, ...p.add_preferred])].filter((k) => FEATURE_KEYS.includes(k) && !removed.has(k) && !next.must.includes(k));

  if (p.furnishing.op === "set" && p.furnishing.value) next.furnishing = p.furnishing.value;
  if (p.furnishing.op === "clear") next.furnishing = undefined;
  if (p.move_in_by.op === "set" && p.move_in_by.date) next.movein = p.move_in_by.date;
  if (p.move_in_by.op === "clear") next.movein = undefined;
  return { next, defaults };
}

const featureLabel = (k: string) => FACTS.find((f) => f.key === k)?.label ?? k;

/** Plain description of what changed, for the "We searched for…" line and Undo. */
export function describeChanges(before: SearchParams, after: SearchParams): string[] {
  const out: string[] = [];
  const fmt = (n?: number) => (n ? `KSh ${n.toLocaleString("en-KE")}` : "any");
  if (before.q !== after.q) out.push(after.q ? `Area: ${after.q}${before.q ? ` (was ${before.q})` : ""}` : "Area removed");
  if (before.types.join() !== after.types.join()) out.push(after.types.length ? `Layout: ${HOME_TYPES.find((t) => t.value === after.types[0])?.label}` : "Any layout");
  if (before.category !== after.category) out.push(after.category ? `Type: ${CATEGORIES.find((c) => c.value === after.category)?.label}` : "Any home type");
  if (before.max !== after.max || before.basis !== after.basis) out.push(after.max ? `Budget: up to ${fmt(after.max)} (${after.basis === "fixed" ? "rent + fixed charges" : after.basis === "movein" ? "move-in total" : "rent"})` : "Any budget");
  if (before.min !== after.min && after.min) out.push(`From ${fmt(after.min)}`);
  for (const k of after.must.filter((k) => !before.must.includes(k))) out.push(`Must have: ${featureLabel(k)}`);
  for (const k of after.prefer.filter((k) => !before.prefer.includes(k))) out.push(`Nice to have: ${featureLabel(k)}`);
  for (const k of [...before.must, ...before.prefer].filter((k) => !after.must.includes(k) && !after.prefer.includes(k))) out.push(`Removed: ${featureLabel(k)}`);
  if (before.furnishing !== after.furnishing) out.push(after.furnishing ? (after.furnishing === "furnished" ? "Furnished" : "Unfurnished") : "Any furnishing");
  if (before.movein !== after.movein && after.movein) out.push(`Move in by ${after.movein}`);
  return out;
}
