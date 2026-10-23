"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { applyCredit, correctEntry, reverseEntry } from "@/app/w/[orgId]/rent/actions";
import { Checkbox, Field, MoneyInput, TextArea, TextInput } from "@/components/ui/form";
import { Button, Notice, InlineError } from "@/components/ui/primitives";
import { formatAmount, formatMoney, parseAmount } from "@/lib/money";
import { previewAllocation, suggestAllocation, type OpenCharge } from "@/lib/rent/allocation";
import { todayEAT } from "@/lib/dates";

type Charge = OpenCharge & { thisEntry: number };

// Corrections never erase history: the original stays, a linked reversal is posted, and a
// replacement entry (if any) links back to it. A reason, actor and time are always kept.
export function CorrectionPanel({
  orgId,
  propertyId,
  entry,
  charges,
  canCorrect,
  canConfirm,
}: {
  orgId: string;
  propertyId: string;
  entry: { id: string; ref: string; amount: number; paidOn: string; method: string | null; reference: string | null; tenancyId: string; unallocated: number };
  charges: Charge[];
  canCorrect: boolean;
  canConfirm: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "correct" | "reverse" | "credit">(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(String(entry.amount));
  const [paidOn, setPaidOn] = useState(entry.paidOn);
  const [reference, setReference] = useState(entry.reference ?? "");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // For a correction, this entry's own allocations are reversed first, so they count as open.
  const correctionCharges = useMemo(
    () => charges.map((c) => ({ ...c, confirmed: Math.round((c.confirmed - c.thisEntry) * 100) / 100 })).filter((c) => c.net - c.confirmed > 0),
    [charges],
  );
  const creditCharges = charges.filter((c) => c.net - c.confirmed > 0);
  const amt = parseAmount(amount);
  const valid = amt !== null && Number.isFinite(amt) && amt > 0 ? amt : 0;
  const correctionLines = suggestAllocation(valid, correctionCharges);
  const correctionPreview = previewAllocation(valid, correctionLines, correctionCharges);
  const creditLines = suggestAllocation(entry.unallocated, creditCharges);
  const creditPreview = previewAllocation(entry.unallocated, creditLines, creditCharges);

  if (done) return <Notice tone="success" role="status" title={done} />;

  return (
    <section aria-labelledby="fix" className="surface flex flex-col gap-3 p-4">
      <h2 id="fix" className="heading-section">
        Fix or apply this record
      </h2>
      {!mode ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {canCorrect ? (
            <>
              <Button variant="secondary" onClick={() => setMode("correct")} className="flex-1">
                Correct amount, date or period
              </Button>
              <Button variant="secondary" onClick={() => setMode("reverse")} className="flex-1">
                Reverse only
              </Button>
            </>
          ) : null}
          {canConfirm && entry.unallocated > 0 && creditCharges.length ? (
            <Button variant="secondary" onClick={() => setMode("credit")} className="flex-1">
              Apply {formatMoney(entry.unallocated)} credit
            </Button>
          ) : null}
          {!canCorrect && !(canConfirm && entry.unallocated > 0) ? (
            <p className="text-label text-muted">Corrections need the &quot;Correct confirmed records&quot; permission.</p>
          ) : null}
        </div>
      ) : null}

      {mode === "credit" ? (
        <>
          <p className="text-label">Apply the credit oldest-first to open charges:</p>
          <ul className="text-label">
            {creditPreview.lines.map((l) => (
              <li key={l.chargeId}>
                {l.label}: {formatAmount(l.applied)} → {l.after <= 0 ? "Paid" : `${formatAmount(l.after)} left`}
              </li>
            ))}
          </ul>
          <Button
            pending={pending}
            onClick={() =>
              start(async () => {
                const r = await applyCredit(orgId, propertyId, entry.id, creditLines.map((l) => ({ charge_id: l.chargeId, amount: l.amount })));
                if (!r.ok) setError(r.message);
                else {
                  setDone("Credit applied");
                  router.refresh();
                }
              })
            }
          >
            Apply {formatMoney(creditPreview.applied)}
          </Button>
        </>
      ) : null}

      {mode === "reverse" || mode === "correct" ? (
        <>
          <Field label="Reason" htmlFor="corr-reason" hint="Required. Kept with the original record, your name and the time.">
            <TextArea id="corr-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={mode === "reverse" ? 'e.g. "Bank reversed the deposit on 20 Oct"' : 'e.g. "Entered 1,500 instead of 15,000"'} />
          </Field>
          {mode === "correct" ? (
            <>
              <Field label="Correct amount" htmlFor="corr-amount">
                <MoneyInput id="corr-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Correct payment date" htmlFor="corr-date">
                <TextInput id="corr-date" type="date" max={todayEAT()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </Field>
              <Field label="Reference" htmlFor="corr-ref" optional>
                <TextInput id="corr-ref" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} className="font-mono" />
              </Field>
              <div className="rounded-card bg-cool p-3 text-label">
                <p className="font-semibold">The replacement will apply to:</p>
                <ul>
                  {correctionPreview.lines.map((l) => (
                    <li key={l.chargeId}>
                      {l.label}: {formatAmount(l.applied)} → {l.after <= 0 ? "Paid" : `${formatAmount(l.after)} left`}
                    </li>
                  ))}
                  {correctionPreview.credit > 0 ? <li>Tenant credit: {formatAmount(correctionPreview.credit)}</li> : null}
                </ul>
              </div>
              {canConfirm ? (
                <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} label="I have checked the corrected payment using our property's external records and confirm it is accurate." />
              ) : (
                <p className="text-label text-muted">The replacement will wait for an authorised manager to confirm it.</p>
              )}
            </>
          ) : (
            <Notice tone="waiting">
              Reversing removes {formatMoney(entry.amount)} from confirmed totals and restores the affected balances. The original record stays visible.
            </Notice>
          )}
          {error ? <InlineError>{error}</InlineError> : null}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setMode(null); setError(null); }} className="flex-1">
              Cancel
            </Button>
            <Button
              variant={mode === "reverse" ? "danger" : "primary"}
              className="flex-[1.5]"
              pending={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  if (reason.trim().length < 3) {
                    setError("Give a reason for the correction.");
                    return;
                  }
                  if (mode === "reverse") {
                    const r = await reverseEntry(orgId, propertyId, entry.id, reason);
                    if (!r.ok) return setError(r.message);
                    setDone(`${entry.ref} reversed. Balances updated.`);
                  } else {
                    if (!valid) return setError("Enter the correct amount.");
                    if (canConfirm && !ack) return setError("Tick the box to confirm you checked the corrected payment.");
                    const r = await correctEntry(orgId, propertyId, entry.id, reason, {
                      client_request_id: crypto.randomUUID(),
                      tenancy_id: entry.tenancyId,
                      amount: valid,
                      paid_on: paidOn,
                      method: (entry.method ?? undefined) as "mpesa" | "bank" | "cash" | "other" | undefined,
                      reference: reference || undefined,
                      allocations: correctionLines.map((l) => ({ charge_id: l.chargeId, amount: l.amount })),
                      action: canConfirm ? "confirm" : "submit",
                      acknowledged: ack,
                    });
                    if (!r.ok) return setError(r.message);
                    setDone(`Corrected. ${entry.ref} reversed and replaced by ${r.data.ref} (${r.data.status.replace("_", " ")}).`);
                  }
                  router.refresh();
                })
              }
            >
              {mode === "reverse" ? "Reverse entry" : "Post correction"}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
