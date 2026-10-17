import { describe, expect, it } from "vitest";
import { formatMoney, parseAmount, sumAmounts, subtract } from "@/lib/money";
import { previewAllocation, suggestAllocation, type OpenCharge } from "@/lib/rent/allocation";
import { collectionRate, formatRate } from "@/lib/rent/status";

const oct: OpenCharge = { id: "oct", label: "October 2026 rent", periodStart: "2026-10-01", dueDate: "2026-10-05", net: 15000, confirmed: 10000 };
const nov: OpenCharge = { id: "nov", label: "November 2026 rent", periodStart: "2026-11-01", dueDate: "2026-11-05", net: 15000, confirmed: 0 };

describe("money", () => {
  it("parses typed amounts with commas and spaces", () => {
    expect(parseAmount("15,000")).toBe(15000);
    expect(parseAmount(" 15 000.50 ")).toBe(15000.5);
    expect(parseAmount("KSh 5000")).toBe(5000);
    expect(parseAmount("")).toBeNull();
    expect(Number.isNaN(parseAmount("12.345"))).toBe(true);
    expect(Number.isNaN(parseAmount("abc"))).toBe(true);
  });
  it("adds in cents so decimals stay exact", () => {
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
    expect(subtract(15000, 10000.1)).toBe(4999.9);
  });
  it("formats KSh and KES", () => {
    expect(formatMoney(135000)).toBe("KSh 135,000");
    expect(formatMoney(29000, "KES")).toBe("KES 29,000");
  });
});

describe("allocation preview", () => {
  it("suggests oldest-due first and never exceeds a charge's balance", () => {
    expect(suggestAllocation(5000, [nov, oct])).toEqual([{ chargeId: "oct", amount: 5000 }]);
    expect(suggestAllocation(22000, [nov, oct])).toEqual([
      { chargeId: "oct", amount: 5000 },
      { chargeId: "nov", amount: 15000 },
    ]);
  });
  it("keeps any remainder as tenant credit", () => {
    const p = previewAllocation(22000, suggestAllocation(22000, [oct, nov]), [oct, nov]);
    expect(p.applied).toBe(20000);
    expect(p.credit).toBe(2000);
    expect(p.errors).toEqual([]);
    expect(p.lines.map((l) => l.status)).toEqual(["paid", "paid"]);
  });
  it("shows a partial result for KSh 10,000 against KSh 15,000 rent", () => {
    const fresh = { ...oct, confirmed: 0 };
    const p = previewAllocation(10000, [{ chargeId: "oct", amount: 10000 }], [fresh]);
    expect(p.lines[0]).toMatchObject({ before: 15000, after: 5000, status: "partial" });
  });
  it("flags over-allocation of a charge and of the payment", () => {
    expect(previewAllocation(9000, [{ chargeId: "oct", amount: 9000 }], [oct]).errors[0]).toMatch(/has only KSh 5,000 left/);
    expect(previewAllocation(3000, [{ chargeId: "nov", amount: 4000 }], [nov]).errors).toContain("The amounts applied add up to more than the payment.");
  });
});

describe("dashboard metrics", () => {
  it("matches the worked example", () => {
    expect(formatRate(collectionRate(110000, 135000))).toBe("81.5%");
    expect(formatRate(collectionRate(120000, 135000))).toBe("88.9%");
  });
  it("shows N/A when nothing was billed", () => {
    expect(formatRate(collectionRate(0, 0))).toBe("N/A");
  });
});
