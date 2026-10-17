"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { findDuplicates, registerAttachment, removeAttachment, savePaymentEntry, type EntryResult } from "@/app/w/[orgId]/rent/actions";
import { Checkbox, ErrorSummary, Field, MoneyInput, TextArea, TextInput, describedBy } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Button, ButtonLink, Notice, cx } from "@/components/ui/primitives";
import { MAX_UPLOAD_BYTES, resizeImage, safeFileName } from "@/lib/image";
import { formatAmount, formatMoney, parseAmount, sumAmounts, subtract } from "@/lib/money";
import { outstandingOf, previewAllocation, suggestAllocation, type OpenCharge } from "@/lib/rent/allocation";
import { todayEAT, formatDate } from "@/lib/dates";
import { getBrowserClient } from "@/lib/supabase/browser";

type Charge = OpenCharge & { category: string };
type Attachment = { id: string; file_name: string; mime_type: string; size_bytes: number; created_at: string };
type Upload = { key: string; name: string; state: "uploading" | "done" | "failed"; id?: string; error?: string; file?: File };

type Props = {
  orgId: string;
  propertyId: string;
  propertyName: string;
  unitLabel: string;
  tenantName: string;
  tenancyId: string;
  tenancyStart: string;
  tenancyEnded: boolean;
  charges: Charge[];
  currentCharge: Charge | null;
  canConfirm: boolean;
  evidenceRequired: boolean;
  periodTotals: { billed: number; settled: number; label: string } | null;
  today: string;
  existing: null | {
    id: string;
    ref: string;
    version: number;
    clientRequestId: string;
    amount: number;
    paidOn: string;
    method: string | null;
    reference: string | null;
    notes: string | null;
    allocations: Array<{ chargeId: string; amount: number }>;
    attachments: Attachment[];
  };
};

type LocalDraft = {
  clientRequestId: string;
  amount: string;
  paidOn: string;
  lines: Record<string, string>;
  linesEdited: boolean;
  method: string;
  reference: string;
  notes: string;
  savedAt: number;
};

const METHODS = [
  { value: "mpesa", label: "M-PESA" },
  { value: "bank", label: "Bank" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

export function RecordPaymentForm(props: Props) {
  const { existing, charges, tenancyId } = props;
  const draftKey = `nyumbani.entryDraft.${existing?.id ?? tenancyId}`;

  const [clientRequestId, setClientRequestId] = useState(existing?.clientRequestId ?? "");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [paidOn, setPaidOn] = useState(existing?.paidOn ?? "");
  const [lines, setLines] = useState<Record<string, string>>(
    Object.fromEntries((existing?.allocations ?? []).map((a) => [a.chargeId, String(a.amount)])),
  );
  const [linesEdited, setLinesEdited] = useState(!!existing);
  const [method, setMethod] = useState(existing?.method ?? "");
  const [reference, setReference] = useState(existing?.reference ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [ack, setAck] = useState(false);
  const [entry, setEntry] = useState<{ id: string; ref: string; version: number } | null>(
    existing ? { id: existing.id, ref: existing.ref, version: existing.version } : null,
  );
  const [attachments, setAttachments] = useState<Attachment[]>(existing?.attachments ?? []);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [status, setStatus] = useState<"idle" | "device" | "server" | "restored">("idle");
  const [pending, setPending] = useState<null | "draft" | "submit" | "confirm" | "upload">(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<Awaited<ReturnType<typeof findDuplicates>> | null>(null);
  const [dupesAccepted, setDupesAccepted] = useState(false);
  const [done, setDone] = useState<EntryResult | null>(null);
  const hydrated = useRef(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Restore an unsent entry saved on this device, or start a fresh retry-safe request id.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    let restored = false;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as LocalDraft;
        setClientRequestId(d.clientRequestId);
        setAmount(d.amount);
        setPaidOn(d.paidOn);
        setLines(d.lines);
        setLinesEdited(d.linesEdited);
        setMethod(d.method);
        setReference(d.reference);
        setNotes(d.notes);
        setStatus("restored");
        restored = true;
      }
    } catch {
      // Storage unavailable: continue without a device draft.
    }
    if (!restored) {
      if (!existing) setClientRequestId(newId());
      if (!existing) setPaidOn(todayEAT());
    }
  }, [draftKey, existing]);

  // Keep a copy on this device so poor connectivity never loses work.
  useEffect(() => {
    if (!hydrated.current || !clientRequestId || done) return;
    if (!amount && !reference && !notes) return;
    const t = setTimeout(() => {
      try {
        const d: LocalDraft = { clientRequestId, amount, paidOn, lines, linesEdited, method, reference, notes, savedAt: Date.now() };
        window.localStorage.setItem(draftKey, JSON.stringify(d));
        setStatus((s) => (s === "server" ? s : "device"));
      } catch {
        // ignore
      }
    }, 400);
    return () => clearTimeout(t);
  }, [clientRequestId, amount, paidOn, lines, linesEdited, method, reference, notes, draftKey, done]);

  const amountNum = parseAmount(amount);
  const validAmount = amountNum !== null && Number.isFinite(amountNum) && amountNum > 0 ? amountNum : null;

  // Suggest oldest-first allocation until the user edits the lines themselves.
  useEffect(() => {
    if (linesEdited) return;
    const suggested = validAmount ? suggestAllocation(validAmount, charges) : [];
    setLines(Object.fromEntries(suggested.map((l) => [l.chargeId, String(l.amount)])));
  }, [validAmount, charges, linesEdited]);

  const allocLines = useMemo(
    () =>
      Object.entries(lines)
        .map(([chargeId, v]) => ({ chargeId, amount: parseAmount(v) ?? 0 }))
        .filter((l) => Number.isFinite(l.amount) && l.amount > 0),
    [lines],
  );
  const preview = previewAllocation(validAmount ?? 0, allocLines, charges);
  const current = props.currentCharge;
  const currentOutstanding = current ? outstandingOf(current) : 0;
  const totalOutstanding = sumAmounts(charges.map(outstandingOf));
  const fullAmount = currentOutstanding > 0 ? currentOutstanding : totalOutstanding;
  const currentAfter = current ? preview.lines.find((l) => l.chargeId === current.id) : undefined;

  function validate(forAction: "draft" | "submit" | "confirm") {
    const e: Record<string, string> = {};
    if (!validAmount) e.amount = "Enter the amount paid in KSh.";
    if (!paidOn) e.paid_on = "Enter the date the tenant paid.";
    else if (paidOn > todayEAT()) e.paid_on = "The payment date can't be in the future.";
    if (preview.errors.length) e.allocations = preview.errors[0];
    if (forAction !== "draft" && preview.applied === 0 && charges.length > 0) {
      e.allocations = "Choose which rent period this payment applies to, or keep it all as tenant credit by entering 0.";
      if (preview.credit > 0 && allocLines.length === 0) delete e.allocations;
    }
    if (forAction === "confirm" && !ack) e.ack = "Tick the box to confirm you checked this payment externally.";
    if (forAction === "confirm" && props.evidenceRequired && attachments.length === 0) {
      e.evidence = "This property asks for a receipt or other evidence before confirming.";
    }
    return e;
  }

  function payload(action: "draft" | "submit" | "confirm") {
    return {
      client_request_id: clientRequestId,
      entry_id: entry?.id,
      expected_version: entry?.version,
      tenancy_id: tenancyId,
      amount: validAmount ?? 0,
      paid_on: paidOn,
      method: (method || undefined) as "mpesa" | "bank" | "cash" | "other" | undefined,
      reference: reference || undefined,
      notes: notes || undefined,
      allocations: allocLines.map((l) => ({ charge_id: l.chargeId, amount: l.amount })),
      action,
      acknowledged: action === "confirm" ? ack : undefined,
    };
  }

  async function save(action: "draft" | "submit" | "confirm") {
    setFormError(null);
    const e = validate(action);
    setErrors(e);
    if (Object.keys(e).length) return null;

    if (action !== "draft" && !dupesAccepted && validAmount) {
      const found = await findDuplicates({ tenancyId, amount: validAmount, paidOn, reference, excludeId: entry?.id });
      if (found.length) {
        setDupes(found);
        return null;
      }
    }

    setPending(action);
    try {
      const res = await savePaymentEntry(props.orgId, props.propertyId, payload(action));
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.message);
        return null;
      }
      setEntry({ id: res.data.id, ref: res.data.ref, version: res.data.version });
      setStatus("server");
      if (action !== "draft") {
        try {
          window.localStorage.removeItem(draftKey);
        } catch {
          // ignore
        }
        setDone(res.data);
      }
      return res.data;
    } catch {
      setFormError("Not sent. Your entry is saved on this device. Check your connection and try again; retrying won't create a duplicate.");
      return null;
    } finally {
      setPending(null);
    }
  }

  async function ensureEntry(): Promise<{ id: string } | null> {
    if (entry) return entry;
    if (!validAmount || !paidOn) {
      setErrors((x) => ({ ...x, evidence: "Enter the amount and date first, so the file is attached to this entry." }));
      return null;
    }
    return save("draft");
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const target = await ensureEntry();
    if (!target) return;
    for (const file of Array.from(list)) void uploadOne(file, target.id);
  }

  async function uploadOne(file: File, entryId: string, key = newId()) {
    setUploads((u) => [...u.filter((x) => x.key !== key), { key, name: file.name, state: "uploading", file }]);
    try {
      if (!["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"].includes(file.type)) {
        throw new Error("Upload a photo (JPG, PNG, WEBP, HEIC) or a PDF.");
      }
      let body: Blob = file;
      let type = file.type;
      let name = safeFileName(file.name);
      if (file.type.startsWith("image/") && file.type !== "image/heic") {
        const r = await resizeImage(file, 2000);
        if (r && r.blob.size < file.size) {
          body = r.blob;
          type = "image/jpeg";
          name = name.replace(/\.\w+$/, "") + ".jpg";
        }
      }
      if (body.size > MAX_UPLOAD_BYTES) throw new Error("This file is larger than 15 MB.");
      const path = `${props.orgId}/${props.propertyId}/${entryId}/${newId()}-${name}`;
      const { error } = await getBrowserClient().storage.from("private-docs").upload(path, body, { contentType: type, upsert: false });
      if (error) throw new Error("The upload didn't finish. Check your connection and retry.");
      const reg = await registerAttachment({ entryId, path, fileName: name, mimeType: type, size: body.size });
      if (!reg.ok) throw new Error(reg.message);
      setAttachments((a) => [...a, { id: reg.data.id, file_name: name, mime_type: type, size_bytes: body.size, created_at: new Date().toISOString() }]);
      setUploads((u) => u.filter((x) => x.key !== key));
    } catch (err) {
      setUploads((u) => u.map((x) => (x.key === key ? { ...x, state: "failed", error: (err as Error).message } : x)));
    }
  }

  if (done) {
    const confirmed = done.status === "confirmed";
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success" role="status" title={confirmed ? `Confirmed · ${done.ref}` : `Submitted for confirmation · ${done.ref}`}>
          {done.replayed
            ? "This entry had already been saved, so nothing was duplicated."
            : confirmed
              ? "Balances and reports now include this payment."
              : "It shows as pending and doesn't count until a manager confirms it."}
        </Notice>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ButtonLink href={`/w/${props.orgId}/rent/${props.propertyId}`} className="flex-1">
            Back to the register
          </ButtonLink>
          <ButtonLink href={`/w/${props.orgId}/rent/${props.propertyId}/entries/${done.id}`} variant="secondary" className="flex-1">
            View entry
          </ButtonLink>
        </div>
      </div>
    );
  }

  const statusLabel =
    pending ? "Saving…"
    : status === "server" ? (entry ? `Draft saved · ${entry.ref}` : "Saved")
    : status === "device" ? "Saved on this device"
    : status === "restored" ? "Restored from this device"
    : "";

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save(props.canConfirm ? "confirm" : "submit");
      }}
      className="flex flex-col gap-5"
    >
      <p className="-mt-2 text-right text-[12.5px] text-muted" aria-live="polite">
        {statusLabel}
      </p>
      <ErrorSummary errors={errors} message={formError ?? undefined} />

      <section className="rounded-[16px] bg-cool p-4">
        <p className="font-mono text-[12px] tracking-[0.6px] text-muted uppercase">
          {props.propertyName} · {props.unitLabel}
        </p>
        <p className="mt-1 font-semibold">
          {props.tenantName}
          {props.tenancyEnded ? " · former tenant" : ` · tenancy since ${formatDate(props.tenancyStart)}`}
        </p>
        {current ? (
          <p className="mt-1 text-[14px] text-muted">
            {current.label} {formatMoney(current.net)} · Confirmed {formatAmount(current.confirmed)} · <strong className="text-ink">{formatAmount(currentOutstanding)} left</strong>
          </p>
        ) : (
          <p className="mt-1 text-[14px] text-muted">Outstanding across all periods: {formatMoney(totalOutstanding)}</p>
        )}
      </section>

      <Field label="Amount paid" htmlFor="amount" error={errors.amount}>
        <MoneyInput
          id="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amount}
          aria-describedby={describedBy("amount", { error: errors.amount })}
        />
      </Field>
      {fullAmount > 0 ? (
        <button
          type="button"
          onClick={() => {
            setAmount(String(fullAmount));
            setLinesEdited(false);
          }}
          className="-mt-3 self-start rounded-full border-[1.5px] border-line bg-surface px-3.5 py-2 text-[14px] font-semibold"
        >
          Record full payment · {formatMoney(fullAmount)}
        </button>
      ) : null}

      <Field label="Date the tenant paid" htmlFor="paid_on" error={errors.paid_on} hint="Entry and confirmation times are saved separately.">
        <TextInput
          id="paid_on"
          type="date"
          max={todayEAT()}
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          error={errors.paid_on}
          aria-describedby={describedBy("paid_on", { error: errors.paid_on, hint: true })}
        />
      </Field>

      <fieldset id="allocations" className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[14px] font-semibold">Apply to</legend>
        {charges.length === 0 ? (
          <p className="rounded-[14px] border border-dashed border-line bg-surface p-4 text-[14px] text-muted">
            No open charges. The whole amount will be kept as tenant credit for future periods.
          </p>
        ) : (
          charges.map((c) => {
            const v = lines[c.id] ?? "";
            const on = (parseAmount(v) ?? 0) > 0;
            const pl = preview.lines.find((l) => l.chargeId === c.id);
            const open = outstandingOf(c);
            return (
              <div key={c.id} className={cx("flex items-center gap-3 rounded-[14px] border bg-surface p-3", on ? "border-ink" : "border-line")}>
                <input
                  type="checkbox"
                  aria-label={`Apply to ${c.label}`}
                  checked={on}
                  onChange={(e) => {
                    setLinesEdited(true);
                    const remaining = subtract(validAmount ?? 0, sumAmounts(allocLines.filter((l) => l.chargeId !== c.id).map((l) => l.amount)));
                    setLines((x) => ({ ...x, [c.id]: e.target.checked ? String(Math.max(0, Math.min(open, remaining))) : "0" }));
                  }}
                  className="size-[22px] shrink-0 accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.label}</p>
                  <p className="text-[12.5px] text-muted">
                    {pl ? (
                      <>
                        {formatAmount(pl.before)} left → <span className={pl.after <= 0 ? "font-semibold text-success" : ""}>{formatAmount(Math.max(0, pl.after))} left{pl.after <= 0 ? " · Paid" : ""}</span>
                      </>
                    ) : c.dueDate > todayEAT() ? (
                      `Not yet due · ${formatAmount(open)}`
                    ) : (
                      `${formatAmount(open)} left · due ${formatDate(c.dueDate, { year: false })}`
                    )}
                  </p>
                </div>
                <label className="sr-only" htmlFor={`line-${c.id}`}>
                  Amount applied to {c.label}
                </label>
                <input
                  id={`line-${c.id}`}
                  inputMode="decimal"
                  value={v}
                  onChange={(e) => {
                    setLinesEdited(true);
                    setLines((x) => ({ ...x, [c.id]: e.target.value }));
                  }}
                  className="w-24 rounded-[10px] border border-input px-2 py-2 text-right font-mono text-[15px]"
                />
              </div>
            );
          })
        )}
        {errors.allocations ? <p className="text-[13.5px] font-semibold text-error">{errors.allocations}</p> : null}
        <p className="text-[13px] text-muted">
          Not applied: {formatMoney(preview.credit)}. Any extra is kept as tenant credit.
          {linesEdited ? (
            <>
              {" "}
              <button type="button" className="font-semibold text-ink underline" onClick={() => setLinesEdited(false)}>
                Apply oldest first
              </button>
            </>
          ) : null}
        </p>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-[14px] font-semibold">
          How they paid <span className="font-normal text-muted">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={method === m.value}
              onClick={() => setMethod(method === m.value ? "" : m.value)}
              className={cx("min-h-11 rounded-full border-[1.5px] px-4 text-[14.5px] font-semibold", method === m.value ? "border-ink bg-ink text-white" : "border-line bg-surface")}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[13px] text-muted">For your records only. No account is connected.</p>
      </fieldset>

      <Field label="Reference" htmlFor="reference" optional hint="For example the M-PESA code or bank slip number.">
        <TextInput id="reference" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} maxLength={80} className="font-mono" autoCapitalize="characters" aria-describedby="reference-hint" />
      </Field>
      <Field label="Notes" htmlFor="notes" optional>
        <TextArea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} />
      </Field>

      <section id="evidence" aria-labelledby="evidence-title" className="flex flex-col gap-2">
        <h2 id="evidence-title" className="text-[14px] font-semibold">
          Receipt or evidence <span className="font-normal text-muted">{props.evidenceRequired ? "(required by this property)" : "(optional)"}</span>
        </h2>
        {attachments.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-[14px] border border-line bg-surface p-3">
            <Icon name={a.mime_type === "application/pdf" ? "file" : "image"} className="text-deep" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{a.file_name}</p>
              <p className="text-[12.5px] text-muted">Private · visible to {props.propertyName} staff only</p>
            </div>
            <button
              type="button"
              className="min-h-11 px-2 text-[14px] font-semibold underline"
              onClick={async () => {
                const r = await removeAttachment(a.id);
                if (r.ok) setAttachments((x) => x.filter((y) => y.id !== a.id));
              }}
            >
              Remove
            </button>
          </div>
        ))}
        {uploads.map((u) => (
          <div key={u.key} className={cx("flex items-center gap-3 rounded-[14px] border bg-surface p-3", u.state === "failed" ? "border-error" : "border-line")}>
            <Icon name={u.state === "failed" ? "alert" : "upload"} className={u.state === "failed" ? "text-error" : "text-muted"} />
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="truncate font-semibold">{u.name}</p>
              <p className={cx("text-[12.5px]", u.state === "failed" ? "text-error" : "text-muted")}>{u.state === "failed" ? `Upload failed. ${u.error ?? ""}` : "Uploading…"}</p>
            </div>
            {u.state === "failed" && u.file && entry ? (
              <button type="button" className="min-h-11 px-2 text-[14px] font-semibold underline" onClick={() => void uploadOne(u.file as File, entry.id, u.key)}>
                Retry
              </button>
            ) : null}
            {u.state === "failed" ? (
              <button type="button" className="min-h-11 px-2 text-[14px] font-semibold underline" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}>
                Remove
              </button>
            ) : null}
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" icon="camera" onClick={() => cameraRef.current?.click()} className="flex-1">
            Take photo
          </Button>
          <Button type="button" variant="secondary" icon="upload" onClick={() => fileRef.current?.click()} className="flex-1">
            Choose file
          </Button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
        <p className="text-[12.5px] text-muted">JPG, PNG, HEIC or PDF, up to 15 MB. Files stay private. A photo is evidence supplied by staff; it is not proof of payment.</p>
        {errors.evidence ? <p className="text-[13.5px] font-semibold text-error">{errors.evidence}</p> : null}
      </section>

      {dupes && !dupesAccepted ? (
        <Notice tone="waiting" role="alert" title="This may be a duplicate">
          <ul className="mt-1 list-disc pl-5">
            {dupes.map((d) => (
              <li key={d.id}>
                <Link href={`/w/${props.orgId}/rent/${props.propertyId}/entries/${d.id}`} className="underline" target="_blank">
                  {d.ref}
                </Link>{" "}
                · {formatMoney(d.amount)} on {formatDate(d.paid_on)} · {d.status.replace("_", " ")}
                {d.reason === "same_reference" ? " · same reference" : ""}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setDupes(null)}>
              Go back and check
            </Button>
            <Button
              type="button"
              size="sm"
              variant="dark"
              onClick={() => {
                setDupesAccepted(true);
                setDupes(null);
              }}
            >
              It&apos;s a separate payment
            </Button>
          </div>
        </Notice>
      ) : null}

      {props.canConfirm ? (
        <div id="ack" className="rounded-[14px] border border-[#f0d9ad] bg-waiting-tint/60 p-4">
          <Checkbox
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            label="I have checked this payment using our property's external records and confirm this entry is accurate."
          />
          {errors.ack ? <p className="mt-2 text-[13.5px] font-semibold text-error">{errors.ack}</p> : null}
        </div>
      ) : (
        <Notice tone="info">You submit this entry; an authorised manager checks it externally and confirms it. It won&apos;t count until then.</Notice>
      )}

      {props.canConfirm && current && currentAfter && props.periodTotals ? (
        <p className="text-[13.5px] text-muted" aria-live="polite">
          After confirming: {props.unitLabel} becomes{" "}
          <strong className={currentAfter.after <= 0 ? "text-success" : "text-waiting"}>{currentAfter.after <= 0 ? "Paid" : "Partial"}</strong>. {props.periodTotals.label} total{" "}
          {formatAmount(props.periodTotals.settled + currentAfter.applied)} of {formatAmount(props.periodTotals.billed)}.
        </p>
      ) : null}

      <div className="safe-bottom sticky bottom-[58px] -mx-4 flex gap-3 border-t border-line bg-cream px-4 pt-3 md:static md:mx-0 md:border-0 md:p-0">
        <Button type="button" variant="secondary" size="lg" pending={pending === "draft"} pendingLabel="Saving" onClick={() => void save("draft")} className="flex-1">
          Save draft
        </Button>
        <Button type="submit" size="lg" pending={pending === "confirm" || pending === "submit"} pendingLabel="Saving" className="flex-[1.6]">
          {props.canConfirm ? "Save and confirm" : "Submit for confirmation"}
        </Button>
      </div>
    </form>
  );
}
