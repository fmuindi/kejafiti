"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { cx } from "@/components/ui/primitives";
import { getBrowserClient } from "@/lib/supabase/browser";
import { peerLabel, type PeerState } from "@/lib/presence";

// Online, typing and last active for one conversation. Presence and typing go over a private
// Realtime channel that only the conversation's participants can join (see the
// conversation_presence migration). Nothing typed is sent, only that someone is typing.

type Side = "tenant" | "advertiser";
type Live = { peer: PeerState; typing: () => void; stoppedTyping: () => void };

const LiveContext = createContext<Live | null>(null);

/** Null outside a LiveConversation, so the thread also works without it. */
export const useLiveConversation = () => useContext(LiveContext);

/** Send "typing" at most this often while keys are pressed. */
const TYPING_EVERY_MS = 2500;
/** Stop showing "Typing…" if no word arrives for this long (a closed tab sends no "stopped"). */
const TYPING_SHOWN_MS = 5000;
const ACTIVITY_REFRESH_MS = 60_000;

export function LiveConversation({ conversationId, userId, side, children }: { conversationId: string; userId: string; side: Side; children: ReactNode }) {
  const [here, setHere] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [lastActive, setLastActive] = useState<string | null>(null);
  const channel = useRef<RealtimeChannel | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    const supabase = getBrowserClient();
    let cancelled = false;
    let wasHere = false;
    let typingTimer: ReturnType<typeof setTimeout> | undefined;

    const loadActivity = async () => {
      const { data } = await supabase.rpc("conversation_activity", { p_ids: [conversationId] });
      if (!cancelled && data?.[0]) setLastActive(data[0].last_active_at);
    };
    void loadActivity();
    const refresh = setInterval(loadActivity, ACTIVITY_REFRESH_MS);

    const ch = supabase.channel(`conv:${conversationId}`, { config: { private: true, presence: { key: userId } } });
    channel.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const others = Object.values(ch.presenceState<{ side: Side }>()).flat().some((p) => p.side !== side);
      // The moment they leave is their last activity.
      if (wasHere && !others) setLastActive(new Date().toISOString());
      wasHere = others;
      setHere(others);
    }).on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload?.side === side) return;
      clearTimeout(typingTimer);
      setPeerTyping(!!payload?.typing);
      if (payload?.typing) typingTimer = setTimeout(() => setPeerTyping(false), TYPING_SHOWN_MS);
    });

    // Present only while the page is in view, so "Online" means they can see your reply.
    const announce = () => {
      if (ch.state !== "joined") return;
      if (document.visibilityState === "visible") void ch.track({ side });
      else void ch.untrack();
    };
    void supabase.realtime.setAuth().then(() => {
      if (!cancelled) ch.subscribe((status) => status === "SUBSCRIBED" && announce());
    });
    document.addEventListener("visibilitychange", announce);

    return () => {
      cancelled = true;
      clearInterval(refresh);
      clearTimeout(typingTimer);
      document.removeEventListener("visibilitychange", announce);
      channel.current = null;
      void supabase.removeChannel(ch);
    };
  }, [conversationId, userId, side]);

  const say = (typing: boolean) => {
    const ch = channel.current;
    if (ch?.state === "joined") void ch.send({ type: "broadcast", event: "typing", payload: { side, typing } });
  };
  const value: Live = {
    peer: { typing: peerTyping, here, lastActive },
    typing: () => {
      const t = Date.now();
      if (t - lastSent.current < TYPING_EVERY_MS) return;
      lastSent.current = t;
      say(true);
    },
    stoppedTyping: () => {
      if (!lastSent.current) return;
      lastSent.current = 0;
      say(false);
    },
  };
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/** "Online", "Typing…" or "Active 5 min ago", next to the other side's name. */
export function PeerStatus({ className }: { className?: string }) {
  const live = useLiveConversation();
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  const label = live && now ? peerLabel(live.peer, now) : null;
  if (!label) return null;
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-caption", label.tone === "away" ? "text-muted" : "font-semibold text-success", className)}>
      {label.tone !== "away" ? <span aria-hidden="true" className="size-2 rounded-full bg-success" /> : null}
      {label.text}
    </span>
  );
}

/** The "…" bubble at the end of the thread while the other side is typing. */
export function TypingBubble({ name }: { name: string }) {
  const live = useLiveConversation();
  if (!live?.peer.typing) return null;
  return (
    <li className="flex flex-col">
      <span className="surface flex items-center gap-1 self-start px-3.5 py-3" aria-label={`${name} is typing`}>
        {[0, 150, 300].map((d) => (
          <span key={d} aria-hidden="true" className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
    </li>
  );
}
