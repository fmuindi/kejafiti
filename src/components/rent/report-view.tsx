import { formatDate, formatDateTime, formatPeriod } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { RENT_STATUS, formatRate, type RentStatus } from "@/lib/rent/status";

export type ReportSnapshot = {
  basis: string;
  period_start: string;
  generated_at: string;
  property: { id: string; name: string; area: string };
  summary: { billed: number; settled: number; collection_rate: number | null; outstanding: number; overdue: number; pending_count: number; pending_amount: number; occupied: number; lettable: number } | null;
  register: Array<{ unit_label: string; tenant_name: string | null; tenancy_status: string | null; billed: number; confirmed: number; outstanding: number; rent_status: RentStatus; overdue: boolean; pending_amount: number }>;
  arrears: Array<{ bucket: string; units: number; amount: number }>;
  payments: Array<{ ref: string; unit_label: string; tenant_name: string; amount: number; paid_on: string; recorded_by: string; recorded_at: string; confirmed_by: string; confirmed_at: string }>;
  staff: Array<{ actor_name: string; created: number; submitted: number; confirmed: number; returned: number; reversed: number }>;
};

const AGE: Record<string, string> = { "0_30": "Up to 30 days", "31_60": "31–60 days", "61_plus": "Over 60 days", former: "Former tenants" };

// One rendering for the draft preview, finalized versions and the printable PDF, so
// everything shown comes from the same snapshot and calculation rules.
export type ReportCommentary = { changes?: string; issues?: string; next_actions?: string } | null;

export function ReportView({ r, meta }: { r: ReportSnapshot; meta: { status: string; preparedBy?: string; finalizedAt?: string; notes?: string | null; changeNote?: string | null; commentary?: ReportCommentary } }) {
  const c = meta.commentary;
  const s = r.summary;
  return (
    <article className="flex flex-col gap-5 rounded-[18px] border border-line bg-surface p-5 print:border-0 print:p-0">
      <header>
        <p className="font-mono text-[0.75rem] tracking-[0.6px] text-muted uppercase">Monthly property summary · {meta.status}</p>
        <h2 className="mt-1 font-display text-[1.625rem] font-bold">{r.property.name} · {formatPeriod(r.period_start)}</h2>
        <p className="text-[0.8125rem] text-muted">
          {r.basis} Generated {formatDateTime(r.generated_at)}
          {meta.preparedBy ? ` · prepared by ${meta.preparedBy}` : ""}
          {meta.finalizedAt ? ` · finalized ${formatDateTime(meta.finalizedAt)}` : ""}
        </p>
        {meta.changeNote ? <p className="mt-1 text-[0.84375rem]"><strong>Change note:</strong> {meta.changeNote}</p> : null}
      </header>
      {s ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Rent billed", formatAmount(s.billed)], ["Confirmed", formatAmount(s.settled)], ["Collection rate", formatRate(s.collection_rate)], ["Outstanding", formatAmount(s.outstanding)], ["Overdue", formatAmount(s.overdue)], ["Pending (not counted)", `${s.pending_count} · ${formatAmount(s.pending_amount)}`], ["Occupancy", `${s.occupied} of ${s.lettable}`]].map(([k, v]) => (
            <div key={k} className="rounded-[12px] bg-cool p-3">
              <dd className="font-display text-[1.25rem] font-bold">{v}</dd>
              <dt className="text-[0.78125rem] text-muted">{k}</dt>
            </div>
          ))}
        </dl>
      ) : null}
      {meta.notes ? <p className="rounded-[12px] border border-line p-3 text-[0.875rem]"><strong>Notes:</strong> {meta.notes}</p> : null}
      {c && (c.changes || c.issues || c.next_actions) ? (
        <section aria-label="Manager's commentary" className="grid gap-3 rounded-[12px] border border-line p-3 text-[0.875rem] sm:grid-cols-3">
          {[["What changed", c.changes], ["Unresolved issues", c.issues], ["Next actions", c.next_actions]].map(([k, v]) => (
            <div key={k}>
              <p className="font-semibold">{k}</p>
              <p className="whitespace-pre-line text-muted">{v || "None noted"}</p>
            </div>
          ))}
        </section>
      ) : null}
      <section>
        <h3 className="font-semibold">Unit rent register (KSh)</h3>
        <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Unit rent register (scrolls sideways)">
          <table className="w-full min-w-[560px] text-[0.84375rem]">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[0.75rem] text-muted">
                {["Unit", "Tenant", "Billed", "Confirmed", "Outstanding", "Status"].map((h) => <th key={h} scope="col" className="py-1.5 pr-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {r.register.map((x, i) => (
                <tr key={i} className="border-b border-divider">
                  <td className="py-1.5 pr-3 font-mono">{x.unit_label}</td>
                  <td className="py-1.5 pr-3">{x.tenant_name ?? "—"}{x.tenancy_status === "ended" ? " (former)" : ""}</td>
                  <td className="py-1.5 pr-3 font-mono">{formatAmount(Number(x.billed))}</td>
                  <td className="py-1.5 pr-3 font-mono">{formatAmount(Number(x.confirmed))}</td>
                  <td className="py-1.5 pr-3 font-mono">{formatAmount(Number(x.outstanding))}</td>
                  <td className="py-1.5 pr-3">{RENT_STATUS[x.rent_status]?.label ?? x.rent_status}{x.overdue ? " · overdue" : ""}{Number(x.pending_amount) ? ` · ${formatAmount(Number(x.pending_amount))} pending` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid gap-5 md:grid-cols-2">
        <section>
          <h3 className="font-semibold">Arrears by age</h3>
          <ul className="mt-1 text-[0.84375rem]">
            {r.arrears.map((a) => <li key={a.bucket} className="flex justify-between border-b border-divider py-1.5"><span>{AGE[a.bucket]} · {a.units}</span><span className="font-mono">{formatAmount(Number(a.amount))}</span></li>)}
          </ul>
        </section>
        <section>
          <h3 className="font-semibold">Staff activity</h3>
          <ul className="mt-1 text-[0.84375rem]">
            {r.staff.map((a) => <li key={a.actor_name} className="flex justify-between border-b border-divider py-1.5"><span>{a.actor_name}</span><span className="text-muted">{a.confirmed} confirmed · {a.submitted} submitted · {a.returned} returned · {a.reversed} corrected</span></li>)}
            {r.staff.length === 0 ? <li className="py-1.5 text-muted">No activity.</li> : null}
          </ul>
        </section>
      </div>
      <section>
        <h3 className="font-semibold">Payment entries dated this month</h3>
        <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Payment entries (scrolls sideways)">
          <table className="w-full min-w-[640px] text-[0.8125rem]">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[0.75rem] text-muted">
                {["Ref", "Unit", "Paid on", "Amount", "Recorded", "Confirmed"].map((h) => <th key={h} scope="col" className="py-1.5 pr-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {r.payments.map((p) => (
                <tr key={p.ref} className="border-b border-divider">
                  <td className="py-1.5 pr-3 font-mono">{p.ref}</td>
                  <td className="py-1.5 pr-3 font-mono">{p.unit_label}</td>
                  <td className="py-1.5 pr-3">{formatDate(p.paid_on)}</td>
                  <td className="py-1.5 pr-3 font-mono">{formatAmount(Number(p.amount))}</td>
                  <td className="py-1.5 pr-3">{p.recorded_by} · {formatDate(p.recorded_at)}</td>
                  <td className="py-1.5 pr-3">{p.confirmed_by} · {formatDate(p.confirmed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-[0.75rem] text-muted">
        This report represents records confirmed by property staff. It does not prove bank receipt, execute a payment, or replace the owner&apos;s accounting
        and tax filing.
      </p>
    </article>
  );
}
