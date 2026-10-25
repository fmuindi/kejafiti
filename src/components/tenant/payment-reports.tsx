"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { reportMissingPayment, withdrawPaymentReport } from "@/app/(tenant)/my-rent/actions";
import { ChoiceChips, Field, MoneyInput, TextArea, TextInput, describedBy } from "@/components/ui/form";
import { Button, InlineError, Notice, StatusBadge } from "@/components/ui/primitives";
import { formatDate, timeAgo } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { METHOD_LABEL, tenantReportStatus, type PaymentReport } from "@/lib/payment-reports";

const METHODS = Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label }));

/**
 * "I paid, but it isn't on my statement." The tenant tells the landlord or agent what they paid;
 * the people who check receipts are asked to look. The balance doesn't change until a payment
 * is confirmed, and the tenant sees the answer here.
 */
export function PaymentReports({ tenancyId, orgName, reports, today }: { tenancyId: string; orgName: string; reports: PaymentReport[]; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState("mpesa");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const id = useId();

  const submit = () =>
    start(async () => {
      setError(null);
      const e: Record<string, string> = {};
      const amt = Number(amount.replace(/,/g, ""));
      if (!amount.trim() || !(amt > 0)) e.amount = "Enter the amount you paid in KSh.";
      if (!paidOn) e.paid_on = "Enter the date you paid.";
      else if (paidOn > today) e.paid_on = "The date you paid can't be in the future.";
      setErrors(e);
      if (Object.keys(e).length) return;
      const res = await reportMissingPayment({
        client_request_id: requestId,
        tenancy_id: tenancyId,
        amount: Math.round(amt * 100) / 100,
        paid_on: paidOn,
        method: method as "mpesa" | "bank" | "cash" | "other",
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setError(res.message);
        return;
      }
      setRequestId(crypto.randomUUID());
      setOpen(false);
      setSent(true);
      setAmount("");
      setReference("");
      setNote("");
      router.refresh();
    });

  const withdraw = (rid: string) =>
    start(async () => {
      setError(null);
      const res = await withdrawPaymentReport(tenancyId, rid);
      if (!res.ok) return setError(res.message);
      router.refresh();
    });

  const noteHint = "For example, paid from another person's phone or a different account.";
  const refHint = method === "mpesa" ? "The code in your M-PESA message, like QK12ABC3XY." : method === "bank" ? "The reference on your bank slip or transfer." : undefined;

  return (
    <div className="flex flex-col gap-3">
      {sent ? (
        <Notice tone="success" title="Sent for checking" role="status">
          {orgName} will check their records and answer here. Your balance changes only once they confirm the payment.
        </Notice>
      ) : null}

      {reports.length ? (
        <ul className="surface-list">
          {reports.map((r) => {
            const s = tenantReportStatus(r);
            return (
              <li key={r.id} className="flex flex-col gap-1.5 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {formatMoney(r.amount)} paid {formatDate(r.paid_on)}
                    </p>
                    <p className="text-caption text-muted">
                      {[r.method ? METHOD_LABEL[r.method] : null, r.reference].filter(Boolean).join(" · ")}
                      {r.method || r.reference ? " · " : ""}reported {timeAgo(r.created_at)}
                    </p>
                  </div>
                  <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                </div>
                {r.reply ? (
                  <p className="text-label">
                    <span className="font-semibold">{orgName}:</span> {r.reply}
                  </p>
                ) : null}
                {r.status === "matched" && r.payment_state === "confirmed" ? (
                  <p className="text-caption text-muted">It&apos;s on your statement below.</p>
                ) : null}
                {r.status === "open" ? (
                  <button type="button" className="link-action self-start text-label" disabled={pending} onClick={() => withdraw(r.id)}>
                    Withdraw this report
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {open ? (
        <form
          className="surface flex flex-col gap-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount you paid" htmlFor={`${id}-amt`} error={errors.amount}>
              <MoneyInput id={`${id}-amt`} value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} aria-describedby={describedBy(`${id}-amt`, { error: errors.amount })} />
            </Field>
            <Field label="Date you paid" htmlFor={`${id}-date`} error={errors.paid_on}>
              <TextInput id={`${id}-date`} type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} error={errors.paid_on} aria-describedby={describedBy(`${id}-date`, { error: errors.paid_on })} />
            </Field>
          </div>
          <ChoiceChips name={`${id}-method`} legend="How you paid" options={METHODS} value={method} onChange={setMethod} />
          <Field label="Reference" htmlFor={`${id}-ref`} optional error={errors.reference} hint={refHint}>
            <TextInput id={`${id}-ref`} value={reference} maxLength={80} autoCapitalize="characters" onChange={(e) => setReference(e.target.value)} error={errors.reference} aria-describedby={describedBy(`${id}-ref`, { error: errors.reference, hint: refHint })} />
          </Field>
          <Field label="Anything that helps them find it" htmlFor={`${id}-note`} optional hint={noteHint}>
            <TextArea id={`${id}-note`} value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} aria-describedby={describedBy(`${id}-note`, { hint: noteHint })} />
          </Field>
          {error ? <InlineError>{error}</InlineError> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" pending={pending}>Send for checking</Button>
            <Button type="button" variant="quiet" onClick={() => { setOpen(false); setErrors({}); setError(null); }}>Cancel</Button>
          </div>
          <p className="text-caption text-muted">
            This asks {orgName} to check their records. It doesn&apos;t change your balance, and it isn&apos;t a receipt.
          </p>
        </form>
      ) : (
        <Button variant="secondary" icon="plus" className="self-start" onClick={() => { setOpen(true); setSent(false); }}>
          Report a missing payment
        </Button>
      )}
      {error && !open ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}
