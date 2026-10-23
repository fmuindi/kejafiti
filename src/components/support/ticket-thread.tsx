"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { replyTicket } from "@/app/(tenant)/help/actions";
import { TextArea } from "@/components/ui/form";
import { Button, cx } from "@/components/ui/primitives";
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
            <li key={m.id} className="text-center text-[0.78125rem] text-muted">{m.body} · {formatDateTime(m.created_at)}</li>
          ) : (
            <li key={m.id} className={cx("max-w-[85%] rounded-[14px] px-3 py-2 text-[0.90625rem]", m.side === viewer ? "self-end bg-ink text-white" : "self-start border border-line bg-surface")}>
              <p className="text-[0.75rem] opacity-75">{m.side === "support" ? "nyumbani support" : viewer === "support" ? "Requester" : "You"} · {formatDateTime(m.created_at)}</p>
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
        <label htmlFor="reply" className="text-[0.875rem] font-semibold">{viewer === "support" ? "Reply to the requester" : "Add a reply"}</label>
        <TextArea id="reply" rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
        {error ? <p role="alert" className="text-[0.84375rem] font-semibold text-error">{error}</p> : null}
        <Button type="submit" pending={pending} disabled={!body.trim()} className="self-start">Send reply</Button>
      </form>
    </div>
  );
}
