"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { addFollowUp, resolveFollowUp } from "@/app/w/[orgId]/rent/actions";
import { Checkbox, ChoiceChips, Field, MoneyInput, TextArea, TextInput, describedBy } from "@/components/ui/form";
import { Button, InlineError, StatusBadge } from "@/components/ui/primitives";
import { formatDate, timeAgo } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

type Kind = "contacted" | "promised" | "reported" | "note";
export type FollowUp = {
  id: string;
  kind: Kind;
  note: string | null;
  due_on: string | null;
  promised_amount: number | null;
  assigned: string;
  created_by: string;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
};

const KINDS: Array<{ value: Kind; label: string }> = [
  { value: "contacted", label: "Contacted" },
  { value: "promised", label: "Promised to pay" },
  { value: "reported", label: "Says they paid" },
  { value: "note", label: "Note" },
];
const LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<Kind, string>;

/**
 * What is being done about a balance: contact notes, promises to pay and reported payments,
 * each with an optional date and a person. Staff-only; never changes the balance.
 */
export function FollowUps({ orgId, propertyId, tenancyId, today, open, closed, canAct }: {
  orgId: string;
  propertyId: string;
  tenancyId: string;
  today: string;
  open: FollowUp[];
  closed: FollowUp[];
  canAct: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<Kind>("contacted");
  const [due, setDue] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [anyone, setAnyone] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");
  const id = useId();

  const add = () =>
    start(async () => {
      setError(null);
      const e: Record<string, string> = {};
      if (kind === "promised" && !due) e.due_on = "Enter the date they promised to pay by.";
      if (kind === "note" && !note.trim()) e.note = "Write the note.";
      const amt = amount.trim() ? Number(amount.replace(/,/g, "")) : undefined;
      if (amt !== undefined && !(amt > 0)) e.promised_amount = "Enter the amount in KSh, or leave it empty.";
      setErrors(e);
      if (Object.keys(e).length) return;
      const res = await addFollowUp(orgId, propertyId, {
        client_request_id: requestId,
        tenancy_id: tenancyId,
        kind,
        note: note.trim() || undefined,
        due_on: due || undefined,
        promised_amount: kind === "promised" ? amt : undefined,
        anyone,
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setError(res.message);
        return;
      }
      setRequestId(crypto.randomUUID());
      setAdding(false);
      setDue("");
      setAmount("");
      setNote("");
      setAnyone(false);
      router.refresh();
    });

  const resolve = (fid: string) =>
    start(async () => {
      setError(null);
      const res = await resolveFollowUp(orgId, propertyId, fid, outcome.trim());
      if (!res.ok) return setError(res.message);
      setClosing(null);
      setOutcome("");
      router.refresh();
    });

  const dueTone = (d: string | null) => (!d ? null : d < today ? "error" : d === today ? "waiting" : "neutral");
  const dateHint = kind === "promised" ? undefined : "When to check again. Leave empty for a note only.";
  const noteHint = "Staff only. Never shown to the tenant.";

  return (
    <div className="flex flex-col gap-3">
      {open.length ? (
        <ul className="surface-list">
          {open.map((f) => {
            const tone = dueTone(f.due_on);
            return (
              <li key={f.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {LABEL[f.kind]}
                      {f.kind === "promised" && f.promised_amount ? ` · ${formatMoney(f.promised_amount)}` : ""}
                    </p>
                    {f.note ? <p className="text-label whitespace-pre-line">{f.note}</p> : null}
                    <p className="text-caption text-muted">
                      {f.created_by} · {timeAgo(f.created_at)} · for {f.assigned}
                    </p>
                  </div>
                  {f.due_on && tone ? (
                    <StatusBadge tone={tone as "error" | "waiting" | "neutral"} icon={tone === "neutral" ? null : undefined}>
                      {f.kind === "promised" ? "Pay by" : "Follow up"} {f.due_on === today ? "today" : formatDate(f.due_on, { year: false })}
                    </StatusBadge>
                  ) : null}
                </div>
                {canAct ? (
                  closing === f.id ? (
                    <form
                      className="flex flex-col gap-2 sm:flex-row sm:items-end"
                      onSubmit={(e) => {
                        e.preventDefault();
                        resolve(f.id);
                      }}
                    >
                      <Field label="Outcome" htmlFor={`${id}-out-${f.id}`} optional className="flex-1">
                        <TextInput id={`${id}-out-${f.id}`} value={outcome} maxLength={500} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Paid; entry submitted" />
                      </Field>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" pending={pending}>Mark done</Button>
                        <Button type="button" size="sm" variant="quiet" onClick={() => setClosing(null)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <button type="button" className="link-action self-start text-label" onClick={() => { setClosing(f.id); setOutcome(""); }}>
                      Mark done
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-label text-muted">No open follow-ups.</p>
      )}

      {canAct ? (
        adding ? (
          <form
            className="surface flex flex-col gap-4 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <ChoiceChips name={`${id}-kind`} legend="What happened" options={KINDS} value={kind} onChange={(v) => setKind(v as Kind)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={kind === "promised" ? "Promised to pay by" : "Follow up on"} htmlFor={`${id}-due`} optional={kind !== "promised"} error={errors.due_on} hint={dateHint}>
                <TextInput id={`${id}-due`} type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} error={errors.due_on} aria-describedby={describedBy(`${id}-due`, { error: errors.due_on, hint: dateHint })} />
              </Field>
              {kind === "promised" ? (
                <Field label="Amount promised" htmlFor={`${id}-amt`} optional error={errors.promised_amount}>
                  <MoneyInput id={`${id}-amt`} value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.promised_amount} />
                </Field>
              ) : null}
            </div>
            <Field label="Note" htmlFor={`${id}-note`} optional={kind !== "note"} error={errors.note} hint={noteHint}>
              <TextArea id={`${id}-note`} value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} error={errors.note} aria-describedby={describedBy(`${id}-note`, { error: errors.note, hint: noteHint })} />
            </Field>
            <Checkbox checked={anyone} onChange={(e) => setAnyone(e.target.checked)} label="Anyone on the team can pick this up" description="Otherwise it's yours and shows in your queue." />
            {error ? <InlineError>{error}</InlineError> : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" pending={pending}>Add follow-up</Button>
              <Button type="button" size="sm" variant="quiet" onClick={() => { setAdding(false); setErrors({}); setError(null); }}>Cancel</Button>
            </div>
            <p className="text-caption text-muted">A follow-up never changes the balance. A promise to pay isn&apos;t a payment.</p>
          </form>
        ) : (
          <Button size="sm" variant="secondary" icon="plus" className="self-start" onClick={() => setAdding(true)}>Add follow-up</Button>
        )
      ) : null}
      {error && !adding ? <InlineError>{error}</InlineError> : null}

      {closed.length ? (
        <details className="group">
          <summary className="link-action inline-flex min-h-11 cursor-pointer list-none items-center text-label">Done ({closed.length})</summary>
          <ul className="mt-1 flex flex-col gap-2">
            {closed.map((f) => (
              <li key={f.id} className="text-label text-muted">
                <span className="font-semibold text-ink">{LABEL[f.kind]}</span>
                {f.note ? `: ${f.note}` : ""} · closed {f.resolved_at ? timeAgo(f.resolved_at) : ""}
                {f.resolution ? ` · ${f.resolution}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
