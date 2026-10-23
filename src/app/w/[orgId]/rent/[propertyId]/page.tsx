import Link from "next/link";
import { RentStatusBadge } from "@/components/rent/badges";
import { PeriodNav, periodHref } from "@/components/rent/period-nav";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, EmptyState, Eyebrow, Notice, cx } from "@/components/ui/primitives";
import { getProfile, requireWorkspace } from "@/lib/auth";
import { formatDate, formatDateTime, parsePeriodParam, periodParam, formatPeriod } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { getProperty, getRegister, getSummary, getVisibleProperties, type RegisterRow } from "@/lib/rent/queries";
import { ROLE_LABEL, formatRate } from "@/lib/rent/status";
import { createClient } from "@/lib/supabase/server";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unpaid", label: "Unpaid" },
  { key: "partial", label: "Partial" },
  { key: "paid", label: "Paid" },
  { key: "pending", label: "Pending" },
] as const;

function matches(r: RegisterRow, filter: string) {
  if (filter === "unpaid") return r.rent_status === "unpaid" || r.rent_status === "not_yet_due";
  if (filter === "partial") return r.rent_status === "partial";
  if (filter === "paid") return r.rent_status === "paid" || r.rent_status === "credit";
  if (filter === "pending") return r.pending_count > 0;
  return true;
}

function lineFor(r: RegisterRow) {
  if (!r.tenancy_id) return r.occupancy === "unavailable" ? "Not available to let" : "No rent due · no tenant";
  if (r.rent_status === "no_charge") return "Charge not created for this period";
  if (r.rent_status === "paid" || r.rent_status === "credit") {
    return `KSh ${formatAmount(r.billed)} · confirmed ${r.last_confirmed_at ? formatDate(r.last_confirmed_at, { year: false }) : ""}${r.last_confirmed_by ? ` by ${r.last_confirmed_by}` : ""}${r.credit ? ` · credit KSh ${formatAmount(r.credit)}` : ""}`;
  }
  if (r.rent_status === "partial") return `Paid ${formatAmount(r.confirmed)} of ${formatAmount(r.billed)} · KSh ${formatAmount(r.outstanding)} left`;
  return `KSh ${formatAmount(r.billed)} due ${r.due_date ? formatDate(r.due_date, { year: false }) : ""} · nothing confirmed`;
}

export default async function RegisterPage({ params, searchParams }: PageProps<"/w/[orgId]/rent/[propertyId]">) {
  const { orgId, propertyId } = await params;
  const sp = await searchParams;
  const base = `/w/${orgId}/rent/${propertyId}`;
  const ws = await requireWorkspace(orgId, base);
  const supabase = await createClient();
  const property = await getProperty(supabase, ws, propertyId);
  const period = parsePeriodParam(sp.period);
  const filter = typeof sp.filter === "string" && FILTERS.some((f) => f.key === sp.filter) ? sp.filter : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";

  // IMP-15: when the confirmed figures last changed, never the time this page was drawn.
  const { data: changedAt } = await supabase.rpc("records_changed_at", { p_org: orgId, p_property: propertyId });
  const [{ rows, error }, { summary }, properties, me] = await Promise.all([
    getRegister(supabase, propertyId, period),
    getSummary(supabase, orgId, propertyId, period),
    getVisibleProperties(supabase, orgId),
    getProfile(),
  ]);
  const needCharges = rows.some((r) => r.tenancy_id && r.rent_status === "no_charge");
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((r) => matches(r, f.key)).length]));
  const visible = rows.filter((r) => matches(r, filter) && (!q || r.unit_label.toLowerCase().includes(q) || (r.tenant_name ?? "").toLowerCase().includes(q)));
  const occupiedNote = summary ? `Due day ${property.rent_due_day} · ${summary.occupied} occupied of ${summary.units_total} units` : undefined;
  const hrefFor = periodHref(base, { filter: filter === "all" ? undefined : filter });
  const pct = summary && summary.billed ? Math.min(100, (summary.settled / summary.billed) * 100) : 0;

  return (
    <div className="mx-auto flex max-w-standard flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>
            {(me?.full_name || "You").toUpperCase()} · {ROLE_LABEL[ws.role].toUpperCase()}
          </Eyebrow>
          {properties.length > 1 ? (
            <details className="relative mt-1">
              <summary className="flex cursor-pointer list-none items-center gap-1 font-display text-title font-bold md:text-display-sm">
                {property.name} <Icon name="chevronDown" />
              </summary>
              <ul className="surface absolute z-20 mt-2 w-72 p-1.5 shadow-raised">
                {properties.map((p) => (
                  <li key={p.id}>
                    <Link href={`/w/${orgId}/rent/${p.id}?period=${periodParam(period)}`} className={cx("block rounded-control px-3 py-2.5", p.id === propertyId ? "bg-cool font-semibold" : "hover:bg-cool")}>
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <h1 className="heading-page mt-1">{property.name}</h1>
          )}
        </div>
        <div className="hidden gap-2 md:flex">
          <ButtonLink href={`${base}/charges?period=${periodParam(period)}`} variant="secondary" size="sm">
            Charges
          </ButtonLink>
          <ButtonLink href={`/w/${orgId}/dashboard?property=${propertyId}&period=${periodParam(period)}`} variant="secondary" size="sm">
            Dashboard
          </ButtonLink>
        </div>
      </div>

      <PeriodNav period={period} hrefFor={hrefFor} note={occupiedNote} />

      {error ? (
        <Notice tone="error" role="alert" title="We couldn't load the register.">
          Nothing has changed. Check your connection and reload.
        </Notice>
      ) : null}

      {summary ? (
        <section aria-label={`${formatPeriod(period)} summary`} className="surface p-4">
          <p>
            <span className="font-display text-title-lg font-extrabold">{formatMoney(summary.settled)}</span>{" "}
            <span className="text-muted">confirmed of {formatAmount(summary.billed)} billed</span>
          </p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-cool" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Share of billed rent confirmed">
            <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-label text-muted">
            {formatRate(summary.collection_rate)} collected · {formatMoney(summary.outstanding)} outstanding
            {summary.overdue ? ` · ${formatMoney(summary.overdue)} overdue` : ""}
          </p>
          <p className="mt-1 text-micro text-muted">Confirmed by property staff · Records last changed {changedAt ? formatDateTime(changedAt) : "never"} · Pending entries are not counted</p>
        </section>
      ) : null}

      {summary && summary.pending_count > 0 ? (
        ws.can_confirm ? (
          <Link href={`/w/${orgId}/rent/inbox?property=${propertyId}`} className="flex min-h-row items-center gap-3 rounded-card border border-waiting-line bg-waiting-tint px-4 text-body font-semibold text-waiting-strong">
            <Icon name="clock" />
            {summary.pending_count} entr{summary.pending_count === 1 ? "y" : "ies"} awaiting your confirmation · {formatMoney(summary.pending_amount)}
            <Icon name="chevronRight" className="ml-auto" />
          </Link>
        ) : (
          <Notice tone="waiting">
            {summary.pending_count} entr{summary.pending_count === 1 ? "y is" : "ies are"} awaiting confirmation by a manager ({formatMoney(summary.pending_amount)}). They don&apos;t count until confirmed.
          </Notice>
        )
      ) : null}

      {needCharges ? (
        <Notice
          tone="info"
          title={`${formatPeriod(period)} rent charges haven't been created for every tenancy`}
          action={
            ws.can_manage_tenancies || ws.can_confirm ? (
              <ButtonLink href={`${base}/charges?period=${periodParam(period)}`} size="sm" variant="secondary">
                Review and create charges
              </ButtonLink>
            ) : undefined
          }
        >
          Balances for those units show &quot;No charge yet&quot; until the charges are created.
        </Notice>
      ) : null}

      <form className="flex flex-col gap-3" role="search" action={base}>
        <input type="hidden" name="period" value={periodParam(period)} />
        {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
        <label htmlFor="q" className="sr-only">
          Search units or tenants
        </label>
        <div className="flex min-h-field items-center gap-2 rounded-control border border-input bg-surface px-3 focus-within:ring-2 focus-within:ring-deep/40">
          <Icon name="search" className="text-muted" />
          <input id="q" name="q" defaultValue={q} placeholder="Search unit or tenant" className="min-w-0 flex-1 bg-transparent text-base focus:outline-none" />
        </div>
      </form>
      <nav aria-label="Filter units" className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`${base}?period=${periodParam(period)}${f.key === "all" ? "" : `&filter=${f.key}`}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            aria-current={filter === f.key ? "true" : undefined}
            className={cx(
              "inline-flex min-h-10 shrink-0 items-center rounded-full border-strong px-3.5 text-label font-semibold",
              filter === f.key ? "border-ink bg-ink text-white" : "border-line bg-surface",
            )}
          >
            {f.label} {counts[f.key]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState title="No units in this property yet" icon="building" action={<ButtonLink href={`/w/${orgId}/properties/${propertyId}`}>Add units</ButtonLink>}>
          Add the units, then set up current tenancies with any opening balances.
        </EmptyState>
      ) : visible.length === 0 ? (
        <p className="surface-empty p-6 text-center">No units match this filter.</p>
      ) : (
        <ul className="surface-list">
          {visible.map((r) => (
            <li key={`${r.unit_id}-${r.tenancy_id ?? "none"}`} className="flex flex-col gap-2 px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <Link href={`${base}/units/${r.unit_id}?period=${periodParam(period)}`} className="min-w-0 hover:underline">
                  <span className="font-mono text-body font-medium">{r.unit_label}</span>
                  <span className="font-semibold"> · {r.tenant_name ?? "No tenant"}</span>
                  {r.tenancy_status === "ended" ? <span className="text-caption text-muted"> (former tenant)</span> : null}
                  <span className="block text-label text-muted">{lineFor(r)}</span>
                </Link>
                <RentStatusBadge status={r.rent_status} overdue={r.overdue} />
              </div>
              {r.pending_count > 0 ? (
                <Link href={ws.can_confirm ? `/w/${orgId}/rent/inbox?property=${propertyId}` : `${base}/units/${r.unit_id}?period=${periodParam(period)}`} className="inline-flex items-center gap-1.5 text-label font-semibold text-waiting">
                  <Icon name="clock" size={16} />
                  Pending {formatMoney(r.pending_amount)}
                  {r.pending_by ? ` from ${r.pending_by}` : ""} · {ws.can_confirm ? "Review" : "awaiting confirmation"}
                </Link>
              ) : null}
              {r.tenancy_id && ws.can_enter_payments && r.rent_status !== "paid" && r.rent_status !== "credit" ? (
                <ButtonLink href={`${base}/record?tenancy=${r.tenancy_id}&period=${periodParam(period)}`} variant="secondary" icon="plus" className="w-full">
                  Record payment
                </ButtonLink>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 md:hidden">
        <ButtonLink href={`${base}/charges?period=${periodParam(period)}`} variant="secondary" size="sm" className="flex-1">
          Charges
        </ButtonLink>
        <ButtonLink href={`/w/${orgId}/dashboard?property=${propertyId}&period=${periodParam(period)}`} variant="secondary" size="sm" className="flex-1">
          Dashboard
        </ButtonLink>
      </div>
    </div>
  );
}
