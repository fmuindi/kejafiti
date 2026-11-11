"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { getBrowserClient } from "@/lib/supabase/browser";

type Toast = { id: string; title: string; body: string | null; link: string | null };

const SHOWN_MS = 10_000;
const MAX = 3;

/**
 * New updates as they happen: the bell count refreshes, and a pop-up shows the update. Clicking
 * it opens the update the same way as from the Updates page (marks it read, then goes to the
 * item, e.g. the viewing card to accept). Realtime only delivers the person's own rows (RLS).
 */
export function LiveUpdates({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const here = useRef(pathname);
  useEffect(() => {
    here.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const supabase = getBrowserClient();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let cancelled = false;
    const channel = supabase
      .channel(`updates-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, ({ new: n }) => {
        router.refresh();
        const row = n as { id: string; title: string; body: string | null; link: string | null };
        // Already looking at it (e.g. the conversation): the page itself updates instead.
        if (row.link && row.link.split("#")[0] === here.current) return;
        setToasts((t) => [...t.slice(-(MAX - 1)), row]);
        const timer = setTimeout(() => {
          timers.delete(timer);
          setToasts((t) => t.filter((x) => x.id !== row.id));
        }, SHOWN_MS);
        timers.add(timer);
      });
    // Join with the signed-in user's token; without it Realtime applies RLS as anonymous and sends nothing.
    void supabase.realtime.setAuth().then(() => {
      if (!cancelled) channel.subscribe();
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      void supabase.removeChannel(channel);
    };
  }, [userId, router]);

  if (!toasts.length) return null;
  return (
    <div role="status" aria-live="polite" className="no-print fixed inset-x-3 top-3 z-50 flex flex-col gap-2 md:inset-x-auto md:top-[80px] md:right-6 md:w-[380px]">
      {toasts.map((t) => (
        <div key={t.id} className="surface flex items-start gap-3 p-3.5 shadow-overlay">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-pink text-primary" aria-hidden="true">
            <Icon name="bell" size={18} />
          </span>
          {/* A plain link, so a prefetch can never mark the update read. */}
          <a href={`/updates/open/${t.id}`} className="min-w-0 flex-1" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
            <span className="block font-semibold">{t.title}</span>
            {t.body ? <span className="mt-0.5 line-clamp-2 block text-label text-muted">{t.body}</span> : null}
            {t.link ? <span className="link-action mt-1 inline-block text-label">Open</span> : null}
          </a>
          <button type="button" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-cool hover:text-ink">
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
