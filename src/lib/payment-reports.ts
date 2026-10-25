// Tenant-reported missing payments: what the tenant said, and where the check has got to.
// A report never changes a balance; only a confirmed payment entry does.

export type ReportStatus = "open" | "matched" | "not_found" | "withdrawn";
/** Where the matched payment entry has got to, as the tenant may see it. */
export type PaymentState = "checking" | "confirmed" | "not_accepted" | null;

export type PaymentReport = {
  id: string;
  amount: number;
  paid_on: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  status: ReportStatus;
  reply: string | null;
  created_at: string;
  answered_at: string | null;
  payment_state: PaymentState;
};

export const METHOD_LABEL: Record<string, string> = { mpesa: "M-PESA", bank: "Bank", cash: "Cash", other: "Other" };

type Tone = "waiting" | "success" | "error" | "neutral" | "info";

/** The tenant's view of a report: one plain status line. */
export function tenantReportStatus(r: Pick<PaymentReport, "status" | "payment_state">): { label: string; tone: Tone } {
  if (r.status === "open") return { label: "Being checked", tone: "waiting" };
  if (r.status === "withdrawn") return { label: "Withdrawn", tone: "neutral" };
  if (r.status === "not_found") return { label: "Not found", tone: "error" };
  if (r.payment_state === "confirmed") return { label: "Confirmed", tone: "success" };
  if (r.payment_state === "not_accepted") return { label: "Not accepted", tone: "error" };
  return { label: "Found · being confirmed", tone: "info" };
}

export function toReport(r: Record<string, unknown>): PaymentReport {
  return { ...(r as unknown as PaymentReport), amount: Number(r.amount) };
}

export type CandidateEntry = { id: string; ref: string; amount: number; paid_on: string; status: string; reference: string | null };

const DAY = 86_400_000;

/** The entry most likely to be the one the tenant means: same reference, else same amount within a week. */
export function likelyMatch(r: { amount: number; paid_on: string; reference: string | null }, entries: CandidateEntry[]): CandidateEntry | null {
  const ref = r.reference?.trim().toUpperCase();
  return (
    (ref ? entries.find((e) => e.reference?.trim().toUpperCase() === ref) : undefined) ??
    entries.find((e) => e.amount === r.amount && Math.abs(Date.parse(e.paid_on) - Date.parse(r.paid_on)) <= 7 * DAY) ??
    null
  );
}
