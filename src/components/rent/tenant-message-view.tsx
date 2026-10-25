import { Eyebrow, cx } from "@/components/ui/primitives";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { KIND_LABEL, type InvoiceDetails, type ReminderDetails, type TenantMessage } from "@/lib/tenant-messages";

/**
 * An invoice, reminder or message as it was sent: the same figures the tenant got by email.
 * Used on the staff side and in the tenant's My rent; prints cleanly.
 */
export function TenantMessageView({ m, from, to }: { m: TenantMessage; from: string; to: string }) {
  return (
    <article className="surface flex flex-col gap-4 p-5 print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>{KIND_LABEL[m.kind]}{m.ref ? ` · ${m.ref}` : ""}</Eyebrow>
          <h1 className="heading-compact mt-1">{m.subject}</h1>
        </div>
        <dl className="text-right text-caption text-muted">
          <dt className="sr-only">Sent</dt>
          <dd>{formatDateTime(m.created_at)}</dd>
        </dl>
      </header>
      <dl className="grid gap-x-6 gap-y-1 text-label sm:grid-cols-2">
        <div>
          <dt className="text-muted">From</dt>
          <dd className="font-semibold">{from}</dd>
        </div>
        <div>
          <dt className="text-muted">To</dt>
          <dd className="font-semibold">{to}</dd>
        </div>
      </dl>
      {m.kind === "invoice" ? <InvoiceTable d={m.details as InvoiceDetails} /> : null}
      {m.kind === "reminder" ? <ReminderTable d={m.details as ReminderDetails} /> : null}
      {m.body ? <p className="text-body whitespace-pre-line">{m.body}</p> : null}
      {m.kind !== "message" ? (
        <p className="text-caption text-muted">Figures are confirmed records as of when this was sent. A payment shows once it has been checked and confirmed.</p>
      ) : null}
    </article>
  );
}

function Rows({ rows }: { rows: Array<{ label: string; value: string; strong?: boolean; tone?: "error" | "success" }> }) {
  return (
    <table className="w-full text-label">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-divider last:border-0">
            <td className={cx("py-2 pr-3", r.strong && "font-semibold")}>{r.label}</td>
            <td className={cx("py-2 text-right tabular-nums", r.strong && "font-display text-lead font-bold", r.tone === "error" && "text-error", r.tone === "success" && "text-success")}>
              {r.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InvoiceTable({ d }: { d: InvoiceDetails }) {
  const rows: Parameters<typeof Rows>[0]["rows"] = d.lines.map((l) => ({ label: l.label, value: formatMoney(Number(l.amount)) }));
  rows.push({ label: `Charges for ${d.period_label}`, value: formatMoney(Number(d.period_total)), strong: true });
  const earlier = Number(d.earlier_balance);
  if (earlier) rows.push({ label: earlier > 0 ? "Earlier balance still owed" : "Credit from earlier payments", value: formatMoney(Math.abs(earlier)) });
  rows.push(
    Number(d.credit)
      ? { label: "Credit in your favour", value: formatMoney(Number(d.credit)), strong: true, tone: "success" }
      : { label: `Amount due by ${formatDate(d.due_date)}`, value: formatMoney(Number(d.amount_due)), strong: true, tone: Number(d.amount_due) > 0 ? "error" : undefined },
  );
  return <Rows rows={rows} />;
}

function ReminderTable({ d }: { d: ReminderDetails }) {
  const rows: Parameters<typeof Rows>[0]["rows"] = d.lines.map((l) => ({
    label: `${l.label} · due ${formatDate(l.due_date)}${l.overdue ? " · overdue" : ""}`,
    value: formatMoney(Number(l.outstanding)),
  }));
  rows.push({ label: `Total due as of ${formatDate(d.as_of)}`, value: formatMoney(Number(d.balance)), strong: true, tone: "error" });
  return <Rows rows={rows} />;
}
