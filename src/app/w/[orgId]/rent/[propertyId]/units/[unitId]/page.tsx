import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryStatusBadge } from "@/components/rent/badges";
import { TenancyActions, TenancySetup } from "@/components/rent/tenancy-forms";
import { ChargeAdjust } from "@/components/rent/charge-adjust";
import { TenantAccess } from "@/components/rent/tenant-access";
import { TenantContact } from "@/components/rent/tenant-contact";
import { FollowUps, type FollowUp } from "@/components/rent/follow-ups";
import { PaymentReportsPanel, type StaffReport } from "@/components/rent/payment-reports";
import { ActivityTimeline, HabitFigures, HabitSummary, MonthStrip, type Activity } from "@/components/rent/payment-habits";
import { getHabits } from "@/lib/dashboard";
import { toMonth } from "@/lib/rent/habits";
import { ExplainBalance } from "@/components/rent/explain-balance";
import { explainBalance } from "@/lib/rent/explain";
import { SendToTenants } from "@/components/rent/send-to-tenants";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, Card, EmptyState, Eyebrow, Notice, StatusBadge } from "@/components/ui/primitives";
import { getSessionUser, requireWorkspace } from "@/lib/auth";
import { addMonths, currentPeriod, formatDate, formatDateTime, formatPeriod, parsePeriodParam, periodParam, todayEAT } from "@/lib/dates";
import { emailConfigured } from "@/lib/delivery";
import { formatAmount, formatMoney } from "@/lib/money";
import { getOpenCharges, getProperty } from "@/lib/rent/queries";
import { OCCUPANCY, type Occupancy } from "@/lib/rent/status";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABEL, MESSAGE_COLUMNS, deliveryLabel, type TenantMessage } from "@/lib/tenant-messages";
import { BackLink } from "@/components/shell/back-link";

type Statement = { line_date: string; kind: string; description: string; charge: number; payment: number; balance: number; ref: string | null };

export default async function UnitPage({ params, searchParams }: PageProps<"/w/[orgId]/rent/[propertyId]/units/[unitId]">) {
  const { orgId, propertyId, unitId } = await params;
  const base = `/w/${orgId}/rent/${propertyId}`;
  // Keep the period the unit was opened from (IMP-07): back to the same register month.
  const period = parsePeriodParam((await searchParams).period);
  const ws = await requireWorkspace(orgId, base);
  const supabase = await createClient();
  const property = await getProperty(supabase, ws, propertyId);
  const { data: unit } = await supabase.from("units").select("id, label, layout, bedrooms, occupancy, occupancy_date, default_rent").eq("id", unitId).eq("property_id", propertyId).maybeSingle();
  if (!unit) notFound();

  const { data: tenancies } = await supabase
    .from("tenancies")
    .select("id, status, start_date, end_date, due_day, deposit_held, ended_reason, tenants(id, full_name, phone, email, user_id, access_email, access_token_hash, access_expires_at), tenancy_rent_rates(effective_from, amount)")
    .eq("unit_id", unitId)
    .order("start_date", { ascending: false });
  const current = (tenancies ?? []).find((t) => t.status === "active");
  const former = (tenancies ?? []).filter((t) => t.status === "ended");

  const [statement, charges, entries, formerBalances, messages, followUpRows, reportRows, months, activity, habits] = await Promise.all([
    current ? supabase.rpc("tenancy_statement", { p_tenancy: current.id }).then((r) => (r.data ?? []) as unknown as Statement[]) : Promise.resolve([] as Statement[]),
    current ? getOpenCharges(supabase, current.id) : Promise.resolve([]),
    current
      ? supabase.from("payment_entries").select("id, ref, amount, paid_on, status, reference").eq("tenancy_id", current.id).order("created_at", { ascending: false }).limit(20).then((r) => r.data ?? [])
      : Promise.resolve([]),
    Promise.all(
      former.map((t) => supabase.rpc("tenancy_statement", { p_tenancy: t.id }).then((r) => {
        const rows = (r.data ?? []) as unknown as Statement[];
        return rows.length ? Number(rows[rows.length - 1].balance) : 0;
      })),
    ),
    current
      ? supabase.from("tenant_messages").select(MESSAGE_COLUMNS).eq("tenancy_id", current.id).order("created_at", { ascending: false }).limit(20)
          .then((r) => (r.data ?? []) as unknown as TenantMessage[])
      : Promise.resolve([] as TenantMessage[]),
    current
      ? supabase.from("rent_follow_ups").select("id, kind, note, due_on, promised_amount, assigned_to, created_by, created_at, resolved_at, resolution")
          .eq("tenancy_id", current.id).order("created_at", { ascending: false }).limit(40).then((r) => r.data ?? [])
      : Promise.resolve([]),
    current
      ? supabase.from("payment_reports").select("id, amount, paid_on, method, reference, note, status, reply, created_at, answered_at, answered_by, payment_entries(id, ref, status)")
          .eq("tenancy_id", current.id).order("created_at", { ascending: false }).limit(30).then((r) => r.data ?? [])
      : Promise.resolve([]),
    current
      ? supabase.rpc("tenancy_payment_record", { p_tenancy: current.id, p_months: 12 }).then((r) => ((r.data ?? []) as unknown as Array<Record<string, unknown>>).map(toMonth))
      : Promise.resolve([]),
    current
      ? supabase.rpc("tenancy_activity", { p_tenancy: current.id, p_limit: 60 }).then((r) => (r.data ?? []) as unknown as Activity[])
      : Promise.resolve([] as Activity[]),
    current ? getHabits(supabase, orgId, propertyId) : Promise.resolve([]),
  ]);
  const habit = current ? habits.find((h) => h.tenancy_id === current.id) ?? null : null;
  // Names for who added each follow-up and who it is for (colleagues are readable within the workspace).
  const people = [...new Set([...followUpRows.flatMap((f) => [f.assigned_to, f.created_by]), ...reportRows.map((r) => r.answered_by)].filter(Boolean) as string[])];
  const { data: names } = people.length ? await supabase.from("profiles").select("id, full_name").in("id", people) : { data: [] };
  const me = (await getSessionUser())?.id;
  const nameOf = (uid: string | null) => (!uid ? "anyone on the team" : uid === me ? "you" : (names ?? []).find((n) => n.id === uid)?.full_name || "a colleague");
  const followUps: FollowUp[] = followUpRows.map((f) => ({
    id: f.id, kind: f.kind as FollowUp["kind"], note: f.note, due_on: f.due_on, promised_amount: f.promised_amount === null ? null : Number(f.promised_amount),
    assigned: nameOf(f.assigned_to), created_by: f.created_by === me ? "You" : nameOf(f.created_by), created_at: f.created_at,
    resolved_at: f.resolved_at, resolution: f.resolution,
  }));

  const reports: StaffReport[] = reportRows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    status: r.status as StaffReport["status"],
    answered_by: r.answered_by ? nameOf(r.answered_by) : null,
    entry: r.payment_entries as unknown as StaffReport["entry"],
  }));

  const rate = current
    ? [...((current.tenancy_rent_rates as unknown as Array<{ effective_from: string; amount: number }>) ?? [])]
        .filter((r) => r.effective_from <= todayEAT())
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]
    : null;
  const tenant = current?.tenants as unknown as {
    id: string; full_name: string; phone: string | null; email: string | null;
    user_id: string | null; access_email: string | null; access_token_hash: string | null; access_expires_at: string | null;
  } | null;
  const balance = statement.length ? Number(statement[statement.length - 1].balance) : 0;
  const today = todayEAT();

  return (
    <div className="mx-auto flex max-w-standard flex-col gap-5">
      <BackLink href={`${base}?period=${periodParam(period)}`}>{property.name}</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>{property.name}</Eyebrow>
          <h1 className="heading-page mt-1">Unit {unit.label}</h1>
          <p className="text-body text-muted">
            {OCCUPANCY[unit.occupancy as Occupancy]}
            {unit.occupancy_date ? ` · since ${formatDate(unit.occupancy_date)}` : ""}
          </p>
        </div>
        {current && ws.can_enter_payments ? (
          <ButtonLink href={`${base}/record?tenancy=${current.id}&period=${periodParam(period)}`} icon="plus">
            Record payment
          </ButtonLink>
        ) : null}
      </div>

      {current ? (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-title-sm font-bold">{tenant?.full_name}</p>
                <p className="text-label text-muted">
                  Tenancy since {formatDate(current.start_date)} · {rate ? `${formatMoney(Number(rate.amount))} / month` : "rent not set"} · due day {current.due_day}
                </p>
                {tenant ? (
                  <TenantContact orgId={orgId} propertyId={propertyId} tenantId={tenant.id} email={tenant.email} phone={tenant.phone} canEdit={ws.can_manage_tenancies} />
                ) : null}
                {current.deposit_held ? <p className="text-label text-muted">Deposit held: {formatMoney(Number(current.deposit_held))} (tracked separately from rent)</p> : null}
              </div>
              <div className="text-right">
                <p className="text-caption text-muted">{balance < 0 ? "Tenant credit" : "Balance owed"}</p>
                <p className={`font-display text-title-lg font-extrabold ${balance > 0 ? "text-error" : "text-success"}`}>{formatMoney(Math.abs(balance))}</p>
                <p className="text-micro text-muted">Confirmed records only</p>
              </div>
            </div>
            {statement.length ? (
              <details className="group mt-4 border-t border-divider pt-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold">
                  How this balance is made up · {formatPeriod(period)}
                  <Icon name="chevronDown" size={18} className="text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2 max-w-reading">
                  <ExplainBalance
                    e={explainBalance(statement, period)}
                    period={period}
                    pending={entries.filter((x) => x.status === "awaiting_confirmation").reduce((a, x) => a + Number(x.amount), 0)}
                  />
                </div>
              </details>
            ) : null}
            {ws.can_manage_tenancies ? <TenancyActions orgId={orgId} propertyId={propertyId} tenancyId={current.id} currentRent={rate ? Number(rate.amount) : null} /> : null}
            {ws.can_manage_tenancies && tenant ? (
              <TenantAccess
                orgId={orgId}
                propertyId={propertyId}
                tenantId={tenant.id}
                tenantName={tenant.full_name}
                linked={!!tenant.user_id}
                pending={tenant.access_token_hash && tenant.access_email && tenant.access_expires_at && tenant.access_expires_at > new Date().toISOString() ? { email: tenant.access_email, expiresAt: tenant.access_expires_at } : null}
                defaultEmail={tenant.email}
              />
            ) : null}
          </Card>

          <section aria-labelledby="habits-h" id="habits" className="flex scroll-mt-24 flex-col gap-3">
            <h2 id="habits-h" className="heading-section">Payment habits</h2>
            <div className="surface flex flex-col gap-4 p-4">
              {habit ? <HabitSummary row={habit} /> : null}
              <MonthStrip months={months} />
              {habit && habit.months_due ? <HabitFigures row={habit} /> : null}
              <p className="text-caption text-muted">
                A month is on time when confirmed payments dated on or before its due date cover it, oldest charges first.
                Payments awaiting confirmation don&apos;t count yet.
              </p>
            </div>
          </section>

          {reports.length ? (
            <section aria-labelledby="reported-h" id="reported" className="flex scroll-mt-24 flex-col gap-2">
              <h2 id="reported-h" className="heading-section">Reported missing by the tenant</h2>
              <PaymentReportsPanel
                orgId={orgId}
                propertyId={propertyId}
                tenantFirstName={tenant?.full_name.split(" ")[0] ?? "The tenant"}
                open={reports.filter((r) => r.status === "open")}
                answered={reports.filter((r) => r.status !== "open").slice(0, 10)}
                entries={entries.map((e) => ({ ...e, amount: Number(e.amount) }))}
                recordHref={`${base}/record?tenancy=${current.id}&period=${periodParam(period)}`}
                canAct={ws.can_manage_tenancies || ws.can_enter_payments || ws.can_confirm}
                canRecord={ws.can_enter_payments}
              />
            </section>
          ) : null}

          <section aria-labelledby="fu-h" id="follow-ups" className="flex scroll-mt-24 flex-col gap-2">
            <h2 id="fu-h" className="heading-section">Follow-ups</h2>
            <FollowUps
              orgId={orgId}
              propertyId={propertyId}
              tenancyId={current.id}
              today={today}
              open={followUps.filter((f) => !f.resolved_at).sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999"))}
              closed={followUps.filter((f) => f.resolved_at).slice(0, 10)}
              canAct={ws.can_manage_tenancies || ws.can_enter_payments || ws.can_confirm}
            />
          </section>

          <section aria-labelledby="activity-h" id="activity" className="flex scroll-mt-24 flex-col gap-2">
            <h2 id="activity-h" className="heading-section">Activity</h2>
            <div className="surface p-4">
              <ActivityTimeline items={activity.slice(0, 8)} entryHref={(id) => `${base}/entries/${id}`} />
              {activity.length > 8 ? (
                <details className="group mt-4 border-t border-divider pt-3">
                  <summary className="link-action inline-flex min-h-11 cursor-pointer list-none items-center text-label">Show {activity.length - 8} earlier</summary>
                  <div className="mt-3">
                    <ActivityTimeline items={activity.slice(8)} entryHref={(id) => `${base}/entries/${id}`} />
                  </div>
                </details>
              ) : null}
            </div>
          </section>

          {ws.can_manage_tenancies || messages.length ? (
            <section aria-labelledby="msgs" className="flex flex-col gap-2">
              <h2 id="msgs" className="heading-section">Invoices, reminders and messages</h2>
              {ws.can_manage_tenancies && tenant ? (
                <details className="surface group">
                  <summary className="flex min-h-row cursor-pointer list-none items-center gap-3 px-4 font-semibold">
                    <Icon name="mail" className="text-muted" />
                    <span className="flex-1">Email {tenant.full_name.split(" ")[0]} an invoice, reminder or message</span>
                    <Icon name="chevronDown" size={18} className="text-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-divider p-4">
                    <SendToTenants
                      orgId={orgId}
                      propertyId={propertyId}
                      tenancyIds={[current.id]}
                      recipients={tenant.full_name.split(" ")[0]}
                      periods={[addMonths(currentPeriod(), 1), currentPeriod(), ...[1, 2, 3, 4, 5].map((n) => addMonths(currentPeriod(), -n))]}
                      defaultPeriod={period}
                    />
                  </div>
                </details>
              ) : null}
              {messages.length ? (
                <ul className="surface-list">
                  {messages.map((m) => {
                    const d = deliveryLabel(m.delivery_status, emailConfigured());
                    return (
                      <li key={m.id}>
                        <Link href={`${base}/messages/${m.id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-cool">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{m.subject}</span>
                            <span className="block text-caption text-muted">
                              {KIND_LABEL[m.kind]}{m.ref ? ` ${m.ref}` : ""} · {formatDateTime(m.created_at)}
                            </span>
                          </span>
                          <StatusBadge tone={d.tone} className="shrink-0">{d.label}</StatusBadge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-label text-muted">Nothing sent to this tenant yet.</p>
              )}
            </section>
          ) : null}

          <section aria-labelledby="stmt">
            <div className="flex items-baseline justify-between">
              <h2 id="stmt" className="heading-section">Tenant statement</h2>
              <a href={`/api/export/statement?tenancy=${current.id}`} className="link-action text-label">
                Download CSV
              </a>
            </div>
            {statement.length === 0 ? (
              <p className="surface-empty mt-2 p-4">
                No charges or payments yet. Create this period&apos;s rent charges from the Charges page.
              </p>
            ) : (
              <div className="surface mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Tenancy statement (scrolls sideways)">
                <table className="w-full min-w-[560px] text-label">
                  <caption className="sr-only">Statement lines with running balance</caption>
                  <thead>
                    <tr className="border-b border-line text-left font-mono text-micro text-muted">
                      <th scope="col" className="px-3 py-2 font-medium">Date</th>
                      <th scope="col" className="px-3 py-2 font-medium">Description</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Charge</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Payment</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.map((l, i) => (
                      <tr key={i} className="border-b border-divider last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(l.line_date)}</td>
                        <td className="px-3 py-2">{l.description}{l.ref ? <span className="font-mono text-micro text-muted"> · {l.ref}</span> : null}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(l.charge) ? formatAmount(Number(l.charge)) : ""}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(l.payment) ? formatAmount(Number(l.payment)) : ""}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{formatAmount(Number(l.balance))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {ws.can_correct && charges.length ? (
            <section aria-labelledby="charges">
              <h2 id="charges" className="heading-section">Charges</h2>
              <ul className="surface-list mt-2">
                {charges.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span>
                      <span className="font-semibold">{c.category === "rent" ? `${formatPeriod(c.periodStart)} rent` : c.description ?? "Charge"}</span>
                      <span className="block text-caption text-muted">
                        {formatMoney(c.net)} · confirmed {formatAmount(c.confirmed)} · due {formatDate(c.dueDate)}
                        {c.dueDate < today && c.net - c.confirmed > 0 ? " · overdue" : ""}
                      </span>
                    </span>
                    {c.net - c.confirmed > 0 ? <ChargeAdjust orgId={orgId} propertyId={propertyId} chargeId={c.id} max={Math.round((c.net - c.confirmed) * 100) / 100} /> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {entries.length ? (
            <section aria-labelledby="entries">
              <h2 id="entries" className="heading-section">Payment entries</h2>
              <ul className="surface-list mt-2">
                {entries.map((e) => (
                  <li key={e.id}>
                    <Link href={`${base}/entries/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-cool">
                      <span>
                        <span className="font-mono text-caption">{e.ref}</span> · {formatMoney(Number(e.amount))}
                        <span className="block text-caption text-muted">Paid {formatDate(e.paid_on)}</span>
                      </span>
                      <EntryStatusBadge status={e.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : ws.can_manage_tenancies ? (
        <TenancySetup orgId={orgId} propertyId={propertyId} unitId={unitId} defaultRent={unit.default_rent ? Number(unit.default_rent) : null} dueDay={property.rent_due_day} occupancy={unit.occupancy} />
      ) : (
        <EmptyState title="No current tenancy" icon="user">
          {unit.occupancy === "vacant" ? "This unit is vacant, so no rent is due." : "Ask a manager with tenancy permission to set up the tenancy."}
        </EmptyState>
      )}

      {former.length ? (
        <section aria-labelledby="former">
          <h2 id="former" className="heading-section">Former tenancies</h2>
          <p className="text-label text-muted">Arrears stay with the tenancy they belong to; they never move to the next tenant.</p>
          <ul className="surface-list mt-2">
            {former.map((t, i) => (
              <li key={t.id} className="flex justify-between gap-3 px-4 py-3 text-label">
                <span>
                  <span className="font-semibold">{(t.tenants as unknown as { full_name: string } | null)?.full_name}</span>
                  <span className="block text-muted">{formatDate(t.start_date)} – {formatDate(t.end_date)}{t.ended_reason ? ` · ${t.ended_reason}` : ""}</span>
                </span>
                <span className={formerBalances[i] > 0 ? "font-semibold text-error" : "text-muted"}>
                  {formerBalances[i] > 0 ? `Owes ${formatMoney(formerBalances[i])}` : formerBalances[i] < 0 ? `Credit ${formatMoney(-formerBalances[i])}` : "Settled"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!current && unit.occupancy === "vacant" ? <Notice tone="info">Vacant units never show as arrears.</Notice> : null}
    </div>
  );
}
