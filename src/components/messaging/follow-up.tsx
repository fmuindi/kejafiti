"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setFollowUp } from "@/lib/messaging-actions";

// Internal tracking labels only: changing the stage never changes occupancy, listing
// status or viewing appointments.
export function FollowUpControls({ conversationId, stage, assigned, members }: { conversationId: string; stage: string; assigned: string | null; members: Array<{ id: string; display_name: string }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <label className="flex flex-col gap-1 text-[12.5px] text-muted">
        Follow-up (internal)
        <select
          disabled={pending}
          defaultValue={stage}
          onChange={(e) => start(async () => { await setFollowUp(conversationId, e.target.value as "new"); router.refresh(); })}
          className="min-h-10 rounded-[10px] border border-line bg-surface px-2 text-[14px] text-ink"
        >
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="viewing_planned">Viewing planned</option>
          <option value="closed">Closed</option>
        </select>
      </label>
      {members.length ? (
        <label className="flex flex-col gap-1 text-[12.5px] text-muted">
          Assigned to
          <select
            disabled={pending}
            defaultValue={assigned ?? ""}
            onChange={(e) => start(async () => { await setFollowUp(conversationId, null, e.target.value || null); router.refresh(); })}
            className="min-h-10 rounded-[10px] border border-line bg-surface px-2 text-[14px] text-ink"
          >
            <option value="">Nobody</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
        </label>
      ) : null}
    </div>
  );
}
