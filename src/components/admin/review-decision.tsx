"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewListing } from "@/app/admin/actions";
import { Field, TextArea } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";

// Paid placement never changes these checks: review decides only whether the listing's
// facts are complete and plausible.
export function ReviewDecision({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const decide = (d: "publish" | "needs_correction") =>
    start(async () => {
      const r = await reviewListing(listingId, d, note);
      setMsg(r.ok ? { ok: true, text: d === "publish" ? "Published. The advertiser was notified." : "Sent back with your note." } : { ok: false, text: r.message });
      if (r.ok) router.refresh();
    });
  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-ink bg-surface p-4">
      <h2 className="font-semibold">Decision</h2>
      <Field label="Note to the advertiser" htmlFor="note" hint="Required when sending back. Say exactly what to correct.">
        <TextArea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Field>
      {msg ? <Notice tone={msg.ok ? "success" : "error"} role="status">{msg.text}</Notice> : null}
      <div className="flex gap-2">
        <Button variant="secondary" pending={pending} onClick={() => decide("needs_correction")} className="flex-1">Send back for correction</Button>
        <Button pending={pending} onClick={() => decide("publish")} className="flex-1">Publish</Button>
      </div>
    </section>
  );
}
