"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { respondViewing } from "@/lib/messaging-actions";
import { TextInput } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";

export function ViewingResponse({ viewingId, confirmed = false }: { viewingId: string; confirmed?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "propose" | "decline" | "cancel">(null);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (action: "accept" | "propose" | "decline" | "cancel" | "attended" | "not_attended" | "unknown", ignoreConflict = false) =>
    start(async () => {
      setError(null);
      const r = await respondViewing(viewingId, action, { localTime: time || undefined, reason: reason || undefined, ignoreConflict });
      if (!r.ok) return setError(r.message);
      if (r.data.conflict) return setConflict(r.data.conflict);
      setMode(null);
      setConflict(null);
      router.refresh();
    });

  if (confirmed) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" pending={pending} onClick={() => run("attended")}>Attended</Button>
        <Button size="sm" variant="secondary" pending={pending} onClick={() => run("not_attended")}>Didn&apos;t come</Button>
        <Button size="sm" variant="quiet" onClick={() => setMode("cancel")}>Cancel</Button>
        {mode === "cancel" ? (
          <div className="flex w-full flex-wrap items-end gap-2">
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason the tenant will see" aria-label="Reason" className="min-w-0 flex-1" />
            <Button size="sm" variant="danger" pending={pending} onClick={() => run("cancel")}>Cancel viewing</Button>
          </div>
        ) : null}
        {error ? <p role="alert" className="w-full text-[13.5px] font-semibold text-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {conflict ? (
        <Notice tone="waiting" role="alert" title="Possible clash" action={<Button size="sm" variant="dark" pending={pending} onClick={() => run("accept", true)}>Accept anyway</Button>}>{conflict}</Notice>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <Button pending={pending && !mode} onClick={() => run("accept")}>Accept</Button>
        <Button variant="secondary" onClick={() => setMode(mode === "propose" ? null : "propose")}>Other time</Button>
        <Button variant="secondary" onClick={() => setMode(mode === "decline" ? null : "decline")}>Decline</Button>
      </div>
      {mode === "propose" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[13px] font-semibold">New day and time (EAT)<TextInput type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          <Button pending={pending} onClick={() => run("propose")}>Send new time</Button>
        </div>
      ) : null}
      {mode === "decline" ? (
        <div className="flex flex-wrap items-end gap-2">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason the tenant will see" aria-label="Reason for declining" className="min-w-0 flex-1" />
          <Button variant="danger" pending={pending} onClick={() => run("decline")}>Decline</Button>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-[13.5px] font-semibold text-error">{error}</p> : null}
    </div>
  );
}
