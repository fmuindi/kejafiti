import { cx } from "@/components/ui/primitives";
import { formatPeriod } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { BalanceExplanation } from "@/lib/rent/explain";

/**
 * How a balance is made up for one month, from the statement lines: owed before, the month's
 * charges, adjustments, confirmed payments, reversals and anything dated later. The rows always
 * add up to the balance. Payments still awaiting confirmation are shown apart and never counted.
 */
export function ExplainBalance({ e, period, pending = 0, tenantView = false }: { e: BalanceExplanation; period: string; pending?: number; tenantView?: boolean }) {
  const month = formatPeriod(period).split(" ")[0];
  const rows: Array<{ label: string; detail?: string; value: string; strong?: boolean }> = [
    { label: e.before < 0 ? `Credit before ${month}` : `Owed before ${month}`, value: formatMoney(Math.abs(e.before)) + (e.before < 0 ? " credit" : "") },
    { label: `${month} charges`, detail: e.chargeLines.map((c) => c.description).join(", ") || "None", value: `+ ${formatMoney(e.charges)}` },
  ];
  if (e.adjustments) rows.push({ label: e.adjustments < 0 ? "Reductions and waivers" : "Added charges", value: `${e.adjustments < 0 ? "−" : "+"} ${formatMoney(Math.abs(e.adjustments))}` });
  rows.push({ label: `Confirmed payments in ${month}`, value: `− ${formatMoney(e.payments)}` });
  if (e.reversals) rows.push({ label: "Payments reversed", detail: "Owed again after a correction", value: `+ ${formatMoney(e.reversals)}` });
  if (e.after) rows.push({ label: `After ${month}`, detail: "Charges raised early or later payments", value: `${e.after < 0 ? "−" : "+"} ${formatMoney(Math.abs(e.after))}` });

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-label">
        <caption className="sr-only">How the balance is made up for {formatPeriod(period)}</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-divider">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                {r.label}
                {r.detail ? <span className="block text-caption text-muted">{r.detail}</span> : null}
              </th>
              <td className="py-2 text-right whitespace-nowrap tabular-nums">{r.value}</td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="py-2 pr-3 text-left font-semibold">{e.balance < 0 ? (tenantView ? "Credit in your favour" : "Tenant credit now") : tenantView ? "You owe now" : "Balance owed now"}</th>
            <td className={cx("py-2 text-right font-display text-lead font-bold whitespace-nowrap tabular-nums", e.balance > 0 ? "text-error" : "text-success")}>
              {formatMoney(Math.abs(e.balance))}
            </td>
          </tr>
        </tbody>
      </table>
      {pending > 0 ? (
        <p className="text-caption font-semibold text-waiting-strong">
          {formatMoney(pending)} {tenantView ? "you paid is" : "is"} awaiting confirmation and isn&apos;t counted yet.
        </p>
      ) : null}
      <p className="text-caption text-muted">
        Built from the same lines as the statement below, confirmed records only. A payment counts once it has been checked and confirmed.
      </p>
    </div>
  );
}
