import { describe, expect, it } from "vitest";
import { EMPTY, amountsIn, applyPatch, checkBudget, describeChanges, type IntentPatch } from "@/lib/ai/intent-rules";
import { parseSearch, toQuery } from "@/lib/listing/search";

// Deterministic rules around the model (blueprint pp.7-9, 14-15). The model's output is
// treated as untrusted; these decide what reaches the search.

const keep = { op: "keep" as const, value: null };
const patch = (p: Partial<IntentPatch>): IntentPatch => ({
  mode: "new",
  not_a_search: false,
  layout: keep,
  category: keep,
  location: { op: "keep", text: null },
  budget: { op: "keep", max: null, min: null, basis: "unspecified", evidence: null },
  add_required: [],
  add_preferred: [],
  remove_features: [],
  furnishing: keep,
  move_in_by: { op: "keep", date: null, evidence: null },
  unsupported: [],
  clarify: { field: "none", question: null, options: [] },
  ...p,
});
const budget = (max: number, evidence: string, basis: IntentPatch["budget"]["basis"] = "unspecified"): IntentPatch["budget"] => ({ op: "set", max, min: null, basis, evidence });

describe("amounts are read from the person's own words", () => {
  it.each([
    ["15k", 15000],
    ["15,000", 15000],
    ["KSh 15000", 15000],
    ["fifteen thousand", 15000],
    ["twenty k", 20000],
    ["elfu kumi na tano", 15000],
    ["elfu ishirini", 20000],
  ])("%s -> %d", (phrase, value) => expect(amountsIn(phrase)).toContain(value));
  it("does not read a place name as an amount", () => expect(amountsIn("fifteen kileleshwa")).toEqual([]));
});

describe("budget checks", () => {
  const text = "Bedsitter Ruaka under 15k";
  it("accepts an amount stated in the request", () => expect(checkBudget(budget(15000, "under 15k"), text)).toEqual({ ok: true }));
  it("asks when the model's number isn't what was said (15k read as 50,000)", () => {
    const c = checkBudget(budget(50000, "15k"), text);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.options).toEqual(expect.arrayContaining([50000, 15000]));
  });
  it("asks when the quoted words aren't in the request", () => expect(checkBudget(budget(15000, "15 thousand shillings"), text).ok).toBe(false));
  it("asks when the request says a negative amount, even if the model dropped the sign", () => {
    expect(checkBudget(budget(5000, "minus 5000"), "Bedsitter Ruaka for minus 5000").ok).toBe(false);
    expect(checkBudget(budget(5000, "5000"), "Bedsitter Ruaka for -5000").ok).toBe(false);
    expect(checkBudget(budget(15000, "15k"), "Bedsitter 15k, 2-3 rooms").ok).toBe(true);
  });
  it("rejects implausible or negative budgets instead of correcting them", () => {
    expect(checkBudget(budget(-15000, "15k"), text).ok).toBe(false);
    expect(checkBudget(budget(15, "15k"), text).ok).toBe(false);
  });
});

describe("applying a request to the search", () => {
  const ruaka = { name: "Ruaka", lat: -1.2, lng: 36.78 };
  const first = applyPatch(EMPTY, patch({ layout: { op: "set", value: "bedsitter_studio" }, location: { op: "set", text: "Ruaka" }, budget: budget(15000, "15k", "fixed"), add_required: ["private_bathroom", "own_meter"] }), ruaka).next;

  it("a clear request becomes the same state manual filters produce", () => {
    expect(first).toMatchObject({ q: "Ruaka", types: ["bedsitter_studio"], max: 15000, basis: "fixed", must: ["private_bathroom", "own_meter"] });
    const manual = parseSearch({ q: "Ruaka", lat: "-1.2", lng: "36.78", type: "bedsitter_studio", max: "15000", basis: "fixed", must: ["private_bathroom", "own_meter"] });
    expect(toQuery(first)).toBe(toQuery(manual));
  });

  it('"Make it 18k" changes only the amount and keeps its basis', () => {
    const next = applyPatch(first, patch({ mode: "refine", budget: budget(18000, "18k") }), null).next;
    expect(next).toMatchObject({ q: "Ruaka", max: 18000, basis: "fixed", must: ["private_bathroom", "own_meter"] });
  });

  it('"Try Ruiru instead" replaces the area and keeps everything else', () => {
    const next = applyPatch(first, patch({ mode: "refine", location: { op: "set", text: "Ruiru" } }), { name: "Ruiru", lat: -1.15, lng: 36.96 }).next;
    expect(next).toMatchObject({ q: "Ruiru", max: 15000, types: ["bedsitter_studio"], must: ["private_bathroom", "own_meter"] });
    expect(describeChanges(first, next)).toEqual(["Area: Ruiru (was Ruaka)"]);
  });

  it('"Parking would be nice" adds a preference and never drops a requirement', () => {
    const next = applyPatch(first, patch({ mode: "refine", add_preferred: ["parking", "private_bathroom"] }), null).next;
    expect(next.must).toEqual(["private_bathroom", "own_meter"]);
    expect(next.prefer).toEqual(["parking"]);
  });

  it("a total move-in budget never becomes monthly rent", () => {
    const next = applyPatch(EMPTY, patch({ budget: budget(30000, "30k", "movein") }), null).next;
    expect(next).toMatchObject({ max: 30000, basis: "movein" });
  });

  it("an amount with no stated basis uses rent and says so", () => {
    const r = applyPatch(EMPTY, patch({ budget: budget(15000, "15k") }), null);
    expect(r.next.basis).toBe("rent");
    expect(r.defaults[0]).toMatch(/rent only/);
  });

  it("a new request starts from scratch; a refinement doesn't", () => {
    const fresh = applyPatch(first, patch({ mode: "new", layout: { op: "set", value: "1_bedroom" } }), null).next;
    expect(fresh).toMatchObject({ must: [], types: ["1_bedroom"] });
    expect([fresh.q, fresh.max]).toEqual([undefined, undefined]);
  });

  it("removing a feature removes exactly that one", () => {
    const next = applyPatch(first, patch({ mode: "refine", remove_features: ["own_meter"] }), null).next;
    expect(next.must).toEqual(["private_bathroom"]);
  });
});

describe("the query handed to the results page is canonical", () => {
  it("rounds Places coordinates the way the page does, so the interpretation banner matches", async () => {
    const { canonicalQuery } = await import("@/lib/listing/search");
    const q = canonicalQuery({ ...EMPTY, q: "Ruaka", lat: -1.2058128, lng: 36.7795319 });
    expect(q).toBe("q=Ruaka&lat=-1.20581&lng=36.77953");
    expect(toQuery(parseSearch(Object.fromEntries(new URLSearchParams(q))))).toBe(q);
  });
});
