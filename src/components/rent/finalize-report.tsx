"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { finalizeReport, type Commentary } from "@/app/w/[orgId]/reports/actions";
import { Field, TextArea } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";
import { formatDateTime, formatPeriod } from "@/lib/dates";
import { formatAmount } from "@/lib/money";

export type PreFinalize = {
  cut_off: string;
  pending_count: number;
  pending_amount: number;
  corrections: number;
  records_changed_at: string | null;
  previous_version: number | null;
  previous_finalized_at: string | null;
};

// Finalizing freezes a version. The person first writes the commentary, then reviews
// exactly what will be frozen (IMP-18) and confirms. Their authority is enough: no
// second approval.
export function FinalizeReport({ orgId, propertyId, propertyName, period, nextVersion, review }: { orgId: string; propertyId: string; propertyName: string; period: string; nextVersion: number; review: PreFinalize }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [c, setC] = useState<Commentary>({ changes: "", issues: "", next_actions: "" });
  const [change, setChange] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof Commentary) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setC({ ...c, [k]: e.target.value });
    setReviewing(false);
  };
  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {msg ? <Notice tone={msg.ok ? "success" : "error"} role="status">{msg.text}</Notice> : null}
        <Button onClick={() => setOpen(true)} className="self-start">{nextVersion > 1 ? `Prepare a revised version (v${nextVersion})` : "Prepare to finalize"}</Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-[18px] border border-ink bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reviewing) {
          setReviewing(true);
          return;
        }
        start(async () => {
          const r = await finalizeReport(orgId, propertyId, period, c, change);
          setMsg(r.ok ? { ok: true, text: `Version ${r.data.version} finalized. It won't change, even if records are corrected later.` } : { ok: false, text: r.message });
          setReviewing(false);
          if (r.ok) {
            setOpen(false);
            router.refresh();
          }
        });
      }}
    >
      <h2 className="font-display text-[18px] font-bold">Manager&apos;s commentary</h2>
      <p className="-mt-2 text-[13px] text-muted">Saved inside v{nextVersion}. It won&apos;t change after finalizing.</p>
      <Field label="What changed this month" htmlFor="c_changes" optional>
        <TextArea id="c_changes" value={c.changes} onChange={set("changes")} maxLength={1500} rows={2} />
      </Field>
      <Field label="Unresolved issues" htmlFor="c_issues" optional hint="For example arrears being followed up or units under review.">
        <TextArea id="c_issues" value={c.issues} onChange={set("issues")} maxLength={1500} rows={2} />
      </Field>
      <Field label="Next actions" htmlFor="c_next" optional>
        <TextArea id="c_next" value={c.next_actions} onChange={set("next_actions")} maxLength={1500} rows={2} />
      </Field>
      {nextVersion > 1 ? (
        <Field label="Why a new version? What changed since the previous one?" htmlFor="change" hint="Required for a revised version.">
          <TextArea id="change" value={change} onChange={(e) => { setChange(e.target.value); setReviewing(false); }} maxLength={1000} rows={2} />
        </Field>
      ) : null}
      {reviewing ? (
        <section aria-labelledby="freeze" className="rounded-[14px] border-[1.5px] border-ink p-3 text-[14px]">
          <h3 id="freeze" className="font-semibold">You are about to freeze</h3>
          <ul className="mt-1 flex flex-col gap-0.5">
            <li>{propertyName} · {formatPeriod(period)} · version {nextVersion}</li>
            <li>Figures as of {formatDateTime(review.cut_off)} (records last changed {review.records_changed_at ? formatDateTime(review.records_changed_at) : "never"})</li>
            <li className={review.pending_count ? "font-semibold text-waiting-strong" : ""}>
              {review.pending_count ? `${review.pending_count} entr${review.pending_count === 1 ? "y" : "ies"} (KSh ${formatAmount(review.pending_amount)}) still awaiting confirmation: not included` : "No entries awaiting confirmation"}
            </li>
            <li>{review.corrections ? `${review.corrections} correction${review.corrections === 1 ? "" : "s"} posted to this period` : "No corrections posted to this period"}</li>
            {review.previous_version ? <li>Replaces nothing: v{review.previous_version} (finalized {formatDateTime(review.previous_finalized_at)}) stays as it was</li> : null}
          </ul>
        </section>
      ) : null}
      {msg && !msg.ok ? <Notice tone="error" role="alert">{msg.text}</Notice> : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => (reviewing ? setReviewing(false) : setOpen(false))}>{reviewing ? "Change" : "Cancel"}</Button>
        <Button type="submit" pending={pending}>{reviewing ? `Finalize v${nextVersion}` : "Review before finalizing"}</Button>
      </div>
    </form>
  );
}
