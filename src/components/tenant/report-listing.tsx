"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { reportListing } from "@/app/(tenant)/actions";
import { Icon } from "@/components/ui/icon";
import { Button, Notice, InlineError } from "@/components/ui/primitives";

const REASONS = [
  ["unavailable", "It's no longer available"],
  ["wrong_price", "The price or charges are wrong"],
  ["inaccurate_location", "The location is wrong"],
  ["misleading_media", "Photos are misleading"],
  ["duplicate", "It's a duplicate"],
  ["suspicious_payment_request", "Someone asked for payment before a viewing"],
  ["other", "Something else"],
] as const;

export function ReportListing({ refId, signedIn }: { refId: string; signedIn: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(reportListing.bind(null, refId), null);

  if (!signedIn) {
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(`/homes/${refId}`)}&reason=report`} className="link-action inline-flex min-h-11 items-center gap-1.5 text-label">
        <Icon name="flag" size={16} /> Report a problem with this listing
      </Link>
    );
  }
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="link-action inline-flex min-h-11 items-center gap-1.5 self-start text-label">
        <Icon name="flag" size={16} /> Report a problem with this listing
      </button>
      <dialog ref={ref} aria-labelledby="report-title" className="m-auto w-[min(440px,92vw)] rounded-panel bg-surface p-0 backdrop:bg-ink/40">
        <div className="flex flex-col gap-4 p-5">
          <h2 id="report-title" className="heading-section">
            Report a problem
          </h2>
          {state?.ok ? (
            <>
              <Notice tone="success" role="status" title="Thanks, we've got your report.">
                Our team reviews reports and may contact the advertiser. You can keep browsing.
              </Notice>
              <Button variant="secondary" onClick={() => ref.current?.close()}>
                Close
              </Button>
            </>
          ) : (
            <form action={action} className="flex flex-col gap-3">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-label font-semibold">What&apos;s wrong?</legend>
                {REASONS.map(([value, label]) => (
                  <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line px-3">
                    <input type="radio" name="reason" value={value} className="size-5 accent-primary" required />
                    <span className="text-body">{label}</span>
                  </label>
                ))}
              </fieldset>
              <label className="flex flex-col gap-1.5">
                <span className="text-label font-semibold">
                  Details <span className="font-normal text-muted">(optional)</span>
                </span>
                <textarea name="details" maxLength={2000} className="min-h-[90px] rounded-control border border-input p-3" />
              </label>
              {state && !state.ok ? (
                <InlineError>
                  {state.message}
                </InlineError>
              ) : null}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => ref.current?.close()} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" pending={pending} pendingLabel="Sending" className="flex-1">
                  Send report
                </Button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
