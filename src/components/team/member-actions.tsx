"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { cancelInvitation, resendInvitation, setMemberStatus } from "@/app/w/[orgId]/team/actions";
import { Select } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";

export function MemberActions({
  orgId,
  membershipId,
  status,
  name,
  replacements,
}: {
  orgId: string;
  membershipId: string;
  status: string;
  name: string;
  replacements: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<"suspended" | "removed">("suspended");
  const [reassign, setReassign] = useState(replacements[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (status === "invited") {
    return (
      <>
        <Button
          size="sm"
          variant="secondary"
          pending={pending}
          onClick={() =>
            start(async () => {
              const r = await resendInvitation(orgId, membershipId);
              if (!r.ok) return setError(r.message);
              try {
                await navigator.clipboard.writeText(r.data.link);
                setMsg("New link copied. The old link no longer works.");
              } catch {
                setMsg(`New link: ${r.data.link}`);
              }
              router.refresh();
            })
          }
        >
          Resend
        </Button>
        <Button
          size="sm"
          variant="quiet"
          onClick={() =>
            start(async () => {
              const r = await cancelInvitation(orgId, membershipId);
              if (!r.ok) return setError(r.message);
              router.refresh();
            })
          }
        >
          Cancel
        </Button>
        {msg ? <p role="status" className="w-full text-[0.78125rem] break-all text-success">{msg}</p> : null}
        {error ? <p role="alert" className="w-full text-[0.78125rem] text-error">{error}</p> : null}
      </>
    );
  }

  if (status === "suspended") {
    return (
      <Button
        size="sm"
        variant="secondary"
        pending={pending}
        onClick={() =>
          start(async () => {
            const r = await setMemberStatus(orgId, membershipId, "active");
            if (!r.ok) return setError(r.message);
            router.refresh();
          })
        }
      >
        Reactivate
      </Button>
    );
  }

  return (
    <>
      <Button size="sm" variant="quiet" onClick={() => dialog.current?.showModal()}>
        Suspend or remove
      </Button>
      <dialog ref={dialog} aria-labelledby={`sr-${membershipId}`} className="m-auto w-[min(460px,92vw)] rounded-[22px] bg-surface p-0 backdrop:bg-ink/40">
        <div className="flex flex-col gap-4 p-5">
          <h2 id={`sr-${membershipId}`} className="font-display text-[1.25rem] font-bold">
            Change {name}&apos;s access
          </h2>
          <div className="flex gap-2" role="radiogroup" aria-label="Action">
            {(["suspended", "removed"] as const).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={action === a}
                onClick={() => setAction(a)}
                className={`min-h-11 flex-1 rounded-[12px] border-[1.5px] px-3 text-[0.90625rem] font-semibold ${action === a ? "border-ink bg-ink text-white" : "border-line"}`}
              >
                {a === "suspended" ? "Suspend" : "Remove"}
              </button>
            ))}
          </div>
          <Notice tone="info">
            {action === "suspended"
              ? "Access is blocked immediately, including any open sign-in. You can reactivate later with the same properties and permissions."
              : "Access ends permanently for this workspace. Their history stays in the records; their other accounts are unaffected."}
          </Notice>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.875rem] font-semibold">Move their open drafts and returned entries to</span>
            <Select value={reassign} onChange={(e) => setReassign(e.target.value)}>
              <option value="">Leave unassigned</option>
              {replacements.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </Select>
            <span className="text-[0.78125rem] text-muted">Entries awaiting confirmation stay in the property inbox for any confirmer.</span>
          </label>
          {error ? <p role="alert" className="text-[0.875rem] font-semibold text-error">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => dialog.current?.close()} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              pending={pending}
              onClick={() =>
                start(async () => {
                  const r = await setMemberStatus(orgId, membershipId, action, reassign || undefined);
                  if (!r.ok) return setError(r.message);
                  dialog.current?.close();
                  router.refresh();
                })
              }
            >
              {action === "suspended" ? "Suspend now" : "Remove now"}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
