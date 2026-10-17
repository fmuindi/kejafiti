"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { requestViewing } from "@/lib/messaging-actions";
import { Field, TextArea, TextInput } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";

function minLocal() {
  const d = new Date(Date.now() + 2 * 3600 * 1000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d).replace(" ", "T");
}

// A request is acknowledged immediately but stays "Pending confirmation" until the
// advertiser accepts it. Times are East Africa Time.
export function ViewingRequestForm({ refId, signedIn, initialTime, initialNote }: { refId: string; signedIn: boolean; initialTime: string; initialNote: string }) {
  const router = useRouter();
  const clientRef = useRef<string>(crypto.randomUUID());
  const [time, setTime] = useState(initialTime);
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <Notice tone="waiting" role="status" title="Request sent · pending confirmation">
        The advertiser will accept, suggest another time or decline. This isn&apos;t confirmed yet. You&apos;ll see updates in Viewings and Messages.
        <div className="mt-3"><Button onClick={() => router.push("/viewings")} variant="secondary" size="sm">Go to my viewings</Button></div>
      </Notice>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!time) return setError("Choose a day and time.");
        if (!signedIn) {
          const back = `/homes/${refId}/viewing?time=${encodeURIComponent(time)}&note=${encodeURIComponent(note)}`;
          router.push(`/sign-in?next=${encodeURIComponent(back)}&reason=viewing`);
          return;
        }
        start(async () => {
          setError(null);
          const r = await requestViewing(refId, time, note, clientRef.current);
          if (!r.ok) return setError(r.message);
          setDone(true);
        });
      }}
    >
      <Field label="Preferred day and time (EAT)" htmlFor="time" hint="East Africa Time. The advertiser can suggest another time.">
        <TextInput id="time" type="datetime-local" min={minLocal()} value={time} onChange={(e) => setTime(e.target.value)} aria-describedby="time-hint" />
      </Field>
      <Field label="Note for the advertiser" htmlFor="note" optional>
        <TextArea id="note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <p className="text-[13px] text-muted">Viewings on nyumbani are free. Never pay a deposit or &quot;viewing fee&quot; before seeing the home.</p>
      {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
      <Button type="submit" size="lg" pending={pending} pendingLabel="Sending">{signedIn ? "Send request" : "Continue to sign in"}</Button>
    </form>
  );
}
