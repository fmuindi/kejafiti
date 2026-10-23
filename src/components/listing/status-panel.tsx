"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setListingStatus } from "@/app/w/[orgId]/listings/actions";
import { StillAvailableButton } from "@/components/workspace/still-available";
import { TextInput } from "@/components/ui/form";
import { Button, Notice, StatusBadge } from "@/components/ui/primitives";
import { formatDate, todayEAT } from "@/lib/dates";

const LABEL: Record<string, { text: string; tone: "success" | "waiting" | "error" | "neutral" }> = {
  under_review: { text: "Under review", tone: "waiting" },
  published: { text: "Published", tone: "success" },
  paused: { text: "Paused", tone: "neutral" },
  needs_correction: { text: "Needs correction", tone: "error" },
  let: { text: "Let", tone: "neutral" },
  withdrawn: { text: "Withdrawn", tone: "neutral" },
};

// Publication status is separate from occupancy: pausing or withdrawing a listing never
// changes rent records, and marking it let doesn't create a tenancy.
export function ListingStatusPanel({ orgId, listingId, status, refId, confirmedAt, reviewNote }: { orgId: string; listingId: string; status: string; refId: string; confirmedAt: string | null; reviewNote: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [letDate, setLetDate] = useState(todayEAT());
  const [confirmLet, setConfirmLet] = useState(false);
  const s = LABEL[status] ?? { text: status, tone: "neutral" as const };
  const act = (a: "pause" | "resume" | "withdraw" | "mark_let") =>
    start(async () => {
      setError(null);
      const r = await setListingStatus(orgId, listingId, a, a === "mark_let" ? letDate : undefined);
      if (!r.ok) setError(r.message);
      setConfirmLet(false);
      router.refresh();
    });
  return (
    <section aria-label="Listing status" className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge tone={s.tone}>{s.text}</StatusBadge>
          <span className="font-mono text-[0.8125rem] text-muted">{refId}</span>
        </div>
        {status === "published" ? <Link href={`/homes/${refId}`} className="text-[0.875rem] font-semibold text-primary underline">View as tenant</Link> : null}
      </div>
      {status === "published" ? <p className="text-[0.84375rem] text-muted">Availability last confirmed {formatDate(confirmedAt)}.</p> : null}
      {status === "needs_correction" && reviewNote ? <Notice tone="waiting">&quot;{reviewNote}&quot;</Notice> : null}
      {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        {status === "published" ? (
          <>
            <StillAvailableButton orgId={orgId} listingIds={[listingId]} />
            <Button size="sm" variant="secondary" pending={pending} onClick={() => act("pause")}>Pause listing</Button>
          </>
        ) : null}
        {status === "paused" ? <Button size="sm" pending={pending} onClick={() => act("resume")}>Resume (confirms it&apos;s available)</Button> : null}
        {["published", "paused", "under_review", "needs_correction"].includes(status) ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => setConfirmLet(true)}>Mark as let</Button>
            <Button size="sm" variant="quiet" pending={pending} onClick={() => act("withdraw")}>Withdraw</Button>
          </>
        ) : null}
      </div>
      {confirmLet ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-cool p-3">
          <p className="text-[0.875rem]">Marking it let removes it from search and cancels open viewing requests (tenants are told). It doesn&apos;t create a tenancy in rent records.</p>
          <label className="flex flex-col gap-1 text-[0.84375rem] font-semibold">
            Let on
            <TextInput type="date" value={letDate} max={todayEAT()} onChange={(e) => setLetDate(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setConfirmLet(false)}>Cancel</Button>
            <Button size="sm" variant="dark" pending={pending} onClick={() => act("mark_let")}>Mark as let</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
