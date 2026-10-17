import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, EmptyState, PageTitle, cx } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  await requireUser("/messages");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_conversations", {});
  const rows = data ?? [];
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-5 pb-10">
      <PageTitle>Messages</PageTitle>
      {error ? (
        <p role="alert" className="text-error">We couldn&apos;t load your messages. Reload to try again.</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No messages yet" icon="message" action={<ButtonLink href="/search">Find a home</ButtonLink>}>
          Message an advertiser from any listing. Your conversation keeps the listing attached.
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-divider overflow-hidden rounded-[18px] border border-line bg-surface">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/messages/${c.id}`} className="flex flex-col gap-0.5 px-4 py-3.5 hover:bg-cool">
                <span className="flex justify-between gap-3">
                  <span className={cx("truncate", c.unread ? "font-bold" : "font-semibold")}>
                    {c.org_name} · {c.listing_title ?? c.area}
                  </span>
                  <span className="shrink-0 text-[12.5px] text-muted">{timeAgo(c.last_message_at)}</span>
                </span>
                <span className="truncate text-[14px] text-muted">{c.last_message}</span>
                {c.unread ? <span className="text-[12.5px] font-semibold text-primary">{c.unread} new</span> : null}
                {c.listing_status !== "published" ? <span className="text-[12.5px] font-semibold text-error">This home is no longer available</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
