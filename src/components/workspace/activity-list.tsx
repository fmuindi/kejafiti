"use client";

import Link from "next/link";
import { useEffect } from "react";
import { markNotificationsRead } from "@/lib/messaging-actions";
import { cx } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/dates";

type Item = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

// The in-app activity centre is the reference record for every alert. Opening a link shows
// the record's current state, not the text of the old notification.
export function ActivityList({ items }: { items: Item[] }) {
  useEffect(() => {
    const unread = items.filter((i) => !i.read_at).map((i) => i.id);
    if (unread.length) {
      const t = setTimeout(() => void markNotificationsRead(unread), 1500);
      return () => clearTimeout(t);
    }
  }, [items]);
  if (items.length === 0) return <p className="rounded-[14px] border border-dashed border-line bg-surface p-4 text-[14px] text-muted">Nothing yet.</p>;
  return (
    <ul className="flex flex-col divide-y divide-divider overflow-hidden rounded-[16px] border border-line bg-surface">
      {items.map((n) => {
        const inner = (
          <>
            <span className="flex justify-between gap-3">
              <span className={cx(n.read_at ? "font-semibold" : "font-bold")}>
                {!n.read_at ? <span className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle" aria-label="Unread" /> : null}
                {n.title}
              </span>
              <span className="shrink-0 text-[12.5px] text-muted">{timeAgo(n.created_at)}</span>
            </span>
            {n.body ? <span className="text-[13.5px] text-muted">{n.body}</span> : null}
          </>
        );
        return (
          <li key={n.id}>
            {n.link ? <Link href={n.link} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-cool">{inner}</Link> : <div className="flex flex-col gap-0.5 px-4 py-3">{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}
