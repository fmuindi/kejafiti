import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TicketControls } from "@/components/support/ticket-controls";
import { TicketThread } from "@/components/support/ticket-thread";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/primitives";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { SUPPORT_STATUS, categoryLabel } from "@/lib/support";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/shell/back-link";

export const metadata: Metadata = { title: "Support request" };

export default async function AdminTicketPage({ params }: PageProps<"/admin/support/[id]">) {
  const { id } = await params;
  await requirePlatformAdmin("/admin/support");
  const supabase = await createClient();
  const { data: t } = await supabase.from("support_tickets").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();
  const [{ data: messages }, { data: files }, { data: people }] = await Promise.all([
    supabase.from("support_messages").select("id, side, body, created_at").eq("ticket_id", id).order("created_at"),
    supabase.from("support_files").select("id, file_name, storage_path").eq("ticket_id", id),
    supabase.from("profiles").select("id, full_name, email").in("id", [t.user_id, t.assignee_id].filter(Boolean) as string[]),
  ]);
  const signed = files?.length ? (await supabase.storage.from("support-files").createSignedUrls(files.map((f) => f.storage_path), 600)).data ?? [] : [];
  const person = people?.find((p) => p.id === t.user_id);
  const assignee = people?.find((p) => p.id === t.assignee_id);
  return (
    <div className="mx-auto flex max-w-standard flex-col gap-5">
      <BackLink href="/admin/support">Support</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-micro text-muted">{t.ref} · {categoryLabel(t.category)} · opened {formatDateTime(t.created_at)}</p>
          <h1 className="heading-page mt-1">{t.subject}</h1>
          <p className="text-label text-muted">From {person?.full_name || "a user"} ({person?.email}) · {assignee ? `assigned to ${assignee.full_name}` : "unassigned"}</p>
        </div>
        <StatusBadge tone={SUPPORT_STATUS[t.status]?.tone ?? "neutral"}>{SUPPORT_STATUS[t.status]?.label ?? t.status}</StatusBadge>
      </div>
      <TicketControls ticketId={t.id} status={t.status} priority={t.priority} assigned={!!t.assignee_id} />
      <p className="surface whitespace-pre-line p-3 text-body">{t.description}</p>
      {t.context_link ? <p className="text-label text-muted">They were on: <span className="font-mono">{t.context_link}</span> (you can open it only if you have access yourself)</p> : null}
      {signed.length ? (
        <ul className="flex flex-col gap-1 text-label">
          {(files ?? []).map((f, i) => (
            <li key={f.id}><a href={signed[i]?.signedUrl ?? "#"} target="_blank" rel="noreferrer" className="link-action inline-flex items-center gap-1"><Icon name="file" size={16} /> {f.file_name}</a></li>
          ))}
        </ul>
      ) : null}
      <TicketThread ticketId={t.id} messages={messages ?? []} viewer="support" />
    </div>
  );
}
