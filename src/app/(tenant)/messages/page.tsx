import type { Metadata } from "next";
import Link from "next/link";
import { ActivityAvatar } from "@/components/messaging/activity-avatar";
import { PageHeader } from "@/components/shell/page-header";
import { TenantJumps } from "@/components/shell/tenant-jumps";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, EmptyState, cx } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/dates";
import { onlineConversations } from "@/lib/presence-server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  await requireUser("/messages");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_conversations", {});
  const rows = data ?? [];
  const online = await onlineConversations(supabase, rows.map((c) => c.id));
  const unread = rows.reduce((n, c) => n + (c.unread ?? 0), 0);
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-5 pb-10">
      <PageHeader icon="message" title="Messages" meta={rows.length ? (unread ? `${unread} unread` : "All read") : null} />
      <TenantJumps current="/messages" />
      {error ? (
        <p role="alert" className="text-error">Couldn&apos;t load messages. Reload to try again.</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No messages yet" icon="message" action={<ButtonLink href="/search" icon="search">Find a home</ButtonLink>}>
          Message an advertiser from any home.
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-divider overflow-hidden rounded-[18px] border border-line bg-surface">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/messages/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-cool">
                <ActivityAvatar name={c.org_name} online={online.has(c.id)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cx("truncate", c.unread ? "font-bold" : "font-semibold")}>{c.org_name}</span>
                  <span className="flex min-w-0 items-center gap-1 text-[13px] text-muted">
                    <Icon name="home" size={14} className="shrink-0" />
                    <span className="truncate">{c.listing_title ?? c.area}</span>
                    {c.listing_status !== "published" ? <span className="shrink-0 rounded-full bg-error-tint px-1.5 text-[11.5px] font-semibold text-error">Unavailable</span> : null}
                  </span>
                  <span className={cx("mt-0.5 truncate text-[14px]", c.unread ? "text-ink" : "text-muted")}>{c.last_message}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5 self-start">
                  <span className="text-[12px] text-muted">{timeAgo(c.last_message_at)}</span>
                  {c.unread ? (
                    <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-[11.5px] leading-5 font-bold text-white">
                      {c.unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
