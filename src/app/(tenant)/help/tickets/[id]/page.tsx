import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TicketThread } from "@/components/support/ticket-thread";
import { Icon } from "@/components/ui/icon";
import { Notice, PageTitle, StatusBadge } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { SUPPORT_STATUS, categoryLabel } from "@/lib/support";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Support request" };

// The requester's view. RLS returns the ticket only to its owner (and platform admins).
export default async function TicketPage({ params, searchParams }: PageProps<"/help/tickets/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/help/tickets/${id}`);
  const supabase = await createClient();
  const { data: t } = await supabase.from("support_tickets").select("id, ref, subject, description, category, status, context_link, created_at").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!t) notFound();
  const [{ data: messages }, { data: files }] = await Promise.all([
    supabase.from("support_messages").select("id, side, body, created_at").eq("ticket_id", id).order("created_at"),
    supabase.from("support_files").select("id, file_name, storage_path").eq("ticket_id", id),
  ]);
  const signed = files?.length ? (await supabase.storage.from("support-files").createSignedUrls(files.map((f) => f.storage_path), 600)).data ?? [] : [];
  const isNew = (await searchParams).new === "1";
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-5 pb-10">
      <Link href="/help" className="inline-flex min-h-11 items-center gap-1 self-start font-semibold"><Icon name="chevronLeft" /> Help and support</Link>
      {isNew ? <Notice tone="success" role="status" title={`Request ${t.ref} sent`}>Support will reply here, and you&apos;ll see it in Updates.</Notice> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[12px] text-muted">{t.ref} · {categoryLabel(t.category)} · opened {formatDateTime(t.created_at)}</p>
          <PageTitle className="mt-1">{t.subject}</PageTitle>
        </div>
        <StatusBadge tone={SUPPORT_STATUS[t.status]?.tone ?? "neutral"}>{SUPPORT_STATUS[t.status]?.label ?? t.status}</StatusBadge>
      </div>
      <p className="whitespace-pre-line rounded-[14px] border border-line bg-surface p-3 text-[14.5px]">{t.description}</p>
      {signed.length ? (
        <ul className="flex flex-col gap-1 text-[14px]">
          {(files ?? []).map((f, i) => (
            <li key={f.id}><a href={signed[i]?.signedUrl ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline"><Icon name="file" size={16} /> {f.file_name}</a></li>
          ))}
        </ul>
      ) : null}
      {t.status === "resolved" ? <p className="text-[13.5px] text-muted">Resolved. Replying reopens the request.</p> : null}
      <TicketThread ticketId={t.id} messages={messages ?? []} viewer="user" />
    </div>
  );
}
