import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import { ButtonLink, Eyebrow, StatusBadge, cx } from "@/components/ui/primitives";
import { FOLLOW_UP_LABEL, type DueFollowUp, type OwingRow, type PositionRow, type ReportedItem, type ReviewItem, type WorkItem } from "@/lib/dashboard";
import { formatDate, formatDateTime, formatPeriod, periodParam, timeAgo, todayEAT } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { formatRate } from "@/lib/rent/status";

// Building blocks of the workspace home (blueprint pages 7-8): a few large, tappable figures and
// cards that each open the records behind them. No decorative charts on the home.

export type ActionCardItem = { label: string; count: number; detail: string; href: string; icon: IconName; tone?: "waiting" | "error" };

/** Work that needs someone, as large tappable counts. A zero is shown calm, not hidden. */
export function ActionCards({ items }: { items: ActionCardItem[] }) {
  return (
    <ul className={cx("grid grid-cols-2 gap-3", items.length >= 5 ? "md:grid-cols-3 xl:grid-cols-5" : items.length === 4 ? "lg:grid-cols-4" : items.length === 3 ? "lg:grid-cols-3" : "")}>
      {items.map((a) => {
        const on = a.count > 0;
        return (
          <li key={a.label}>
            <Link
              href={a.href}
              className={cx(
                "flex h-full min-h-row flex-col gap-1 rounded-card border p-4 transition-colors",
                on ? (a.tone === "error" ? "border-error-line bg-error-tint hover:border-error" : "border-waiting-line bg-waiting-tint hover:border-waiting") : "surface hover:border-ink",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={cx("font-display text-title-lg font-bold tabular-nums", on ? (a.tone === "error" ? "text-error" : "text-waiting-strong") : "text-muted")}>{a.count}</span>
                <Icon name={a.icon} className={on ? (a.tone === "error" ? "text-error" : "text-waiting") : "text-muted"} />
              </span>
              <span className="font-semibold leading-snug">{a.label}</span>
              <span className="text-caption text-muted">{a.detail}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Find a unit, tenant, phone number or payment reference, within the properties this person can see. */
export function HomeSearch({ orgId, defaultValue, autoFocus }: { orgId: string; defaultValue?: string; autoFocus?: boolean }) {
  return (
    <form role="search" action={`/w/${orgId}/search`} className="flex min-h-field flex-1 items-center gap-2 rounded-control border border-input bg-surface px-3 focus-within:ring-2 focus-within:ring-deep/40">
      <Icon name="search" size={18} className="shrink-0 text-muted" />
      <label htmlFor="ws-search" className="sr-only">Search unit, tenant, phone or payment reference</label>
      <input
        id="ws-search"
        name="q"
        type="search"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        minLength={2}
        placeholder="Unit, tenant, phone or reference"
        className="min-w-0 flex-1 bg-transparent text-base focus:outline-none"
      />
    </form>
  );
}

/** "All · Sunrise · Example Court" as links, keeping the period. */
export function PropertyChips({ base, properties, current, period }: { base: string; properties: Array<{ id: string; name: string }>; current: string | null; period: string }) {
  if (properties.length < 2) return null;
  const href = (id: string | null) => `${base}?${new URLSearchParams({ period: periodParam(period), ...(id ? { property: id } : {}) })}`;
  return (
    <nav aria-label="Property" className="flex flex-wrap gap-2">
      {[{ id: null, name: "All properties" }, ...properties].map((p) => {
        const on = p.id === current;
        return (
          <Link key={p.id ?? "all"} href={href(p.id)} aria-current={on ? "page" : undefined} className={cx("inline-flex min-h-10 items-center rounded-full border-strong px-3.5 text-label font-semibold", on ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink")}>
            {p.name}
          </Link>
        );
      })}
    </nav>
  );
}

type Totals = { billed: number; settled: number; outstanding: number; collection_rate: number | null; occupied: number; lettable: number; unavailable: number; pending_count: number; owed_now: number; owing_tenancies: number };

/**
 * The owner's position for one rent period: billed, covered and outstanding, each opening the
 * records behind it. Coverage is confirmed allocations to this period's rent / that rent.
 */
export function PositionPanel({ t, period, links, changedAt }: {
  t: Totals;
  period: string;
  links: { billed: string; covered: string; outstanding: string; occupancy: string; pending: string; owing: string };
  changedAt: string | null;
}) {
  const pct = t.billed > 0 ? Math.min(100, (t.settled / t.billed) * 100) : 0;
  const month = formatPeriod(period).split(" ")[0];
  const vacant = Math.max(t.lettable - t.occupied, 0);
  return (
    <section aria-labelledby="position-h" className="surface flex flex-col gap-4 p-4 md:p-5">
      <h2 id="position-h" className="sr-only">Rent position for {formatPeriod(period)}</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Figure href={links.billed} label={`${month} rent billed`} value={formatMoney(t.billed)} />
        <Figure href={links.covered} label={`${month} covered`} value={formatMoney(t.settled)} tone="success" />
        <Figure href={links.outstanding} label={`${month} outstanding`} value={formatMoney(t.outstanding)} tone={t.outstanding > 0 ? "error" : undefined} />
      </ul>
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold">{month} rent coverage: {t.billed > 0 ? formatRate(t.collection_rate) : "Not applicable"}</p>
          {t.billed === 0 ? <span className="text-caption text-muted">No rent billed for {month} yet</span> : null}
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-cool" role="img" aria-label={t.billed > 0 ? `${formatRate(t.collection_rate)} of ${month} rent covered by confirmed payments` : "No rent billed"}>
          <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-label text-muted">
          <Link href={links.occupancy} className="hover:underline">{t.occupied} occupied of {t.lettable} rentable{vacant ? ` · ${vacant} vacant` : ""}</Link>
          {t.unavailable ? <span>{t.unavailable} unavailable, not counted</span> : null}
          {t.pending_count ? <Link href={links.pending} className="font-semibold text-waiting-strong hover:underline">{t.pending_count} payment{t.pending_count === 1 ? "" : "s"} awaiting confirmation</Link> : null}
        </p>
      </div>
      <Link href={links.owing} className={cx("flex items-center justify-between gap-3 rounded-control px-3 py-2.5", t.owed_now > 0 ? "bg-error-tint text-error hover:bg-error-tint/70" : "bg-success-tint text-success")}>
        <span className="font-semibold">
          {t.owed_now > 0
            ? `${formatMoney(t.owed_now)} overdue across all months · ${t.owing_tenancies} tenant${t.owing_tenancies === 1 ? "" : "s"}`
            : "Nobody has an overdue balance"}
        </span>
        {t.owed_now > 0 ? <Icon name="chevronRight" /> : <Icon name="check" />}
      </Link>
      <p className="text-caption text-muted">
        Based on records confirmed by property staff; payments awaiting confirmation aren&apos;t counted. Records last changed {changedAt ? formatDateTime(changedAt) : "never"}.
      </p>
    </section>
  );
}

function Figure({ href, label, value, tone }: { href: string; label: string; value: string; tone?: "success" | "error" }) {
  return (
    <li>
      <Link href={href} className="group flex h-full flex-col rounded-control border border-divider p-3 hover:border-ink">
        <span className="flex items-center justify-between text-label text-muted">
          {label} <Icon name="chevronRight" size={16} className="opacity-60 group-hover:opacity-100" />
        </span>
        <span className={cx("font-display text-title font-extrabold tabular-nums", tone === "error" ? "text-error" : tone === "success" ? "text-success" : "")}>{value}</span>
      </Link>
    </li>
  );
}

/** Who owes now, largest first, with what is already being done about it. */
export function OwingList({ orgId, rows, showProperty }: { orgId: string; rows: OwingRow[]; showProperty: boolean }) {
  const today = todayEAT();
  return (
    <ul className="surface-list">
      {rows.map((r) => {
        const notes = [
          `Overdue since ${formatDate(r.oldest_due, { year: false })}`,
          r.next_follow_up ? `${r.next_follow_up < today ? "Follow-up was due" : r.next_follow_up === today ? "Follow up today" : "Follow up"} ${formatDate(r.next_follow_up, { year: false })}` : r.last_contact_kind ? `${FOLLOW_UP_LABEL[r.last_contact_kind]} ${timeAgo(r.last_contact_at)}` : "No follow-up yet",
          r.last_reminder_at ? `Reminded ${timeAgo(r.last_reminder_at)}` : null,
        ].filter(Boolean);
        return (
          <li key={r.tenancy_id}>
            <Link href={`/w/${orgId}/rent/${r.property_id}/units/${r.unit_id}#follow-ups`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-cool">
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {r.tenant_name} <span className="font-normal text-muted">· {r.unit_label}{showProperty ? ` · ${r.property_name}` : ""}</span>
                </span>
                <span className="block text-caption text-muted">{notes.join(" · ")}</span>
                {r.pending_amount > 0 ? <span className="block text-caption font-semibold text-waiting-strong">{formatMoney(r.pending_amount)} submitted, awaiting confirmation</span> : null}
                {r.tenancy_status === "ended" ? <span className="block text-caption text-muted">Former tenant</span> : null}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-error">{formatMoney(r.owed)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Properties side by side for the same period and cut-off. Cards on a phone, a table on wider screens. */
export function PropertyComparison({ orgId, rows, period }: { orgId: string; rows: PositionRow[]; period: string }) {
  const href = (r: PositionRow) => `/w/${orgId}/rent/${r.property_id}?period=${periodParam(period)}`;
  const occ = (r: PositionRow) => (r.lettable ? `${Math.round((r.occupied / r.lettable) * 100)}% · ${r.occupied}/${r.lettable}` : "Not applicable");
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => (
          <li key={r.property_id}>
            <Link href={href(r)} className="surface flex flex-col gap-1 p-4 hover:border-ink">
              <span className="flex items-center justify-between gap-2 font-semibold">{r.property_name} <Icon name="chevronRight" className="text-muted" /></span>
              <span className="text-label">{r.billed ? `${formatRate(r.collection_rate)} covered · ${formatMoney(r.settled)} of ${formatMoney(r.billed)}` : "No rent billed this period"}</span>
              <span className="text-caption text-muted">
                {r.owed_now ? <span className="font-semibold text-error">{formatMoney(r.owed_now)} overdue</span> : "Nothing overdue"} · occupancy {occ(r)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="surface hidden overflow-x-auto md:block" tabIndex={0} role="region" aria-label="Properties compared (scrolls sideways)">
        <table className="w-full min-w-[720px] text-label">
          <caption className="sr-only">Each property for {formatPeriod(period)}: billed, covered, coverage, overdue now, occupancy and the latest confirmation</caption>
          <thead>
            <tr className="border-b border-line text-left font-mono text-micro tracking-caps text-muted uppercase">
              <th scope="col" className="px-4 py-2.5 font-medium">Property</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Billed</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Covered</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Coverage</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Overdue now</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Occupancy</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Last confirmation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.property_id} className="border-b border-divider last:border-0 hover:bg-cool">
                <th scope="row" className="px-4 py-3 text-left font-semibold">
                  <Link href={href(r)} className="hover:underline">{r.property_name}</Link>
                </th>
                <td className="px-3 py-3 text-right tabular-nums">{formatAmount(r.billed)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatAmount(r.settled)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{r.billed ? formatRate(r.collection_rate) : "N/A"}</td>
                <td className={cx("px-3 py-3 text-right tabular-nums", r.owed_now ? "font-semibold text-error" : "text-muted")}>{formatAmount(r.owed_now)}</td>
                <td className="px-3 py-3">{occ(r)}</td>
                <td className="px-4 py-3 text-muted">{r.last_confirmed_at ? timeAgo(r.last_confirmed_at) : "None yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** The manager's own queue: what to review, fix and follow up, each with its next action. */
export function QueueList({ orgId, review, work, followUps, reported = [] }: { orgId: string; review: ReviewItem[]; work: WorkItem[]; followUps: DueFollowUp[]; reported?: ReportedItem[] }) {
  const today = todayEAT();
  const rows: Array<{ key: string; title: string; detail: string; action: string; href: string; tone: "waiting" | "error" | "info" }> = [
    ...work.filter((w) => w.grp === "returned").map((w) => ({
      key: `w${w.entry_id}`,
      title: `${w.unit_label} · ${formatMoney(w.amount)} returned to you`,
      detail: w.decision_reason ? `"${w.decision_reason}"` : w.property_name,
      action: "Fix",
      href: `/w/${orgId}/rent/mine#returned`,
      tone: "error" as const,
    })),
    ...reported.map((r) => ({
      key: `p${r.id}`,
      title: `${r.unit_label} · ${r.tenant_name}`,
      detail: `Missing payment reported: ${formatMoney(r.amount)} on ${formatDate(r.paid_on, { year: false })}${r.reference ? ` · ${r.reference}` : ""}`,
      action: "Check",
      href: `/w/${orgId}/rent/${r.property_id}/units/${r.unit_id}#reported`,
      tone: "waiting" as const,
    })),
    ...review.map((e) => ({
      key: `r${e.id}`,
      title: `${e.unit_label} · ${e.tenant_name}`,
      detail: `${formatMoney(e.amount)} submitted${e.submitted_by_name ? ` by ${e.submitted_by_name}` : ""}`,
      action: "Review",
      href: `/w/${orgId}/rent/inbox?property=${e.property_id}`,
      tone: "waiting" as const,
    })),
    ...followUps.map((f) => ({
      key: `f${f.id}`,
      title: `${f.unit_label} · ${f.tenant_name}`,
      detail: `${FOLLOW_UP_LABEL[f.kind]}${f.note ? `: ${f.note}` : ""} · ${f.due_on < today ? `was due ${formatDate(f.due_on, { year: false })}` : "due today"}`,
      action: "Open",
      href: `/w/${orgId}/rent/${f.property_id}/units/${f.unit_id}#follow-ups`,
      tone: "info" as const,
    })),
    ...work.filter((w) => w.grp === "drafts").map((w) => ({
      key: `d${w.entry_id}`,
      title: `${w.unit_label} · ${formatMoney(w.amount)} draft`,
      detail: `${w.property_name} · not submitted yet`,
      action: "Finish",
      href: `/w/${orgId}/rent/mine#drafts`,
      tone: "waiting" as const,
    })),
  ];
  if (!rows.length) {
    return (
      <p className="surface-empty flex items-center gap-2 p-4">
        <Icon name="check" size={18} className="text-success" /> Nothing waiting on you. New submissions and follow-ups appear here.
      </p>
    );
  }
  return (
    <ul className="surface-list">
      {rows.slice(0, 12).map((r) => (
        <li key={r.key}>
          <Link href={r.href} className="flex items-center gap-3 px-4 py-3 hover:bg-cool">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{r.title}</span>
              <span className="block truncate text-caption text-muted">{r.detail}</span>
            </span>
            <StatusBadge tone={r.tone} icon={null} className="shrink-0">{r.action}</StatusBadge>
          </Link>
        </li>
      ))}
      {rows.length > 12 ? <li className="px-4 py-3 text-caption text-muted">And {rows.length - 12} more in the inbox, My entries and the unit pages.</li> : null}
    </ul>
  );
}

/** A small "rent this month" summary for people whose home is the work queue. */
export function RentSnapshot({ href, t, period }: { href: string; t: Totals; period: string }) {
  return (
    <Link href={href} className="surface flex flex-col gap-2 p-4 hover:border-ink">
      <Eyebrow>Rent · {formatPeriod(period)}</Eyebrow>
      {t.billed > 0 ? (
        <>
          <p>
            <span className="font-display text-title font-extrabold">{formatMoney(t.settled)}</span>
            <span className="text-muted"> of {formatMoney(t.billed)} covered · {formatRate(t.collection_rate)}</span>
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-cool" aria-hidden="true">
            <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, (t.settled / t.billed) * 100)}%` }} />
          </div>
        </>
      ) : (
        <p className="text-label text-muted">No rent billed for this month yet.</p>
      )}
      <p className="text-caption text-muted">Confirmed records only. Open Performance for the detail.</p>
    </Link>
  );
}

export function QuickActions({ actions }: { actions: Array<{ href: string; label: string; icon: IconName; primary?: boolean }> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <ButtonLink key={a.label} href={a.href} icon={a.icon} variant={a.primary ? "primary" : "secondary"} size="sm">
          {a.label}
        </ButtonLink>
      ))}
    </div>
  );
}
