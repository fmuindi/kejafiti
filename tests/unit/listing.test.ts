import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { chargeSummaryLine, computeCosts, type ListingCharge } from "@/lib/listing/costs";
import { parseSearch, toQuery } from "@/lib/listing/search";

const service: ListingCharge = { kind: "service_charge", amount: 1000, frequency: "monthly", billing: "fixed", compulsory: true };
const water: ListingCharge = { kind: "water", amount: null, frequency: "monthly", billing: "metered", compulsory: true };

describe("listing costs (same fixtures as supabase/tests/03_marketplace)", () => {
  it("rent 14,000 + service 1,000 with 1 month deposit", () => {
    const c = computeCosts({ rent: 14000, depositMonths: 1, charges: [service, water] });
    expect(c.fixedMonthly).toBe(15000);
    expect(c.moveIn).toBe(29000);
    expect(c.complete).toBe(true);
    expect(c.billedSeparately).toEqual(["water (metered)"]);
  });
  it("guide example: 15,000 + 1,000 + 200 garbage, 15,000 deposit, 1,000 utility deposit", () => {
    const c = computeCosts({
      rent: 15000,
      depositAmount: 15000,
      charges: [
        service,
        { kind: "garbage", amount: 200, frequency: "monthly", billing: "fixed", compulsory: true },
        { kind: "utility_deposit", amount: 1000, frequency: "one_off", billing: "fixed", compulsory: true },
      ],
    });
    expect(c.fixedMonthly).toBe(16200);
    expect(c.moveIn).toBe(32200);
  });
  it("an unconfirmed compulsory charge makes the total incomplete, never all-inclusive", () => {
    const c = computeCosts({ rent: 16000, depositMonths: 1, charges: [{ ...service, amount: null }] });
    expect(c.complete).toBe(false);
    expect(c.unconfirmed).toEqual(["Service charge"]);
    expect(chargeSummaryLine([{ ...service, amount: null }])).toBe("Service charge not confirmed");
  });
  it("summarises charges for result cards", () => {
    expect(chargeSummaryLine([service, water])).toBe("+ KES 1,000 service charge · water metered");
  });
});

describe("search URL state", () => {
  it("round-trips filters and drops unknown values", () => {
    const p = parseSearch({ q: "Ruaka", max: "20,000", type: ["bedsitter_studio", "castle"], must: "private_bathroom,own_meter", unconfirmed: "1", sort: "lowest_total" });
    expect(p).toMatchObject({ q: "Ruaka", max: 20000, types: ["bedsitter_studio"], must: ["private_bathroom", "own_meter"], unconfirmed: true, sort: "lowest_total" });
    expect(parseSearch(Object.fromEntries(new URLSearchParams(toQuery(p))))).toMatchObject({ q: "Ruaka", max: 20000, unconfirmed: true });
  });
});

describe("CSV export", () => {
  it("neutralises spreadsheet formulas and quotes separators", () => {
    const csv = toCsv([["=HYPERLINK(\"x\")", "Achieng, Otieno", -500, "@cmd"]]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"Achieng, Otieno"`);
    expect(csv).toContain(",-500,");
    expect(csv).toContain("'@cmd");
  });
});
