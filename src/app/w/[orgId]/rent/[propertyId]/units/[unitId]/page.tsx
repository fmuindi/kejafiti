import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryStatusBadge } from "@/components/rent/badges";
import { TenancyActions, TenancySetup } from "@/components/rent/tenancy-forms";
import { ChargeAdjust } from "@/components/rent/charge-adjust";
import { TenantAccess } from "@/components/rent/tenant-access";
import { ButtonLink, Card, EmptyState, Eyebrow, Notice } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth";
import { formatDate, formatPeriod, parsePeriodParam, periodParam, todayEAT } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { getOpenCharges, getProperty } from "@/lib/rent/queries";
import { OCCUPANCY, type Occupancy } from "@/lib/rent/status";
import { createClient } from "@/lib/supabase/server";
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

  const [statement, charges, entries, formerBalances] = await Promise.all([
    current ? supabase.rpc("tenancy_statement", { p_tenancy: current.id }).then((r) => (r.data ?? []) as unknown as Statement[]) : Promise.resolve([] as Statement[]),
    current ? getOpenCharges(supabase, current.id) : Promise.resolve([]),
    current
      ? supabase.from("payment_entries").select("id, ref, amount, paid_on, status").eq("tenancy_id", current.id).order("created_at", { ascending: false }).limit(20).then((r) => r.data ?? [])
      : Promise.resolve([]),
    Promise.all(
      former.map((t) => supabase.rpc("tenancy_statement", { p_tenancy: t.id }).then((r) => {
        const rows = (r.data ?? []) as unknown as Statement[];
        return rows.length ? Number(rows[rows.length - 1].balance) : 0;
      })),
    ),
  ]);

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
    <div className="mx-auto flex max-w-[860px] flex-col gap-5">
      <BackLink href={`${base}?period=${periodParam(period)}`}>{property.name}</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>{property.name}</Eyebrow>
          <h1 className="mt-1 font-display text-[1.875rem] font-bold">Unit {unit.label}</h1>
          <p className="text-[0.90625rem] text-muted">
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
                <p className="font-display text-[1.25rem] font-bold">{tenant?.full_name}</p>
                <p className="text-[0.875rem] text-muted">
                  Tenancy since {formatDate(current.start_date)} · {rate ? `${formatMoney(Number(rate.amount))} / month` : "rent not set"} · due day {current.due_day}
                </p>
                {tenant?.phone || tenant?.email ? <p className="text-[0.84375rem] text-muted">{[tenant.phone, tenant.email].filter(Boolean).join(" · ")}</p> : null}
                {current.deposit_held ? <p className="text-[0.84375rem] text-muted">Deposit held: {formatMoney(Number(current.deposit_held))} (tracked separately from rent)</p> : null}
              </div>
              <div className="text-right">
                <p className="text-[0.78125rem] text-muted">{balance < 0 ? "Tenant credit" : "Balance owed"}</p>
                <p className={`font-display text-[1.625rem] font-extrabold ${balance > 0 ? "text-error" : "text-success"}`}>{formatMoney(Math.abs(balance))}</p>
                <p className="text-[0.75rem] text-muted">Confirmed records only</p>
              </div>
            </div>
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

          <section aria-labelledby="stmt">
            <div className="flex items-baseline justify-between">
              <h2 id="stmt" className="font-display text-[1.125rem] font-bold">Tenant statement</h2>
              <a href={`/api/export/statement?tenancy=${current.id}`} className="text-[0.875rem] font-semibold text-primary underline">
                Download CSV
              </a>
            </div>
            {statement.length === 0 ? (
              <p className="mt-2 rounded-[14px] border border-dashed border-line bg-surface p-4 text-[0.875rem] text-muted">
                No charges or payments yet. Create this period&apos;s rent charges from the Charges page.
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-[16px] border border-line bg-surface" tabIndex={0} role="region" aria-label="Tenancy statement (scrolls sideways)">
                <table className="w-full min-w-[560px] text-[0.875rem]">
                  <caption className="sr-only">Statement lines with running balance</caption>
                  <thead>
                    <tr className="border-b border-line text-left font-mono text-[0.75rem] text-muted">
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
                        <td className="px-3 py-2">{l.description}{l.ref ? <span className="font-mono text-[0.75rem] text-muted"> · {l.ref}</span> : null}</td>
                        <td className="px-3 py-2 text-right font-mono">{Number(l.charge) ? formatAmount(Number(l.charge)) : ""}</td>
                        <td className="px-3 py-2 text-right font-mono">{Number(l.payment) ? formatAmount(Number(l.payment)) : ""}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium">{formatAmount(Number(l.balance))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {ws.can_correct && charges.length ? (
            <section aria-labelledby="charges">
              <h2 id="charges" className="font-display text-[1.125rem] font-bold">Charges</h2>
              <ul className="mt-2 flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
                {charges.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span>
                      <span className="font-semibold">{c.category === "rent" ? `${formatPeriod(c.periodStart)} rent` : c.description ?? "Charge"}</span>
                      <span className="block text-[0.8125rem] text-muted">
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
              <h2 id="entries" className="font-display text-[1.125rem] font-bold">Payment entries</h2>
              <ul className="mt-2 flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
                {entries.map((e) => (
                  <li key={e.id}>
                    <Link href={`${base}/entries/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-cool">
                      <span>
                        <span className="font-mono text-[0.8125rem]">{e.ref}</span> · {formatMoney(Number(e.amount))}
                        <span className="block text-[0.8125rem] text-muted">Paid {formatDate(e.paid_on)}</span>
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
          <h2 id="former" className="font-display text-[1.125rem] font-bold">Former tenancies</h2>
          <p className="text-[0.84375rem] text-muted">Arrears stay with the tenancy they belong to; they never move to the next tenant.</p>
          <ul className="mt-2 flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {former.map((t, i) => (
              <li key={t.id} className="flex justify-between gap-3 px-4 py-3 text-[0.875rem]">
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
