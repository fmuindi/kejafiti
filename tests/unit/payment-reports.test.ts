import { describe, expect, it } from "vitest";
import { likelyMatch, tenantReportStatus, type CandidateEntry } from "@/lib/payment-reports";

const entry = (ref: string, amount: number, paid_on: string, reference: string | null = null, status = "confirmed"): CandidateEntry => ({ id: ref, ref, amount, paid_on, status, reference });

describe("tenant-reported missing payments", () => {
  const entries = [entry("PE-1", 14000, "2026-10-01", "QK11AAA"), entry("PE-2", 14000, "2026-10-20"), entry("PE-3", 5000, "2026-10-22", " qk12abc ")];

  it("suggests the entry with the same reference first, ignoring case and spaces", () => {
    expect(likelyMatch({ amount: 14000, paid_on: "2026-10-21", reference: "QK12ABC" }, entries)?.ref).toBe("PE-3");
  });

  it("otherwise suggests the same amount paid within a week", () => {
    expect(likelyMatch({ amount: 14000, paid_on: "2026-10-23", reference: null }, entries)?.ref).toBe("PE-2");
    expect(likelyMatch({ amount: 14000, paid_on: "2026-11-05", reference: null }, entries)).toBeNull();
    expect(likelyMatch({ amount: 13999, paid_on: "2026-10-20", reference: "NOPE" }, entries)).toBeNull();
  });

  it("tells the tenant where their report has got to", () => {
    expect(tenantReportStatus({ status: "open", payment_state: null }).label).toBe("Being checked");
    expect(tenantReportStatus({ status: "matched", payment_state: "checking" }).label).toBe("Found · being confirmed");
    expect(tenantReportStatus({ status: "matched", payment_state: "confirmed" }).tone).toBe("success");
    expect(tenantReportStatus({ status: "matched", payment_state: "not_accepted" }).label).toBe("Not accepted");
    expect(tenantReportStatus({ status: "not_found", payment_state: null }).tone).toBe("error");
  });
});
