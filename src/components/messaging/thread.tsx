"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readDraft, removeDraft, writeDraft } from "@/lib/device-drafts";
import { markRead, sendMessage } from "@/lib/messaging-actions";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/components/ui/primitives";
import { formatTime, formatDate } from "@/lib/dates";
import { getBrowserClient } from "@/lib/supabase/browser";

export type ThreadMessage = { id: string; body: string; side: "tenant" | "advertiser" | "system"; created_at: string; mine: boolean };
type Outgoing = { ref: string; body: string; state: "sending" | "queued" | "failed"; at: string };

// The platform thread is the durable record. Outgoing messages show their true state:
// Sending -> Sent, Queued (offline, not sent yet) or Not sent (Retry). Retries reuse the
// same client reference, so a message is never posted twice.
/** `userId`: the signed-in user; the unsent reply is kept on this device for them only. */
export function Thread({ userId, conversationId, messages, quickReplies }: { userId: string; conversationId: string; messages: ThreadMessage[]; quickReplies?: string[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const d = readDraft<string>(userId, "message", { conversation: conversationId });
      // Restoring this user's unsent reply from this device once, on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (d) setDraft(d.data);
    } catch {
      /* ignore */
    }
    void markRead(conversationId);
    // Live updates for this thread only; RLS limits delivery to participants.
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`conv-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => {
        router.refresh();
        void markRead(conversationId);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, userId, router]);

  useEffect(() => {
    try {
      if (draft) writeDraft(userId, "message", { conversation: conversationId }, draft);
      else removeDraft(userId, "message", { conversation: conversationId });
    } catch {
      /* ignore */
    }
  }, [draft, userId, conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, outgoing.length]);

  async function deliver(o: Outgoing) {
    if (!navigator.onLine) {
      setOutgoing((x) => x.map((y) => (y.ref === o.ref ? { ...y, state: "queued" } : y)));
      return;
    }
    setOutgoing((x) => x.map((y) => (y.ref === o.ref ? { ...y, state: "sending" } : y)));
    try {
      const r = await sendMessage(conversationId, o.body, o.ref);
      if (!r.ok) throw new Error(r.message);
      setOutgoing((x) => x.filter((y) => y.ref !== o.ref));
      router.refresh();
    } catch {
      setOutgoing((x) => x.map((y) => (y.ref === o.ref ? { ...y, state: "failed" } : y)));
    }
  }

  // Send queued messages when the connection comes back (event-driven, not render-driven).
  const outgoingRef = useRef(outgoing);
  const deliverRef = useRef(deliver);
  useEffect(() => {
    outgoingRef.current = outgoing;
    deliverRef.current = deliver;
  });
  useEffect(() => {
    const flush = () => {
      for (const o of outgoingRef.current) if (o.state === "queued") void deliverRef.current(o);
    };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    const o: Outgoing = { ref: crypto.randomUUID(), body, state: "sending", at: new Date().toISOString() };
    setOutgoing((x) => [...x, o]);
    setDraft("");
    void deliver(o);
  };

  const dayHeader = messages.map((m, i) => {
    const day = formatDate(m.created_at);
    return i === 0 || formatDate(messages[i - 1].created_at) !== day ? day : null;
  });
  return (
    <div className="flex flex-col gap-3">
      {!online ? (
        <p role="status" className="flex items-center gap-2 rounded-[12px] bg-waiting-tint px-3 py-2 text-[14px] font-semibold text-waiting-strong">
          <Icon name="wifiOff" size={18} /> You&apos;re offline. Messages wait here and send when you reconnect.
        </p>
      ) : null}
      <ol className="flex flex-col gap-2" aria-label="Messages" aria-live="polite">
        {messages.map((m, i) => {
          return (
            <li key={m.id} className="flex flex-col">
              {dayHeader[i] ? <span className="my-2 self-center font-mono text-[11.5px] text-muted uppercase">{dayHeader[i]}</span> : null}
              {m.side === "system" ? (
                <span className="self-center rounded-full bg-cool px-3 py-1.5 text-center text-[13px] text-deep">{m.body}</span>
              ) : (
                <span className={cx("max-w-[82%] rounded-[16px] px-3.5 py-2.5 text-[15px] whitespace-pre-line", m.mine ? "self-end bg-ink text-white" : "self-start border border-line bg-surface")}>
                  {m.body}
                  <span className={cx("mt-1 block text-right text-[11.5px]", m.mine ? "text-white/70" : "text-muted")}>{m.mine ? `Sent ${formatTime(m.created_at)}` : formatTime(m.created_at)}</span>
                </span>
              )}
            </li>
          );
        })}
        {outgoing.map((o) => (
          <li key={o.ref} className="flex flex-col items-end">
            <span className={cx("max-w-[82%] rounded-[16px] px-3.5 py-2.5 text-[15px]", o.state === "failed" ? "border border-error bg-error-tint text-ink" : "bg-ink/70 text-white")}>
              {o.body}
              <span className="mt-1 block text-right text-[11.5px]">
                {o.state === "sending" ? "Sending…" : o.state === "queued" ? "Queued · not sent yet" : "Not sent"}
              </span>
            </span>
            {o.state === "failed" ? (
              <button type="button" onClick={() => void deliver(o)} className="mt-1 text-[13px] font-semibold text-primary underline">Retry</button>
            ) : null}
          </li>
        ))}
      </ol>
      <div ref={endRef} />
      {quickReplies?.length ? (
        <div className="flex flex-wrap gap-2" aria-label="Quick replies">
          <span className="w-full text-[12.5px] text-muted">Quick replies, edited before sending</span>
          {quickReplies.map((q) => (
            <button key={q} type="button" onClick={() => setDraft(q)} className="min-h-10 rounded-full border-[1.5px] border-line bg-surface px-3.5 text-[13.5px] font-semibold">{q.split(".")[0]}</button>
          ))}
        </div>
      ) : null}
      <form
        className="safe-bottom sticky bottom-[58px] flex items-end gap-2 border-t border-line bg-cream pt-3 md:bottom-0"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor="composer" className="sr-only">Message</label>
        <textarea
          id="composer"
          rows={1}
          value={draft}
          maxLength={4000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Write a message"
          className="max-h-40 min-h-[50px] flex-1 resize-y rounded-[14px] border border-input bg-surface px-3.5 py-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-deep/40"
        />
        <button type="submit" aria-label="Send message" className="grid size-[50px] shrink-0 place-items-center rounded-[14px] bg-primary text-white hover:bg-primary-hover disabled:opacity-50" disabled={!draft.trim()}>
          <Icon name="arrowRight" />
        </button>
      </form>
    </div>
  );
}
