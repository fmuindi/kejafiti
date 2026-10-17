"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { retryDelivery } from "@/app/admin/actions";
import { Button } from "@/components/ui/primitives";

export function RetryButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (msg) return <span role="status" className="text-[13px] font-semibold">{msg}</span>;
  return (
    <Button size="sm" variant="secondary" pending={pending} onClick={() => start(async () => { const r = await retryDelivery(taskId); setMsg(r.ok ? "Queued again" : r.message); router.refresh(); })}>
      Retry
    </Button>
  );
}
