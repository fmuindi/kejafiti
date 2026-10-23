"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { respondViewing } from "@/lib/messaging-actions";
import { TextInput } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";

type Action = "accept" | "propose" | "decline" | "cancel" | "attended" | "not_attended" | "unknown";

/**
 * The advertiser's side of a viewing, for each state it can be in:
 * requested → Accept (first), suggest another time, or decline;
 * expired (time passed unanswered) → suggest another time or decline;
 * new_time_proposed → waiting for the tenant; change the suggested time or cancel;
 * confirmed → reschedule, record the outcome, or cancel.
 * Every action notifies the tenant and the rest of the team.
 */
export function ViewingResponse({ viewingId, state }: { viewingId: string; state: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "propose" | "decline" | "cancel">(null);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (action: Action, ignoreConflict = false) =>
    start(async () => {
      setError(null);
      const r = await respondViewing(viewingId, action, { localTime: time || undefined, reason: reason || undefined, ignoreConflict });
      if (!r.ok) return setError(r.message);
      if (r.data.conflict) return setConflict(r.data.conflict);
      setMode(null);
      setConflict(null);
      setTime("");
      setReason("");
      router.refresh();
    });
  const toggle = (m: "propose" | "decline" | "cancel") => setMode(mode === m ? null : m);

  const timeForm = (label: string) => (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-[0.8125rem] font-semibold">
        New day and time (EAT)
        <TextInput type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <Button pending={pending} onClick={() => run("propose")}>{label}</Button>
    </div>
  );
  const reasonForm = (action: "decline" | "cancel", label: string) => (
    <div className="flex flex-wrap items-end gap-2">
      <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason the tenant will see" aria-label={`Reason to ${action}`} className="min-w-0 flex-1" />
      <Button variant="danger" pending={pending} onClick={() => run(action)}>{label}</Button>
    </div>
  );
  const errorLine = error ? <p role="alert" className="text-[0.84375rem] font-semibold text-error">{error}</p> : null;

  if (state === "confirmed") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => toggle("propose")}>Reschedule</Button>
          <Button size="sm" variant="secondary" pending={pending && !mode} onClick={() => run("attended")}>Attended</Button>
          <Button size="sm" variant="secondary" pending={pending && !mode} onClick={() => run("not_attended")}>Didn&apos;t come</Button>
          <Button size="sm" variant="quiet" onClick={() => toggle("cancel")}>Cancel viewing</Button>
        </div>
        {mode === "propose" ? timeForm("Send new time") : null}
        {mode === "cancel" ? reasonForm("cancel", "Cancel viewing") : null}
        {errorLine}
      </div>
    );
  }

  if (state === "new_time_proposed") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[0.875rem] text-muted">Waiting for the tenant to accept the new time. They&apos;ve been notified.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => toggle("propose")}>Change time</Button>
          <Button size="sm" variant="quiet" onClick={() => toggle("cancel")}>Cancel viewing</Button>
        </div>
        {mode === "propose" ? timeForm("Send new time") : null}
        {mode === "cancel" ? reasonForm("cancel", "Cancel viewing") : null}
        {errorLine}
      </div>
    );
  }

  if (state !== "requested" && state !== "expired") return null;
  const expired = state === "expired";
  return (
    <div className="flex flex-col gap-2">
      {conflict ? (
        <Notice tone="waiting" role="alert" title="Possible clash" action={<Button size="sm" variant="dark" pending={pending} onClick={() => run("accept", true)}>Accept anyway</Button>}>{conflict}</Notice>
      ) : null}
      {expired ? (
        <p className="text-[0.875rem] text-muted">The requested time has passed, so it can&apos;t be accepted.</p>
      ) : (
        <p className="text-[0.875rem] text-muted">Accept the time first; the tenant is notified straight away. You can message them about details after.</p>
      )}
      <div className={expired ? "grid grid-cols-2 gap-2" : "grid grid-cols-[1.4fr_1fr_1fr] gap-2"}>
        {expired ? null : <Button pending={pending && !mode} onClick={() => run("accept")}>Accept</Button>}
        <Button variant={expired ? "primary" : "secondary"} onClick={() => toggle("propose")}>{expired ? "Suggest another time" : "Other time"}</Button>
        <Button variant="secondary" onClick={() => toggle("decline")}>Decline</Button>
      </div>
      {mode === "propose" ? timeForm("Send new time") : null}
      {mode === "decline" ? reasonForm("decline", "Decline") : null}
      {errorLine}
    </div>
  );
}
