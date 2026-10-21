import { describe, expect, it } from "vitest";
import { allowedNumbers, keepGrounded, numbersIn } from "@/lib/ai/grounding";
import { explainMatch, factValue, type MatchFacts } from "@/lib/listing/match";
import { parseSearch } from "@/lib/listing/search";

// AI-03 (why this matches) and the grounding check used by AI-04 / AI-07 drafts.

describe("grounding", () => {
  it("reads numbers the way people write them", () => {
    expect(numbersIn("Collections were KSh 15,000 (88.9%), up 2k")).toEqual([15000, 88.9, 2000]);
  });
  it("drops sentences that state a figure not in the facts, keeps the rest", () => {
    const allowed = allowedNumbers({ settled: 45000, rate: 88.9, units: [{ outstanding: 5000 }] });
    const r = keepGrounded("KSh 45,000 was confirmed. The rate was 88.9%. Collections rose by 15,000. Two units owe 5,000 each.", allowed);
    expect(r.text).toBe("KSh 45,000 was confirmed. The rate was 88.9%. Two units owe 5,000 each.");
    expect(r.removed).toEqual(["Collections rose by 15,000."]);
  });
  it("allows small counts and numbers inside fact strings", () => {
    const allowed = allowedNumbers({ notes: "Near Stage 42" });
    expect(keepGrounded("It has 2 bedrooms near Stage 42.", allowed).removed).toEqual([]);
  });
});

const home = (over: Partial<MatchFacts> = {}): MatchFacts => ({
  rent_amount: 15000, price_period: "month", fixed_monthly_total: 16500, move_in_total: 46500, totals_complete: true,
  furnishing: "unfurnished", available_from: "2026-11-01", charges: [], unit: { floor_level: 2, facts: {} }, ...over,
});

describe("factValue mirrors the database rules", () => {
  it("water is included only when a water charge says so", () => {
    expect(factValue(home({ charges: [{ kind: "water", billing: "included" } as MatchFacts["charges"][number]] }), "water_included")).toBe("yes");
    expect(factValue(home({ charges: [{ kind: "water", billing: "metered" } as MatchFacts["charges"][number]] }), "water_included")).toBe("no");
    expect(factValue(home(), "water_included")).toBe("unknown");
  });
  it("ground floor or lift", () => {
    expect(factValue(home({ unit: { floor_level: 0, facts: {} } }), "ground_or_lift")).toBe("yes");
    expect(factValue(home({ unit: { floor_level: 3, facts: { lift: "no" } } }), "ground_or_lift")).toBe("no");
    expect(factValue(home({ unit: { floor_level: null, facts: {} } }), "ground_or_lift")).toBe("unknown");
  });
});

describe("explainMatch", () => {
  it("compares the budget on the basis the person chose", () => {
    expect(explainMatch(parseSearch({ max: "15000" }), home()).matches[0]).toMatch(/within/);
    expect(explainMatch(parseSearch({ max: "15000", basis: "fixed" }), home()).misses[0]).toMatch(/Fixed monthly total .* is over/);
  });
  it("an incomplete total is unknown, never a match", () => {
    const r = explainMatch(parseSearch({ max: "50000", basis: "movein" }), home({ totals_complete: false }));
    expect(r.matches).toEqual([]);
    expect(r.unknown[0]).toMatch(/incomplete/);
  });
  it("unconfirmed required features are said to be unconfirmed", () => {
    const r = explainMatch(parseSearch({ must: "water_included" }), home());
    expect(r.unknown[0]).toMatch(/isn't confirmed/);
    expect(r.matches).toEqual([]);
  });
});
