"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/primitives";
import { markAllUpdatesRead } from "@/lib/messaging-actions";

export function MarkAllRead({ orgId }: { orgId?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="secondary" icon="check" pending={pending} onClick={() => start(async () => { await markAllUpdatesRead(orgId); router.refresh(); })}>
      Mark all read
    </Button>
  );
}
