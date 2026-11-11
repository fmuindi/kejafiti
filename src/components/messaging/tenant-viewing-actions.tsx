"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { tenantViewingAction } from "@/lib/messaging-actions";
import { TextInput } from "@/components/ui/form";
import { Button, buttonClass, InlineError } from "@/components/ui/primitives";

/** `status` is the viewing state from the database, so a passed time arrives as "expired". */
export function TenantViewingActions({ viewingId, status, conversationId }: { viewingId: string; status: string; conversationId: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "change">(null);
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (action: "accept_proposed" | "change" | "cancel") =>
    start(async () => {
      setError(null);
      const r = await tenantViewingAction(viewingId, action, { localTime: time || undefined });
      if (!r.ok) return setError(r.message);
      setMode(null);
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "new_time_proposed" ? <Button size="sm" icon="check" pending={pending} onClick={() => run("accept_proposed")}>Accept new time</Button> : null}
        <Button size="sm" variant={status === "expired" ? "primary" : "secondary"} icon="calendar" onClick={() => setMode(mode ? null : "change")}>{status === "confirmed" ? "Reschedule" : status === "expired" ? "New time" : "Change time"}</Button>
        {conversationId ? (
          <Link href={`/messages/${conversationId}`} className={buttonClass("secondary", "sm")}>
            <Icon name="message" size={18} /> Message
          </Link>
        ) : null}
        <Button size="sm" variant="quiet" icon="x" pending={pending} onClick={() => run("cancel")}>Cancel</Button>
      </div>
      {mode === "change" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-caption font-semibold">
            New day and time (EAT)
            <TextInput type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <Button size="sm" pending={pending} onClick={() => run("change")}>Send new time</Button>
        </div>
      ) : null}
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}
