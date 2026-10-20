import type { Metadata } from "next";
import Link from "next/link";
import { TrendChart } from "@/components/rent/trend-chart";
import { Icon } from "@/components/ui/icon";
import { EmptyState, Eyebrow, Notice, cx } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth";
import { addMonths, currentPeriod, formatDate, formatDateTime, formatPeriod, isoHoursAgo, parsePeriodParam, periodParam } from "@/lib/dates";
import { formatAmount, formatMoney, sumAmounts } from "@/lib/money";
import { getRegister, getSummary, getVisibleProperties } from "@/lib/rent/queries";
import { RENT_STATUS, formatRate } from "@/lib/rent/status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rent dashboard" };

const AGE_LABEL: Record<string, string> = { "0_30": "Up to 30 days", "31_60": "31 to 60 days", "61_plus": "Over 60 days", former: "Former tenants (kept separate)" };
const TILE: Record<string, string> = { success: "bg-success-tint text-success", waiting: "bg-waiting-tint text-waiting-strong", error: "bg-error-tint text-error", neutral: "bg-surface text-ink border border-line", info: "bg-cool text-deep" };

export default async function DashboardPage({ params, searchParams }: PageProps<"/w/[orgId]/dashboard">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/dashboard`);
  const supabase = await createClient();
  const properties = await getVisibleProperties(supabase, orgId);
  const propertyId = typeof sp.property === "string" && properties.some((p) => p.id === sp.property) ? sp.property : properties.length === 1 ? properties[0].id : null;
  const period = parsePeriodParam(sp.period);
  const view = sp.view === "paid" ? "paid" : "period";
  const property = properties.find((p) => p.id === propertyId);

  if (properties.length === 0) {
    return <EmptyState title="No rent records yet" icon="chart">Add a property and its tenancies to see collection figures here.</EmptyState>;
  }

  const [{ summary }, trend, ageing, staff, payments, register, reports] = await Promise.all([
    getSummary(supabase, orgId, propertyId, period),
    supabase.rpc("rent_trend", { p_org: orgId, p_property: propertyId as string, p_last_period: period, p_months: 6 }),
    supabase.rpc("arrears_ageing", { p_org: orgId, p_property: propertyId as string }),
    supabase.rpc("staff_activity", { p_org: orgId, p_property: propertyId as string, p_month: period }),
    view === "paid" ? supabase.rpc("payments_by_date", { p_org: orgId, p_property: propertyId as string, p_month: period }) : Promise.resolve({ data: [] }),
    propertyId ? getRegister(supabase, propertyId, period) : Promise.resolve({ rows: [] }),
    propertyId ? supabase.from("report_versions").select("id, version, finalized_at").eq("property_id", propertyId).eq("period_start", period).order("version", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const { data: corrections } = await supabase
    .from("entry_events")
    .select("id, reason, created_at, actor_id, entry_id, payment_entries(ref, units(label))")
    .eq("org_id", orgId)
    .eq("action", "reversed")
    .gte("created_at", isoHoursAgo(45 * 24))
    .order("created_at", { ascending: false })
    .limit(5);

  const base = `/w/${orgId}/dashboard`;
  const q = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const merged = { property: propertyId ?? undefined, period: periodParam(period), view: view === "paid" ? "paid" : undefined, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    return `${base}?${u}`;
  };
  const periods = Array.from({ length: 12 }, (_, i) => addMonths(currentPeriod(), -i));
  const s = summary;
  const payRows = (payments.data ?? []) as Array<{ ref: string; unit_label: string; tenant_name: string; amount: number; paid_on: string; method: string | null; recorded_by: string; confirmed_by: string; confirmed_at: string }>;
  const finalVersions = (reports.data ?? []) as Array<{ id: string; version: number; finalized_at: string }>;

  return (
    <div className="flex flex-col gap-6">
      <Notice tone="info">Tenants pay through each property&apos;s own arrangements. Figures here are records your staff entered and confirmed.</Notice>
      <div>
        <Eyebrow>Rent records</Eyebrow>
        <h1 className="mt-1 font-display text-[30px] leading-none font-bold tracking-[-1px] md:text-[40px]">
          {property?.name ?? "All properties"} · {formatPeriod(period).split(" ")[0]}
        </h1>
      </div>

      <form className="flex flex-wrap items-end gap-2" aria-label="Dashboard filters">
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Property
          <select name="property" defaultValue={propertyId ?? ""} className="min-h-11 rounded-[12px] border border-line bg-surface px-3 text-[14.5px] font-semibold text-ink">
            {properties.length > 1 ? <option value="">All properties</option> : null}
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Period
          <select name="period" defaultValue={periodParam(period)} className="min-h-11 rounded-[12px] border border-line bg-surface px-3 text-[14.5px] font-semibold text-ink">
            {periods.map((p) => <option key={p} value={periodParam(p)}>{formatPeriod(p)}</option>)}
          </select>
        </label>
        <input type="hidden" name="view" value={view === "paid" ? "paid" : ""} />
        <button type="submit" className="min-h-11 rounded-[12px] bg-ink px-4 text-[14.5px] font-semibold text-white">Apply</button>
        <div role="group" aria-label="Basis" className="ml-auto flex rounded-[12px] bg-cool p-1">
          <Link href={q({ view: undefined })} aria-current={view === "period" ? "true" : undefined} className={cx("rounded-[10px] px-3 py-2 text-[14px] font-semibold", view === "period" ? "bg-surface shadow-[0_0_0_1px_#ccc]" : "text-muted")}>By rent period</Link>
          <Link href={q({ view: "paid" })} aria-current={view === "paid" ? "true" : undefined} className={cx("rounded-[10px] px-3 py-2 text-[14px] font-semibold", view === "paid" ? "bg-surface shadow-[0_0_0_1px_#ccc]" : "text-muted")}>By payment date</Link>
        </div>
        {(ws.can_export || ws.role === "owner" || ws.role === "agency_admin") && propertyId ? (
          <a href={`/api/export/register?property=${propertyId}&period=${periodParam(period)}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] border-[1.5px] border-ink px-4 text-[14.5px] font-semibold">
            <Icon name="download" size={16} /> Export
          </a>
        ) : null}
      </form>

      {s ? (
        <p className="inline-flex items-center gap-1.5 text-[13px] text-muted">
          <Icon name="check" size={15} className="text-success" />
          Confirmed by property staff · Updated {formatDateTime(s.computed_at)} · Pending entries are not counted
        </p>
      ) : null}

      {view === "paid" ? (
        <section aria-labelledby="bypaid" className="flex flex-col gap-3">
          <h2 id="bypaid" className="font-display text-[20px] font-bold">Confirmed payments dated in {formatPeriod(period)}</h2>
          <p className="text-[14px] text-muted">
            This view counts payments by the date the tenant paid, whatever period they settle. It is a different question from rent-period collection
            and the two are never mixed. Total: <strong className="text-ink">{formatMoney(sumAmounts(payRows.map((r) => Number(r.amount))))}</strong> across {payRows.length} payment{payRows.length === 1 ? "" : "s"}.
          </p>
          <div className="overflow-x-auto rounded-[16px] border border-line bg-surface">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[12px] text-muted">
                  {["Paid on", "Unit", "Tenant", "Amount", "Recorded by", "Confirmed by"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {payRows.map((r) => (
                  <tr key={r.ref} className="border-b border-divider last:border-0">
                    <td className="px-3 py-2">{formatDate(r.paid_on)}</td>
                    <td className="px-3 py-2 font-mono">{r.unit_label}</td>
                    <td className="px-3 py-2">{r.tenant_name}</td>
                    <td className="px-3 py-2 font-mono">{formatAmount(Number(r.amount))}</td>
                    <td className="px-3 py-2">{r.recorded_by}</td>
                    <td className="px-3 py-2">{r.confirmed_by} · {formatDate(r.confirmed_at, { year: false })}</td>
                  </tr>
                ))}
                {payRows.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">No confirmed payments dated in this month.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : s ? (
        <>
          <dl className="grid grid-cols-2 divide-divider rounded-[18px] border border-line bg-surface sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
            {[
              ["Rent billed", formatAmount(s.billed), ""],
              ["Confirmed settled", formatAmount(s.settled), ""],
              ["Collection rate", formatRate(s.collection_rate), ""],
              [`Outstanding${s.outstanding && s.overdue === s.outstanding ? " · all overdue" : ` · ${formatAmount(s.overdue)} overdue`}`, formatAmount(s.outstanding), s.outstanding ? "text-error" : ""],
              ["Awaiting confirmation", `${s.pending_count} · ${formatAmount(s.pending_amount)}`, s.pending_count ? "text-waiting" : ""],
              [`Occupancy · ${s.occupied} of ${s.lettable}`, s.lettable ? `${Math.round((s.occupied / s.lettable) * 100)}%` : "N/A", ""],
            ].map(([label, value, tone]) => (
              <div key={label} className="p-4">
                <dd className={cx("font-display text-[26px] font-bold", tone)}>{value}</dd>
                <dt className="text-[13px] text-muted">{label}</dt>
              </div>
            ))}
          </dl>
          <p className="-mt-4 text-[12.5px] text-muted">All amounts in KSh.{s.unavailable ? ` ${s.unavailable} unavailable unit${s.unavailable === 1 ? " is" : "s are"} excluded from the lettable base.` : ""}</p>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <section className="rounded-[18px] border border-line bg-surface p-4">
              <TrendChart points={((trend.data ?? []) as Array<{ period_start: string; billed: number; settled: number; collection_rate: number | null }>)} onOpen="register" />
            </section>
            {propertyId ? (
              <section aria-labelledby="grid" className="rounded-[18px] border border-line bg-surface p-4">
                <div className="flex items-baseline justify-between">
                  <h2 id="grid" className="font-display text-[18px] font-bold">Units this period</h2>
                  <Link href={`/w/${orgId}/rent/${propertyId}?period=${periodParam(period)}`} className="text-[14px] font-semibold text-primary">Open register</Link>
                </div>
                <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {register.rows.filter((r) => r.tenancy_status !== "ended").map((r) => {
                    const st = RENT_STATUS[r.rent_status];
                    return (
                      <li key={`${r.unit_id}-${r.tenancy_id}`}>
                        <Link href={`/w/${orgId}/rent/${propertyId}/units/${r.unit_id}?period=${periodParam(period)}`} className={cx("flex min-h-[64px] flex-col justify-between rounded-[12px] p-2.5", TILE[st.tone])}>
                          <span className="font-mono text-[13px] font-medium">{r.unit_label}</span>
                          <span className="text-[12.5px] font-semibold">{st.label}{r.pending_count ? " + pending" : ""}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-[12.5px] text-muted">Each status has a word, not only a colour. Vacant units never show as arrears.</p>
              </section>
            ) : null}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <section aria-labelledby="age" className="rounded-[18px] border border-line bg-surface p-4">
              <h2 id="age" className="font-display text-[18px] font-bold">Arrears by age</h2>
              <ul className="mt-2 divide-y divide-divider">
                {((ageing.data ?? []) as Array<{ bucket: string; units: number; amount: number }>).map((a) => (
                  <li key={a.bucket} className="flex justify-between gap-3 py-2.5 text-[14px]">
                    <span>{AGE_LABEL[a.bucket]}{a.units ? ` · ${a.units} ${a.bucket === "former" ? "tenanc" + (a.units === 1 ? "y" : "ies") : "unit" + (a.units === 1 ? "" : "s")}` : ""}</span>
                    <span className="font-mono">{formatAmount(Number(a.amount))}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="staff" className="rounded-[18px] border border-line bg-surface p-4">
              <h2 id="staff" className="font-display text-[18px] font-bold">Staff activity this month</h2>
              <ul className="mt-2 divide-y divide-divider">
                {((staff.data ?? []) as Array<{ actor_name: string; created: number; submitted: number; confirmed: number; returned: number; reversed: number }>).map((a) => (
                  <li key={a.actor_name} className="flex justify-between gap-3 py-2.5 text-[14px]">
                    <span className="font-semibold">{a.actor_name}</span>
                    <span className="text-muted">
                      {[a.confirmed && `${a.confirmed} confirmed`, a.submitted && `${a.submitted} submitted`, a.returned && `${a.returned} returned`, a.reversed && `${a.reversed} corrected`].filter(Boolean).join(" · ") || `${a.created} entered`}
                    </span>
                  </li>
                ))}
                {(staff.data ?? []).length === 0 ? <li className="py-2.5 text-[14px] text-muted">No activity recorded this month.</li> : null}
                {(corrections ?? []).map((c) => (
                  <li key={c.id} className="py-2.5 text-[13.5px]">
                    <span className="font-semibold">Correction · {(c.payment_entries as unknown as { ref: string; units: { label: string } | null } | null)?.units?.label}</span>
                    <span className="block text-muted">{formatDate(c.created_at)} · &quot;{c.reason}&quot;. Original kept.</span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="rep" className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
              <h2 id="rep" className="font-display text-[18px] font-bold">Monthly report</h2>
              {propertyId ? (
                <>
                  <p className="text-[14px]">
                    {formatPeriod(period)} · {finalVersions.length ? `final v${finalVersions[0].version}` : "draft"}
                  </p>
                  <p className="text-[13px] text-muted">Built from confirmed records. A manager finalizes it once pending entries are resolved; earlier versions are kept.</p>
                  <Link href={`/w/${orgId}/reports?property=${propertyId}&period=${periodParam(period)}`} className="font-semibold text-primary underline">
                    {finalVersions.length ? "Open report versions" : "Preview draft"}
                  </Link>
                </>
              ) : (
                <p className="text-[14px] text-muted">Choose a property to prepare its monthly report.</p>
              )}
            </section>
          </div>
        </>
      ) : (
        <Notice tone="error" role="alert">We couldn&apos;t load these figures. Reload to try again.</Notice>
      )}
    </div>
  );
}
