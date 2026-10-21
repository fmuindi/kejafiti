"use client";

import { useState, useTransition } from "react";
import { draftListingText, type ListingDraft } from "@/app/w/[orgId]/listings/ai-actions";
import { Select, TextArea } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";

// AI-04: draft a title and description from this listing's saved details. A suggestion only:
// Apply puts it in the fields (where it can be edited), Discard drops it.
export function DescribeHelper({ orgId, listingId, onApply }: { orgId: string; listingId: string; onApply: (d: { title: string; description: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [language, setLanguage] = useState<"en" | "sw">("en");
  const [draft, setDraft] = useState<ListingDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button type="button" variant="secondary" icon="edit" onClick={() => setOpen(true)} className="self-start">
        Help me describe this home
      </Button>
    );
  }
  return (
    <section aria-labelledby="describe-help" className="flex flex-col gap-3 rounded-[16px] border border-line bg-cool p-4">
      <h2 id="describe-help" className="font-semibold">Draft a description</h2>
      <p className="-mt-2 text-[13px] text-muted">Written from the details you&apos;ve entered. Costs aren&apos;t repeated in the text; tenants see them in the cost section. Check every sentence before applying.</p>
      <label className="flex flex-col gap-1 text-[14px] font-semibold">
        Anything else tenants should know? <span className="font-normal text-muted">(optional)</span>
        <TextArea rows={2} maxLength={1500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Newly painted, tiled floors, close to the main road" />
      </label>
      <label className="flex max-w-[220px] flex-col gap-1 text-[14px] font-semibold">
        Language
        <Select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "sw")}>
          <option value="en">English</option>
          <option value="sw">Kiswahili</option>
        </Select>
      </label>
      <div className="flex gap-2">
        <Button type="button" pending={pending} pendingLabel="Drafting" onClick={() => start(async () => {
          setError(null);
          const r = await draftListingText(orgId, listingId, { notes, language });
          if (!r.ok) return setError(r.message);
          setDraft(r.draft);
        })}>
          {draft ? "Draft again" : "Draft it"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => { setOpen(false); setDraft(null); }}>Close</Button>
      </div>
      {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
      {draft ? (
        <div className="flex flex-col gap-2 rounded-[12px] border border-line bg-surface p-3" aria-live="polite">
          <p className="text-[12px] font-semibold tracking-[0.4px] text-muted uppercase">Suggested · not saved</p>
          <p className="font-semibold">{draft.title}</p>
          <p className="text-[14.5px] whitespace-pre-line">{draft.description}</p>
          {draft.removed.length ? <p className="text-[13px] text-muted">We removed {draft.removed.length} sentence{draft.removed.length === 1 ? "" : "s"} that stated figures not in your details.</p> : null}
          {draft.questions.length ? (
            <div className="text-[13.5px]">
              <p className="font-semibold">Tenants will want to know:</p>
              <ul className="list-disc pl-5">{draft.questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" onClick={() => { onApply({ title: draft.title, description: draft.description }); setOpen(false); setDraft(null); }}>Apply draft</Button>
            <Button type="button" variant="secondary" onClick={() => setDraft(null)}>Discard</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
