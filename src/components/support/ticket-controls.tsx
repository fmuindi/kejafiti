"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminUpdateTicket } from "@/app/(tenant)/help/actions";
import { Select } from "@/components/ui/form";
import { Button } from "@/components/ui/primitives";

/** Assign, prioritise and change status (IMP-19). Every change is audited in the database. */
export function TicketControls({ ticketId, status, priority, assigned }: { ticketId: string; status: string; priority: string; assigned: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (change: { status?: string; priority?: string; assign_to_me?: boolean }) =>
    start(async () => {
      setError(null);
      const r = await adminUpdateTicket(ticketId, change);
      if (!r.ok) return setError(r.message);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-[14px] bg-cool p-3">
      {!assigned ? <Button size="sm" pending={pending} onClick={() => run({ assign_to_me: true })}>Assign to me</Button> : null}
      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        Priority
        <Select value={priority} onChange={(e) => run({ priority: e.target.value })} className="min-h-10">
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        Status
        <Select value={status} onChange={(e) => run({ status: e.target.value })} className="min-h-10">
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="waiting_on_you">Waiting on requester</option>
          <option value="resolved">Resolved</option>
        </Select>
      </label>
      {error ? <p role="alert" className="w-full text-[13.5px] font-semibold text-error">{error}</p> : null}
    </div>
  );
}
