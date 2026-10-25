import { addMonths } from "@/lib/dates";
import { sumAmounts } from "@/lib/money";

// "Explain this balance" (blueprint page 9): a deterministic breakdown of a tenancy's balance
// for one rent month, built from the same statement lines as the statement itself. Every line
// lands in exactly one bucket, so the rows always add up to the balance shown.

export type StatementLine = { line_date: string; kind: string; description: string; charge: number; payment: number; balance: number; ref: string | null };

export type BalanceExplanation = {
  /** Balance from everything dated before the month (positive = owed, negative = credit). */
  before: number;
  charges: number;
  chargeLines: Array<{ description: string; amount: number }>;
  adjustments: number;
  payments: number;
  reversals: number;
  /** Lines dated after the month: charges raised early, later payments. */
  after: number;
  balance: number;
};

const CHARGE_KINDS = new Set(["rent", "opening_balance", "utility", "other"]);

export function explainBalance(lines: StatementLine[], period: string): BalanceExplanation {
  const start = period;
  const next = addMonths(period, 1);
  const net = (l: StatementLine) => Number(l.charge) - Number(l.payment);
  const before = lines.filter((l) => l.line_date < start);
  const during = lines.filter((l) => l.line_date >= start && l.line_date < next);
  const after = lines.filter((l) => l.line_date >= next);
  const charges = during.filter((l) => CHARGE_KINDS.has(l.kind));
  return {
    before: sumAmounts(before.map(net)),
    charges: sumAmounts(charges.map((l) => Number(l.charge))),
    chargeLines: charges.map((l) => ({ description: l.description, amount: Number(l.charge) })),
    adjustments: sumAmounts(during.filter((l) => l.kind === "adjustment").map((l) => Number(l.charge))),
    payments: sumAmounts(during.filter((l) => l.kind === "payment" || l.kind === "opening_credit").map((l) => Number(l.payment))),
    // A reversal is a negative payment: it adds back to what is owed.
    reversals: sumAmounts(during.filter((l) => l.kind === "reversal").map((l) => -Number(l.payment))),
    after: sumAmounts(after.map(net)),
    balance: sumAmounts(lines.map(net)),
  };
}
