"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { finalizeReport } from "@/app/w/[orgId]/reports/actions";
import { Field, TextArea } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";

export function FinalizeReport({ orgId, propertyId, period, nextVersion }: { orgId: string; propertyId: string; period: string; nextVersion: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [change, setChange] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {msg ? <Notice tone={msg.ok ? "success" : "error"} role="status">{msg.text}</Notice> : null}
        <Button onClick={() => setOpen(true)} className="self-start">{nextVersion > 1 ? `Finalize a revised version (v${nextVersion})` : "Finalize this report"}</Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-[18px] border border-ink bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await finalizeReport(orgId, propertyId, period, notes, change);
          setMsg(r.ok ? { ok: true, text: `Version ${r.data.version} finalized. It won't change, even if records are corrected later.` } : { ok: false, text: r.message });
          if (r.ok) {
            setOpen(false);
            router.refresh();
          }
        });
      }}
    >
      <Field label="Notes for the owner" htmlFor="notes" optional hint="For example follow-up on arrears or units under review.">
        <TextArea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={3} />
      </Field>
      {nextVersion > 1 ? (
        <Field label="What changed since the previous version?" htmlFor="change" hint="Required for a revised version.">
          <TextArea id="change" value={change} onChange={(e) => setChange(e.target.value)} maxLength={1000} rows={2} />
        </Field>
      ) : null}
      {msg && !msg.ok ? <Notice tone="error" role="alert">{msg.text}</Notice> : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" pending={pending}>Finalize v{nextVersion}</Button>
      </div>
    </form>
  );
}
