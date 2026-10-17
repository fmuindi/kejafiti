import { fromCents, toCents } from "@/lib/money";

// Browser-side preview of how a payment would be applied. The database re-validates every
// line when the entry is confirmed (app.validate_allocations), so this is guidance, never
// the authority.

export type OpenCharge = {
  id: string;
  label: string;
  periodStart: string;
  dueDate: string;
  net: number; // charge amount after adjustments
  confirmed: number; // confirmed allocations so far
};

export type AllocationLine = { chargeId: string; amount: number };

export type AllocationPreview = {
  lines: Array<{
    chargeId: string;
    label: string;
    before: number;
    applied: number;
    after: number;
    status: "paid" | "partial" | "unpaid";
  }>;
  applied: number;
  credit: number;
  errors: string[];
};

export const outstandingOf = (c: OpenCharge) => fromCents(toCents(c.net) - toCents(c.confirmed));

/** Oldest-due first, never more than each charge's outstanding balance. */
export function suggestAllocation(amount: number, charges: OpenCharge[]): AllocationLine[] {
  let remaining = toCents(amount);
  const lines: AllocationLine[] = [];
  const ordered = [...charges].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.periodStart.localeCompare(b.periodStart),
  );
  for (const c of ordered) {
    const open = toCents(outstandingOf(c));
    if (open <= 0 || remaining <= 0) continue;
    const take = Math.min(open, remaining);
    lines.push({ chargeId: c.id, amount: fromCents(take) });
    remaining -= take;
  }
  return lines;
}

export function previewAllocation(amount: number, lines: AllocationLine[], charges: OpenCharge[]): AllocationPreview {
  const errors: string[] = [];
  const byId = new Map(charges.map((c) => [c.id, c]));
  const seen = new Set<string>();
  let appliedCents = 0;
  const out: AllocationPreview["lines"] = [];

  for (const line of lines) {
    if (!line.amount) continue;
    const c = byId.get(line.chargeId);
    if (!c) {
      errors.push("A selected period no longer belongs to this tenancy.");
      continue;
    }
    if (seen.has(c.id)) {
      errors.push(`${c.label} appears twice.`);
      continue;
    }
    seen.add(c.id);
    const before = toCents(outstandingOf(c));
    const applied = toCents(line.amount);
    if (applied < 0) errors.push(`Enter a positive amount for ${c.label}.`);
    if (applied > before) {
      errors.push(`${c.label} has only KSh ${fromCents(before).toLocaleString("en-KE")} left.`);
    }
    appliedCents += applied;
    const after = before - applied;
    out.push({
      chargeId: c.id,
      label: c.label,
      before: fromCents(before),
      applied: fromCents(applied),
      after: fromCents(after),
      status: after <= 0 ? "paid" : toCents(c.confirmed) + applied > 0 ? "partial" : "unpaid",
    });
  }

  const total = toCents(amount);
  if (appliedCents > total) errors.push("The amounts applied add up to more than the payment.");
  return {
    lines: out,
    applied: fromCents(appliedCents),
    credit: fromCents(Math.max(0, total - appliedCents)),
    errors,
  };
}
