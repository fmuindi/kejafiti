"use client";

import { useState, useTransition } from "react";
import { saveListingNote } from "@/app/(tenant)/actions";
import { TextArea } from "@/components/ui/form";
import { Button } from "@/components/ui/primitives";

/** Private note on a saved home; only the person who saved it can see it (IMP-12). */
export function CompareNote({ refId, initial }: { refId: string; initial: string }) {
  const [note, setNote] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = `note-${refId}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.84375rem] font-semibold">Your private note</label>
      <TextArea id={id} rows={2} maxLength={500} value={note} onChange={(e) => { setNote(e.target.value); setMsg(null); }} placeholder="Only you can see this" />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" pending={pending} onClick={() => start(async () => { const r = await saveListingNote(refId, note); setMsg(r.ok ? "Saved" : r.message); })}>
          Save note
        </Button>
        {msg ? <span role="status" className="text-[0.8125rem] font-semibold">{msg}</span> : null}
      </div>
    </div>
  );
}
