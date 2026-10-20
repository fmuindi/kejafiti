import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Thread, type ThreadMessage } from "@/components/messaging/thread";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, StatusBadge } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { formatAppointment, formatDateTime } from "@/lib/dates";
import { ADVERTISER_ROLE_LABEL } from "@/lib/listing/catalog";
import { formatAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STATES, TENANT_LABEL, viewingRow } from "@/lib/viewings";

export const metadata: Metadata = { title: "Conversation" };

export default async function TenantThreadPage({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/messages/${id}`);
  const supabase = await createClient();
  const { data: c } = await supabase.from("conversations").select("id, tenant_id, listing_id").eq("id", id).maybeSingle();
  if (!c || c.tenant_id !== user.id) notFound();
  const [{ data: list }, { data: msgs }, { data: viewingData }] = await Promise.all([
    supabase.rpc("my_conversations", {}),
    supabase.from("messages").select("id, body, sender_side, sender_id, created_at").eq("conversation_id", id).order("created_at"),
    supabase.from("viewing_states").select("id, state, requested_start, confirmed_start, proposed_start").eq("conversation_id", id).in("state", [...OPEN_STATES, "expired"]).maybeSingle(),
  ]);
  const viewing = viewingRow(viewingData);
  const meta = (list ?? []).find((x) => x.id === id);
  const { data: l } = meta ? await supabase.rpc("get_listing", { p_ref: meta.listing_ref }) : { data: null };
  const listing = l as unknown as { rent_amount?: number; advertiser?: { role: string; call: boolean; phone: string | null } } | null;
  const messages: ThreadMessage[] = (msgs ?? []).map((m) => ({ id: m.id, body: m.body, side: m.sender_side as ThreadMessage["side"], created_at: m.created_at, mine: m.sender_id === user.id }));

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-4 pb-6">
      <div className="flex items-center gap-2">
        <Link href="/messages" aria-label="Back to messages" className="grid size-11 place-items-center rounded-full hover:bg-cool">
          <Icon name="chevronLeft" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-semibold">{meta?.org_name ?? "Conversation"}</h1>
          <p className="text-[13px] text-muted">{ADVERTISER_ROLE_LABEL[meta?.advertiser_role ?? ""] ?? "Advertiser"}</p>
        </div>
      </div>
      {meta?.listing_ref ? (
        <Link href={`/homes/${meta.listing_ref}`} className="rounded-[14px] border border-line bg-surface p-3 hover:border-ink">
          <span className="block font-semibold">
            {meta.listing_title ?? meta.area}
            {listing?.rent_amount ? ` · KES ${formatAmount(listing.rent_amount)}` : ""}
          </span>
          <span className="text-[12.5px] text-muted">
            As of {formatDateTime(new Date().toISOString())} · may have changed{meta.listing_status !== "published" ? " · no longer available" : ""}
          </span>
        </Link>
      ) : null}
      {viewing ? (
        <div className="flex items-center justify-between gap-3 rounded-[14px] bg-cool p-3 text-[14px]">
          <span>Viewing · {formatAppointment(viewing.confirmed_start ?? viewing.proposed_start ?? viewing.requested_start)} EAT</span>
          <StatusBadge tone={TENANT_LABEL[viewing.state]?.tone ?? "neutral"}>{TENANT_LABEL[viewing.state]?.label ?? "Pending"}</StatusBadge>
        </div>
      ) : meta?.listing_status === "published" ? (
        <ButtonLink href={`/homes/${meta.listing_ref}/viewing`} variant="secondary">
          Request a viewing
        </ButtonLink>
      ) : null}
      <Thread userId={user.id} conversationId={id} messages={messages} />
      {listing?.advertiser?.call && listing.advertiser.phone ? (
        <a href={`tel:${listing.advertiser.phone}`} className="text-center text-[14px] font-semibold underline">
          Call instead (outside nyumbani)
        </a>
      ) : null}
    </div>
  );
}
