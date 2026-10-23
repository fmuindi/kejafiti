"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { replyTicket } from "@/app/(tenant)/help/actions";
import { TextArea } from "@/components/ui/form";
import { Button, cx, InlineError } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/dates";

export type TicketMessage = { id: string; side: string; body: string; created_at: string };

/** The conversation on a support request, for the person and for support (IMP-19). */
export function TicketThread({ ticketId, messages, viewer }: { ticketId: string; messages: TicketMessage[]; viewer: "user" | "support" }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {messages.map((m) =>
          m.side === "system" ? (
            <li key={m.id} className="text-center text-caption text-muted">{m.body} · {formatDateTime(m.created_at)}</li>
          ) : (
            <li key={m.id} className={cx("max-w-[85%] rounded-card px-3 py-2 text-body", m.side === viewer ? "self-end bg-ink text-white" : "self-start border border-line bg-surface")}>
              <p className="text-micro opacity-75">{m.side === "support" ? "nyumbani support" : viewer === "support" ? "Requester" : "You"} · {formatDateTime(m.created_at)}</p>
              <p className="whitespace-pre-line">{m.body}</p>
            </li>
          ),
        )}
      </ol>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await replyTicket(ticketId, body);
            if (!r.ok) return setError(r.message);
            setBody("");
            router.refresh();
          });
        }}
      >
        <label htmlFor="reply" className="text-label font-semibold">{viewer === "support" ? "Reply to the requester" : "Add a reply"}</label>
        <TextArea id="reply" rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
        {error ? <InlineError>{error}</InlineError> : null}
        <Button type="submit" pending={pending} disabled={!body.trim()} className="self-start">Send reply</Button>
      </form>
    </div>
  );
}
