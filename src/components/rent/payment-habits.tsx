import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import { StatusBadge, cx } from "@/components/ui/primitives";
import { formatDate, formatDateTime, formatPeriod, formatPeriodShort, timeAgo } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { HABIT, HABITS, STATE_LABEL, formatDays, habitOf, habitSentence, type HabitKey, type HabitRow, type MonthRecord, type MonthState } from "@/lib/rent/habits";

// Each month's state is carried by colour AND a mark (tick, +days, days overdue), so it never
// depends on colour alone; every strip has a legend, a sentence and a table with the same facts.

const CELL: Record<MonthState, string> = {
  on_time: "bg-success-tint text-success border-success-line",
  late: "bg-waiting-tint text-waiting-strong border-waiting-line",
  overdue: "bg-error-tint text-error border-error-line",
  not_due: "bg-surface text-muted border-dashed border-line",
  waived: "bg-cool text-deep border-info-line",
};
const SWATCH: Record<MonthState, string> = {
  on_time: "bg-success",
  late: "bg-waiting",
  overdue: "bg-error",
  not_due: "border border-dashed border-muted bg-surface",
  waived: "bg-deep/40",
};

function mark(m: Pick<MonthRecord, "state" | "days_late">): string {
  if (m.state === "on_time") return "✓";
  if (m.state === "late") return `+${m.days_late}d`;
  if (m.state === "overdue") return `${m.days_late}d`;
  if (m.state === "waived") return "0";
  return "–";
}

function describeMonth(m: MonthRecord): string {
  const month = formatPeriod(m.period_start);
  if (m.state === "on_time") return `${month}: paid on time${m.settled_on ? `, by ${formatDate(m.settled_on, { year: false })}` : ""}`;
  if (m.state === "late") return `${month}: paid ${m.days_late} day${m.days_late === 1 ? "" : "s"} late, on ${formatDate(m.settled_on, { year: false })}${m.paid_by_due > 0 ? ` (${formatMoney(m.paid_by_due)} by the due date)` : ""}`;
  if (m.state === "overdue") return `${month}: ${formatMoney(m.amount - m.paid)} still unpaid, ${m.days_late} day${m.days_late === 1 ? "" : "s"} overdue`;
  if (m.state === "waived") return `${month}: nothing to pay after adjustments`;
  return `${month}: due ${formatDate(m.due_date, { year: false })}${m.paid > 0 ? `, ${formatMoney(m.paid)} paid so far` : ""}`;
}

export function HabitBadge({ row, className }: { row: Pick<HabitRow, "months_due" | "on_time">; className?: string }) {
  const h = HABIT[habitOf(row)];
  return (
    <StatusBadge tone={h.tone} icon={h.key === "on_time" ? "check" : h.key === "often_late" ? "clock" : null} className={className}>
      {h.label}
    </StatusBadge>
  );
}

function Legend({ states }: { states: MonthState[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted" aria-label="Key">
      {states.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span className={cx("inline-block size-3 rounded-chip", SWATCH[s])} aria-hidden="true" />
          {STATE_LABEL[s]}
          {s === "late" ? " (+days)" : s === "overdue" ? " (days)" : ""}
        </li>
      ))}
    </ul>
  );
}

/** Twelve rent months in a row, oldest first: on time, paid late (+days), overdue (days so far). */
export function MonthStrip({ months }: { months: MonthRecord[] }) {
  if (!months.length) return <p className="text-label text-muted">No rent charged yet.</p>;
  const present = (["on_time", "late", "overdue", "not_due", "waived"] as MonthState[]).filter((s) => months.some((m) => m.state === s));
  return (
    <figure className="flex flex-col gap-3">
      <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-12" aria-label="Rent months, oldest first">
        {months.map((m) => (
          <li key={m.period_start} title={describeMonth(m)} className="flex flex-col items-center gap-1">
            <span className="text-micro text-muted" aria-hidden="true">{formatPeriodShort(m.period_start)}</span>
            <span className={cx("flex h-10 w-full items-center justify-center rounded-chip border text-caption font-bold tabular-nums", CELL[m.state])} aria-hidden="true">
              {mark(m)}
            </span>
            <span className="sr-only">{describeMonth(m)}</span>
          </li>
        ))}
      </ol>
      <Legend states={present} />
      <details className="group">
        <summary className="link-action inline-flex min-h-11 cursor-pointer list-none items-center text-label">Show as a table</summary>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Rent months table (scrolls sideways)">
          <table className="w-full min-w-[520px] text-label">
            <caption className="sr-only">Each rent month: amount, due date, when it was fully paid and how late</caption>
            <thead>
              <tr className="border-b border-line text-left font-mono text-micro text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Month</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Rent</th>
                <th scope="col" className="py-2 pr-3 font-medium">Due</th>
                <th scope="col" className="py-2 pr-3 font-medium">Fully paid</th>
                <th scope="col" className="py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.period_start} className="border-b border-divider last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">{formatPeriod(m.period_start)}</th>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatAmount(m.amount)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDate(m.due_date, { year: false })}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{m.settled_on ? formatDate(m.settled_on, { year: false }) : m.paid > 0 ? `${formatAmount(m.paid)} so far` : "—"}</td>
                  <td className="py-2">
                    {STATE_LABEL[m.state]}
                    {m.state === "late" || m.state === "overdue" ? ` · ${m.days_late} day${m.days_late === 1 ? "" : "s"}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** The last six due months as small squares, for lists. */
export function MiniStrip({ recent }: { recent: MonthState[] }) {
  if (!recent.length) return <span className="text-caption text-muted">No months due yet</span>;
  const counts = (["on_time", "late", "overdue"] as MonthState[]).map((s) => [s, recent.filter((x) => x === s).length] as const).filter(([, n]) => n);
  return (
    <span className="inline-flex items-center gap-1">
      {recent.map((s, i) => (
        <span key={i} className={cx("inline-block size-3.5 rounded-chip", SWATCH[s])} aria-hidden="true" />
      ))}
      <span className="sr-only">
        Last {recent.length} months: {counts.map(([s, n]) => `${n} ${STATE_LABEL[s].toLowerCase()}`).join(", ")}
      </span>
    </span>
  );
}

/** The habit and the figures behind it, as small tiles. */
export function HabitFigures({ row }: { row: HabitRow }) {
  const tiles: Array<{ label: string; value: string; note?: string; tone?: "error" | "waiting" | "success" }> = [
    { label: "On time", value: `${row.on_time} of ${row.months_due}`, note: row.months_due ? `${Math.round((row.on_time / row.months_due) * 100)}% of due months` : "No months due yet", tone: row.months_due && row.on_time === row.months_due ? "success" : undefined },
    { label: "Paid late", value: String(row.late), note: row.avg_days_late !== null ? `${formatDays(row.avg_days_late)} late on average` : "Never late", tone: row.late ? "waiting" : undefined },
    { label: "Longest wait", value: row.max_days_late ? formatDays(row.max_days_late) : "—", note: row.overdue ? `${row.overdue} month${row.overdue === 1 ? "" : "s"} overdue now` : "Past the due date", tone: row.overdue ? "error" : undefined },
    { label: "On-time run", value: `${row.on_time_streak} month${row.on_time_streak === 1 ? "" : "s"}`, note: "In a row, latest first" },
    {
      label: "Promises to pay",
      value: row.promises_kept + row.promises_broken ? `${row.promises_kept} of ${row.promises_kept + row.promises_broken} kept` : "None",
      note: row.promises_broken ? `${row.promises_broken} missed` : "From follow-ups",
      tone: row.promises_broken ? "waiting" : undefined,
    },
    { label: "Last payment", value: row.last_paid_on ? formatDate(row.last_paid_on, { year: false }) : "None yet", note: row.reports ? `${row.reports} missing-payment report${row.reports === 1 ? "" : "s"}` : "Confirmed payments only" },
  ];
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Payment figures">
      {tiles.map((t) => (
        <li key={t.label} className="rounded-control border border-divider p-3">
          <span className="block text-caption text-muted">{t.label}</span>
          <span className={cx("block font-display text-lead font-bold tabular-nums", t.tone === "error" ? "text-error" : t.tone === "waiting" ? "text-waiting-strong" : t.tone === "success" ? "text-success" : "")}>{t.value}</span>
          {t.note ? <span className="block text-micro text-muted">{t.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function HabitSummary({ row }: { row: HabitRow }) {
  return (
    <p className="text-label">
      <HabitBadge row={row} className="mr-2 align-middle" />
      <span className="align-middle text-muted">{habitSentence(row)}</span>
    </p>
  );
}

// Activity -------------------------------------------------------------------------------------

export type Activity = { at: string; kind: string; title: string; detail: string | null; tone: "success" | "waiting" | "error" | "info" | "neutral"; ref_id: string };

const ACTIVITY_ICON: Array<[RegExp, IconName]> = [
  [/^payment_confirmed/, "check"],
  [/^payment_/, "wallet"],
  [/^message_/, "mail"],
  [/^follow_up_/, "clock"],
  [/^report|^reported/, "alert"],
  [/^adjustment/, "edit"],
];
const DOT: Record<Activity["tone"], string> = {
  success: "bg-success-tint text-success",
  waiting: "bg-waiting-tint text-waiting-strong",
  error: "bg-error-tint text-error",
  info: "bg-cool text-deep",
  neutral: "bg-cool text-muted",
};

/** One timeline of what happened on the tenancy, newest first. */
export function ActivityTimeline({ items, entryHref }: { items: Activity[]; entryHref: (id: string) => string }) {
  if (!items.length) return <p className="text-label text-muted">Nothing has happened on this tenancy yet.</p>;
  return (
    <ol className="flex flex-col">
      {items.map((a, i) => {
        const icon = ACTIVITY_ICON.find(([re]) => re.test(a.kind))?.[1] ?? "info";
        const link = a.kind.startsWith("payment_") ? entryHref(a.ref_id) : null;
        return (
          <li key={`${a.kind}${a.ref_id}${i}`} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 ? <span className="absolute top-8 bottom-0 left-[15px] w-px bg-divider" aria-hidden="true" /> : null}
            <span className={cx("relative flex size-8 shrink-0 items-center justify-center rounded-full", DOT[a.tone])} aria-hidden="true">
              <Icon name={icon} size={16} />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="font-semibold leading-snug">
                {link ? <Link href={link} className="hover:underline">{a.title}</Link> : a.title}
              </p>
              {a.detail ? <p className="text-label text-muted break-words">{a.detail}</p> : null}
              <p className="text-micro text-muted">
                <time dateTime={a.at} title={formatDateTime(a.at)}>{timeAgo(a.at)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Portfolio -----------------------------------------------------------------------------------

const BAR: Record<HabitKey, string> = { on_time: "bg-success", usually: "bg-deep/60", often_late: "bg-waiting", new: "bg-divider" };

/** How many tenants pay on time, usually on time, often late, or are too new to tell. */
export function HabitDistribution({ rows, hrefFor, current }: { rows: HabitRow[]; hrefFor: (k: HabitKey | null) => string; current?: HabitKey | null }) {
  const counts = HABITS.map((h) => ({ ...h, n: rows.filter((r) => habitOf(r) === h.key).length }));
  const total = rows.length || 1;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {counts.filter((c) => c.n).map((c) => (
          <span key={c.key} className={cx("h-full first:rounded-l-full last:rounded-r-full", BAR[c.key])} style={{ width: `${(c.n / total) * 100}%` }} />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {counts.map((c) => (
          <li key={c.key}>
            <Link
              href={current === c.key ? hrefFor(null) : hrefFor(c.key)}
              aria-current={current === c.key ? "page" : undefined}
              className={cx("flex min-h-row items-center gap-2 rounded-control border px-3 py-2 hover:border-ink", current === c.key ? "border-strong border-ink bg-cool" : "border-divider")}
            >
              <span className={cx("inline-block size-3 shrink-0 rounded-chip", BAR[c.key])} aria-hidden="true" />
              <span className="min-w-0 flex-1 text-label leading-tight">{c.label}</span>
              <span className="font-display text-lead font-bold tabular-nums">{c.n}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
