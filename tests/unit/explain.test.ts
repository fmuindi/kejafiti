import { describe, expect, it } from "vitest";
import { explainBalance, type StatementLine } from "@/lib/rent/explain";

const line = (line_date: string, kind: string, charge: number, payment: number, description = kind): StatementLine => ({ line_date, kind, description, charge, payment, balance: 0, ref: null });

describe("explain this balance", () => {
  // The blueprint's worked example (page 14): Grace, Sunrise A2. September arrears 5,000,
  // October rent 15,000; pays 10,000 on 10 Oct, 10,000 on 24 Oct and 5,000 on 28 Oct.
  const grace = [
    line("2026-09-05", "rent", 15000, 0, "September 2026 rent"),
    line("2026-09-08", "payment", 0, 10000),
    line("2026-10-05", "rent", 15000, 0, "October 2026 rent"),
    line("2026-10-10", "payment", 0, 10000),
    line("2026-10-24", "payment", 0, 10000),
    line("2026-10-28", "payment", 0, 5000),
  ];

  it("breaks October down into what was owed before, the month's charges and payments", () => {
    const e = explainBalance(grace, "2026-10-01");
    expect(e.before).toBe(5000);
    expect(e.charges).toBe(15000);
    expect(e.chargeLines).toEqual([{ description: "October 2026 rent", amount: 15000 }]);
    expect(e.payments).toBe(25000);
    expect(e.balance).toBe(-5000); // 5,000 credit, ready for November
    expect(e.before + e.charges + e.adjustments - e.payments + e.reversals + e.after).toBe(e.balance);
  });

  it("puts a November charge raised early after October, so the rows still add up", () => {
    const e = explainBalance([...grace, line("2026-11-05", "rent", 15000, 0)], "2026-10-01");
    expect(e.after).toBe(15000);
    expect(e.balance).toBe(10000);
    expect(e.before + e.charges + e.adjustments - e.payments + e.reversals + e.after).toBe(e.balance);
  });

  it("counts a waiver as an adjustment and a reversed payment as owed again, never as a payment", () => {
    const e = explainBalance(
      [line("2026-10-05", "rent", 15000, 0), line("2026-10-06", "adjustment", -2000, 0), line("2026-10-07", "payment", 0, 13000), line("2026-10-20", "reversal", 0, -13000)],
      "2026-10-01",
    );
    expect(e.adjustments).toBe(-2000);
    expect(e.payments).toBe(13000);
    expect(e.reversals).toBe(13000);
    expect(e.balance).toBe(13000);
  });

  it("keeps cents exact", () => {
    const e = explainBalance([line("2026-10-05", "rent", 0.1, 0), line("2026-10-05", "utility", 0.2, 0)], "2026-10-01");
    expect(e.charges).toBe(0.3);
  });
});
