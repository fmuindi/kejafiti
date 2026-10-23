"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideEntry } from "@/app/w/[orgId]/rent/actions";
import { Checkbox, Field, TextArea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Button, Notice } from "@/components/ui/primitives";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { METHOD_LABEL } from "@/lib/rent/status";

export type InboxEntry = {
  id: string;
  ref: string;
  version: number;
  amount: number;
  paidOn: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  submittedAgo: string;
  submittedBy: string;
  propertyName: string;
  propertyId: string;
  unitLabel: string;
  tenantName: string;
  lines: Array<{ label: string; amount: number; before: number; after: number }>;
  credit: number;
  attachments: Array<{ id: string; name: string; mime: string; at: string; url: string }>;
  canViewAttachments: boolean;
};

export function ConfirmCard({ orgId, entry }: { orgId: string; entry: InboxEntry }) {
  const router = useRouter();
  const [mode, setMode] = useState<"review" | "return" | "not_accept">("review");
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (decision: "confirm" | "return" | "not_accept") =>
    start(async () => {
      setError(null);
      if (decision === "confirm" && !ack) {
        setError("Tick the box to confirm you checked this payment externally.");
        return;
      }
      if (decision !== "confirm" && reason.trim().length < 3) {
        setError("Explain what needs to change, so the person who entered it can fix it.");
        return;
      }
      const res = await decideEntry(orgId, { entryId: entry.id, decision, reason, acknowledged: ack, version: entry.version });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setResult(decision === "confirm" ? "confirmed" : decision === "return" ? "returned" : "not accepted");
      router.refresh();
    });

  if (result) {
    return (
      <Notice tone={result === "confirmed" ? "success" : "info"} role="status" title={`${entry.ref} ${result}`}>
        {result === "confirmed"
          ? `Unit ${entry.unitLabel} balance and the property totals now include ${formatMoney(entry.amount)}.`
          : `${entry.submittedBy} has been told why.`}
      </Notice>
    );
  }

  const first = entry.lines[0];
  return (
    <article aria-labelledby={`e-${entry.id}`} className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-4">
      <p className="text-[0.8125rem] text-muted">
        Submitted by <strong className="text-ink">{entry.submittedBy}</strong> · {entry.submittedAgo} · {entry.propertyName}
      </p>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`e-${entry.id}`} className="font-semibold">
            <span className="font-mono">{entry.unitLabel}</span> · {entry.tenantName}
          </h2>
          <p className="text-[0.84375rem] text-muted">{entry.lines.map((l) => l.label).join(", ") || "Kept as tenant credit"}</p>
        </div>
        <p className="font-display text-[1.5rem] font-extrabold whitespace-nowrap">{formatMoney(entry.amount)}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[0.875rem]">
        <dt className="text-muted">Paid on</dt>
        <dd className="font-semibold">{formatDate(entry.paidOn)}</dd>
        <dt className="text-muted">Method</dt>
        <dd className="font-semibold">{entry.method ? METHOD_LABEL[entry.method] : "Not given"}</dd>
        <dt className="text-muted">Reference</dt>
        <dd className="font-mono font-medium">{entry.reference ?? "Not given"}</dd>
        {entry.notes ? (
          <>
            <dt className="text-muted">Notes</dt>
            <dd>{entry.notes}</dd>
          </>
        ) : null}
      </dl>

      {entry.attachments.length ? (
        <ul className="flex flex-col gap-2">
          {entry.attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-[14px] border border-line p-3">
              <Icon name={a.mime === "application/pdf" ? "file" : "image"} className="text-deep" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {entry.canViewAttachments ? (
                    <a href={a.url} target="_blank" rel="noopener" className="underline">
                      {a.name}
                    </a>
                  ) : (
                    a.name
                  )}
                </p>
                <p className="text-[0.78125rem] text-muted">From {entry.submittedBy} · {formatDateTime(a.at)}. Supplied by staff. It is not proof of payment.</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[0.8125rem] text-muted">No evidence attached.</p>
      )}

      {entry.lines.length ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[14px] bg-cool p-3 text-[0.875rem]">
          <div>
            <p className="text-[0.78125rem] text-muted">Now</p>
            <p className="font-semibold">{formatAmount(first.before)} unpaid</p>
          </div>
          <Icon name="arrowRight" className="text-muted" />
          <div>
            <p className="text-[0.78125rem] text-muted">After confirming</p>
            <p className="font-semibold">{first.after <= 0 ? "Paid" : `${formatAmount(first.after)} left · Partial`}</p>
          </div>
          {entry.lines.length > 1 ? <p className="col-span-3 text-[0.78125rem] text-muted">Also applies to {entry.lines.slice(1).map((l) => `${l.label} (${formatAmount(l.amount)})`).join(", ")}.</p> : null}
          {entry.credit > 0 ? <p className="col-span-3 text-[0.78125rem] text-muted">{formatMoney(entry.credit)} will be kept as tenant credit.</p> : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-[0.875rem] font-semibold text-error">
          {error}
        </p>
      ) : null}

      {mode === "review" ? (
        <>
          <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} label="I have checked this payment using our property's external records and confirm this entry is accurate." />
          <Button size="lg" pending={pending} pendingLabel="Confirming" onClick={() => submit("confirm")}>
            Confirm {formatMoney(entry.amount)}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setMode("return")}>
              Return for changes
            </Button>
            <Button variant="secondary" onClick={() => setMode("not_accept")}>
              Do not accept
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <Field
            label={mode === "return" ? "What needs to change?" : "Why isn't this accepted?"}
            htmlFor={`reason-${entry.id}`}
            hint={mode === "return" ? `${entry.submittedBy} will see this and can edit and resubmit.` : "The entry is closed with this reason. It does not create a confirmed payment."}
          >
            <TextArea id={`reason-${entry.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => { setMode("review"); setError(null); }}>
              Back
            </Button>
            <Button variant={mode === "return" ? "dark" : "danger"} pending={pending} onClick={() => submit(mode)}>
              {mode === "return" ? "Return entry" : "Do not accept"}
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
