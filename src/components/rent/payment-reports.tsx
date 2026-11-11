"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { answerPaymentReport } from "@/app/w/[orgId]/rent/actions";
import { EntryStatusBadge } from "@/components/rent/badges";
import { Field, Select, TextArea, describedBy } from "@/components/ui/form";
import { Button, ButtonLink, InlineError, StatusBadge } from "@/components/ui/primitives";
import { formatDate, timeAgo } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { METHOD_LABEL, likelyMatch, type CandidateEntry, type ReportStatus } from "@/lib/payment-reports";

export type StaffReport = {
  id: string;
  amount: number;
  paid_on: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  status: ReportStatus;
  reply: string | null;
  created_at: string;
  answered_at: string | null;
  answered_by: string | null;
  entry: { id: string; ref: string; status: string } | null;
};
const OUTCOME: Record<Exclude<ReportStatus, "open">, string> = { matched: "Matched", not_found: "Not found", withdrawn: "Withdrawn by tenant" };

/**
 * Payments a tenant says they made that aren't on their statement. Staff check their external
 * records, then record the payment, match it to an entry already recorded, or say it couldn't be
 * found and why. Nothing here changes the balance or confirms a payment.
 */
export function PaymentReportsPanel({ orgId, propertyId, tenantFirstName, open, answered, entries, recordHref, canAct, canRecord }: {
  orgId: string;
  propertyId: string;
  tenantFirstName: string;
  open: StaffReport[];
  answered: StaffReport[];
  entries: CandidateEntry[];
  recordHref: string;
  canAct: boolean;
  canRecord: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<{ id: string; kind: "match" | "not_found" } | null>(null);
  const [entryId, setEntryId] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  // An entry can answer only one report.
  const taken = new Set(answered.map((r) => r.entry?.id).filter(Boolean));
  const choices = entries.filter((e) => !taken.has(e.id) && e.status !== "not_accepted");

  const begin = (rid: string, kind: "match" | "not_found", suggested?: string) => {
    setMode({ id: rid, kind });
    setEntryId(suggested ?? "");
    setReply("");
    setError(null);
  };

  const answer = (rid: string) =>
    start(async () => {
      setError(null);
      if (mode?.kind === "match" && !entryId) return setError("Choose the payment entry.");
      if (mode?.kind === "not_found" && !reply.trim()) return setError(`Tell ${tenantFirstName} what you checked, so they know what to send.`);
      const res = await answerPaymentReport(orgId, propertyId, {
        report_id: rid,
        outcome: mode?.kind === "match" ? "matched" : "not_found",
        entry_id: mode?.kind === "match" ? entryId : undefined,
        reply: reply.trim() || undefined,
      });
      if (!res.ok) return setError(res.message);
      setMode(null);
      router.refresh();
    });

  const replyHint = `${tenantFirstName} sees this.`;

  return (
    <div className="flex flex-col gap-3">
      {open.length ? (
        <ul className="surface-list">
          {open.map((r) => {
            const match = likelyMatch(r, choices);
            const editing = mode?.id === r.id ? mode.kind : null;
            return (
              <li key={r.id} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      Says they paid {formatMoney(r.amount)} on {formatDate(r.paid_on)}
                    </p>
                    <p className="text-caption text-muted">
                      {[r.method ? METHOD_LABEL[r.method] : null, r.reference ? `ref ${r.reference}` : null, `reported ${timeAgo(r.created_at)}`].filter(Boolean).join(" · ")}
                    </p>
                    {r.note ? <p className="mt-1 text-label whitespace-pre-line">&ldquo;{r.note}&rdquo;</p> : null}
                  </div>
                  <StatusBadge tone="waiting">To check</StatusBadge>
                </div>
                {match ? (
                  <p className="text-label">
                    Possible match: <span className="font-mono">{match.ref}</span> · {formatMoney(match.amount)} paid {formatDate(match.paid_on, { year: false })}{" "}
                    <EntryStatusBadge status={match.status} />
                  </p>
                ) : null}

                {canAct && editing ? (
                  <form
                    className="flex flex-col gap-3 rounded-control bg-cool p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      answer(r.id);
                    }}
                  >
                    {editing === "match" ? (
                      <Field label="Which payment entry is it?" htmlFor={`${id}-entry-${r.id}`}>
                        <Select id={`${id}-entry-${r.id}`} value={entryId} onChange={(e) => setEntryId(e.target.value)}>
                          <option value="">Choose an entry</option>
                          {choices.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.ref} · {formatMoney(e.amount)} · {formatDate(e.paid_on, { year: false })} · {e.status.replace(/_/g, " ")}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : null}
                    <Field
                      label={editing === "match" ? `Note to ${tenantFirstName}` : `What you checked`}
                      htmlFor={`${id}-reply-${r.id}`}
                      optional={editing === "match"}
                      hint={replyHint}
                    >
                      <TextArea
                        id={`${id}-reply-${r.id}`}
                        rows={2}
                        maxLength={1000}
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder={editing === "not_found" ? "e.g. No M-PESA payment with that code reached our till. Please send the full M-PESA message." : undefined}
                        aria-describedby={describedBy(`${id}-reply-${r.id}`, { hint: replyHint })}
                      />
                    </Field>
                    {error ? <InlineError>{error}</InlineError> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" size="sm" pending={pending}>{editing === "match" ? "Match and tell tenant" : "Send answer"}</Button>
                      <Button type="button" size="sm" variant="quiet" onClick={() => setMode(null)}>Cancel</Button>
                    </div>
                  </form>
                ) : canAct ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {canRecord ? (
                      <ButtonLink href={`${recordHref}&report=${r.id}`} size="sm" icon="plus">Record this payment</ButtonLink>
                    ) : null}
                    {choices.length ? (
                      <button type="button" className="link-action min-h-11 text-label" onClick={() => begin(r.id, "match", match?.id)}>
                        It&apos;s already recorded
                      </button>
                    ) : null}
                    <button type="button" className="link-action min-h-11 text-label" onClick={() => begin(r.id, "not_found")}>
                      Couldn&apos;t find it
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-label text-muted">No payments reported missing.</p>
      )}
      <p className="text-caption text-muted">
        Check your M-PESA statement or bank records first. A report is not proof of payment, and answering it never confirms a payment.
      </p>

      {answered.length ? (
        <details className="group">
          <summary className="link-action inline-flex min-h-11 cursor-pointer list-none items-center text-label">Answered ({answered.length})</summary>
          <ul className="mt-1 flex flex-col gap-2">
            {answered.map((r) => (
              <li key={r.id} className="text-label text-muted">
                <span className="font-semibold text-ink">{formatMoney(r.amount)} on {formatDate(r.paid_on, { year: false })}</span>
                {" · "}{r.status === "open" ? "" : OUTCOME[r.status]}
                {r.entry ? <> · <span className="font-mono">{r.entry.ref}</span></> : null}
                {r.answered_at ? ` · ${r.answered_by ? `${r.answered_by}, ` : ""}${timeAgo(r.answered_at)}` : ""}
                {r.reply ? ` · "${r.reply}"` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
