"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { sendTenantMessages } from "@/app/w/[orgId]/rent/actions";
import { ChoiceChips, Field, Select, TextArea, TextInput, describedBy } from "@/components/ui/form";
import { Button, InlineError, Notice } from "@/components/ui/primitives";
import { formatPeriod } from "@/lib/dates";
import { summarizeSend, type MessageKind } from "@/lib/tenant-messages";

const KINDS: Array<{ value: MessageKind; label: string }> = [
  { value: "invoice", label: "Invoice" },
  { value: "reminder", label: "Reminder" },
  { value: "message", label: "Message" },
];

const HINT: Record<MessageKind, string> = {
  invoice: "Lists the month's charges, anything still owed from before, and the amount due. Tenants without charges for the month are skipped.",
  reminder: "Says what is owed and which charges are overdue. Goes only to tenants who owe, at most once a day each.",
  message: "Anything else: water or power cuts, repairs, notices, the paybill number.",
};

/**
 * Email an invoice, a reminder or a message to one tenant or many. Figures are confirmed
 * records only; anyone who can't get it (no email, nothing owed…) is skipped and listed.
 */
export function SendToTenants({
  orgId,
  propertyId,
  tenancyIds,
  recipients,
  periods,
  defaultPeriod,
  defaultKind = "invoice",
  onSent,
}: {
  orgId: string;
  propertyId: string;
  tenancyIds: string[];
  /** "Amina" or "3 tenants" */
  recipients: string;
  periods: string[];
  defaultPeriod: string;
  defaultKind?: MessageKind;
  onSent?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<MessageKind>(defaultKind);
  const [period, setPeriod] = useState(defaultPeriod);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; skipped: string[]; ok: boolean } | null>(null);
  const id = useId();

  const send = () =>
    start(async () => {
      setError(null);
      setErrors({});
      setResult(null);
      if (kind === "message" && (!subject.trim() || !body.trim())) {
        setErrors({ ...(subject.trim() ? {} : { subject: "Write a subject." }), ...(body.trim() ? {} : { body: "Write the message." }) });
        return;
      }
      const res = await sendTenantMessages(orgId, propertyId, {
        client_request_id: requestId,
        kind,
        tenancy_ids: tenancyIds,
        period: kind === "invoice" ? period : undefined,
        subject: kind === "message" ? subject.trim() : undefined,
        body: body.trim() || undefined,
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setError(res.message);
        return;
      }
      const s = summarizeSend(kind, res.data);
      setResult({ ...s, ok: res.data.sent.length > 0 });
      // A new send is a new request; the one just made can't be sent twice by a double click.
      setRequestId(crypto.randomUUID());
      if (res.data.sent.length) {
        setSubject("");
        setBody("");
      }
      router.refresh();
      onSent?.();
    });

  const noun = kind === "invoice" ? "invoice" : kind === "reminder" ? "reminder" : "message";
  const many = tenancyIds.length > 1;
  const noteHint = kind === "message" ? undefined : "Added under the figures, e.g. how to pay.";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <ChoiceChips name={`${id}-kind`} legend="What to send" options={KINDS} value={kind} onChange={(v) => { setKind(v as MessageKind); setResult(null); }} hint={HINT[kind]} />
      {kind === "invoice" ? (
        <Field label="Month" htmlFor={`${id}-period`}>
          <Select id={`${id}-period`} value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periods.map((p) => (
              <option key={p} value={p}>{formatPeriod(p)}</option>
            ))}
          </Select>
        </Field>
      ) : null}
      {kind === "message" ? (
        <Field label="Subject" htmlFor={`${id}-subject`} error={errors.subject}>
          <TextInput id={`${id}-subject`} value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} error={errors.subject} aria-describedby={describedBy(`${id}-subject`, { error: errors.subject })} />
        </Field>
      ) : null}
      <Field
        label={kind === "message" ? "Message" : "Note"}
        htmlFor={`${id}-body`}
        optional={kind !== "message"}
        error={errors.body}
        hint={noteHint}
      >
        <TextArea id={`${id}-body`} value={body} maxLength={5000} rows={kind === "message" ? 5 : 3} onChange={(e) => setBody(e.target.value)} error={errors.body} aria-describedby={describedBy(`${id}-body`, { error: errors.body, hint: noteHint })} />
      </Field>
      <p className="text-caption text-muted">
        Emailed to the tenant&apos;s address on file. Tenants with online access also see it in My rent. Replies to the email aren&apos;t read, so include how to reach you if needed.
      </p>
      {error ? <InlineError>{error}</InlineError> : null}
      {result ? (
        <Notice tone={result.ok ? "success" : "waiting"} role="status" title={result.title}>
          {result.skipped.length ? (
            <>
              Not sent to:
              <ul className="mt-1 list-disc pl-5">
                {result.skipped.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </>
          ) : null}
        </Notice>
      ) : null}
      <Button type="submit" icon="mail" pending={pending} pendingLabel="Sending…" className="self-start">
        {many ? `Send ${noun}s to ${recipients}` : `Send ${noun} to ${recipients}`}
      </Button>
    </form>
  );
}
