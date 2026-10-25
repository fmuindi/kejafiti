// Tenant payment habits: each rent month settled oldest charge first by confirmed payments
// (public.tenancy_payment_record / tenant_payment_habits), turned into plain words for staff.

export type MonthState = "on_time" | "late" | "overdue" | "not_due" | "waived";

export type MonthRecord = {
  period_start: string;
  due_date: string;
  amount: number;
  paid_by_due: number;
  paid: number;
  settled_on: string | null;
  state: MonthState;
  days_late: number;
};

export type HabitRow = {
  tenancy_id: string;
  property_id: string;
  property_name: string;
  unit_id: string;
  unit_label: string;
  tenant_name: string;
  start_date: string;
  months_due: number;
  on_time: number;
  late: number;
  overdue: number;
  avg_days_late: number | null;
  max_days_late: number | null;
  on_time_streak: number;
  recent: MonthState[];
  last_paid_on: string | null;
  owed: number;
  promises_kept: number;
  promises_broken: number;
  reports: number;
};

export type HabitKey = "on_time" | "usually" | "often_late" | "new";

export const HABITS: Array<{ key: HabitKey; label: string; tone: "success" | "info" | "waiting" | "neutral" }> = [
  { key: "on_time", label: "Pays on time", tone: "success" },
  { key: "usually", label: "Usually on time", tone: "info" },
  { key: "often_late", label: "Often late", tone: "waiting" },
  { key: "new", label: "Too new to tell", tone: "neutral" },
];
export const HABIT = Object.fromEntries(HABITS.map((h) => [h.key, h])) as Record<HabitKey, (typeof HABITS)[number]>;

export const STATE_LABEL: Record<MonthState, string> = {
  on_time: "On time",
  late: "Paid late",
  overdue: "Overdue",
  not_due: "Not due yet",
  waived: "Nothing to pay",
};

/**
 * The habit in one phrase. Fewer than two due months is too new to tell; otherwise the share of
 * months fully paid by the due date: 90% or more pays on time, 60% or more usually on time.
 */
export function habitOf(r: Pick<HabitRow, "months_due" | "on_time">): HabitKey {
  if (r.months_due < 2) return "new";
  const rate = r.on_time / r.months_due;
  return rate >= 0.9 ? "on_time" : rate >= 0.6 ? "usually" : "often_late";
}

/** "Paid on time 9 of 12 months · late ones 6 days on average" */
export function habitSentence(r: HabitRow): string {
  if (r.months_due === 0) return "No rent due yet";
  const parts = [`On time ${r.on_time} of ${r.months_due} month${r.months_due === 1 ? "" : "s"}`];
  if (r.late && r.avg_days_late !== null) parts.push(`late ones ${formatDays(r.avg_days_late)} on average`);
  if (r.overdue) parts.push(`${r.overdue} overdue now`);
  return parts.join(" · ");
}

export function formatDays(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} day${v === 1 ? "" : "s"}`;
}

/** Most in need of attention first: overdue now, then often late, then by most days late. */
export function byConcern(a: HabitRow, b: HabitRow): number {
  const rank = (r: HabitRow) => (r.overdue ? 0 : habitOf(r) === "often_late" ? 1 : habitOf(r) === "usually" ? 2 : habitOf(r) === "new" ? 4 : 3);
  return rank(a) - rank(b) || (b.max_days_late ?? 0) - (a.max_days_late ?? 0) || b.owed - a.owed || a.unit_label.localeCompare(b.unit_label, undefined, { numeric: true });
}

export function toHabitRow(r: Record<string, unknown>): HabitRow {
  const x = r as unknown as HabitRow;
  return {
    ...x,
    owed: Number(x.owed),
    avg_days_late: x.avg_days_late === null ? null : Number(x.avg_days_late),
    recent: (x.recent ?? []) as MonthState[],
  };
}

export function toMonth(r: Record<string, unknown>): MonthRecord {
  const x = r as unknown as MonthRecord;
  return { ...x, amount: Number(x.amount), paid_by_due: Number(x.paid_by_due), paid: Number(x.paid) };
}
