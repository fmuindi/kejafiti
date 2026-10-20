"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelDelivery, processDueDeliveries, retryDelivery } from "@/app/admin/actions";
import { Button } from "@/components/ui/primitives";

/** Send a failed or held task now, or cancel it. Both are explicit admin decisions. */
export function RetryButton({ taskId, label = "Retry", allowCancel = false }: { taskId: string; label?: string; allowCancel?: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (msg) return <span role="status" className="text-[13px] font-semibold">{msg}</span>;
  const run = (fn: typeof retryDelivery, done: string) =>
    start(async () => {
      const r = await fn(taskId);
      setMsg(r.ok ? done : r.message);
      router.refresh();
    });
  return (
    <span className="flex gap-2">
      <Button size="sm" variant="secondary" pending={pending} onClick={() => run(retryDelivery, "Queued to send")}>{label}</Button>
      {allowCancel ? <Button size="sm" variant="quiet" pending={pending} onClick={() => run(cancelDelivery, "Cancelled")}>Cancel</Button> : null}
    </span>
  );
}

export function ProcessNowButton() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap items-center gap-3">
      <Button size="sm" pending={pending} pendingLabel="Sending" onClick={() => start(async () => { const r = await processDueDeliveries(); setMsg(r.ok ? r.data.summary : r.message); router.refresh(); })}>
        Send due messages now
      </Button>
      {msg ? <span role="status" className="text-[13px] font-semibold">{msg}</span> : null}
    </span>
  );
}
