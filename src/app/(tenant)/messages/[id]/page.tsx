import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveConversation, PeerStatus } from "@/components/messaging/live";
import { TenantViewingActions } from "@/components/messaging/tenant-viewing-actions";
import { ViewingDirections } from "@/components/tenant/viewing-directions";
import { Thread, type ThreadMessage } from "@/components/messaging/thread";
import { BackLink } from "@/components/shell/back-link";
import { Icon } from "@/components/ui/icon";
import { Avatar, ButtonLink, StatusBadge } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { formatAppointment } from "@/lib/dates";
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
    supabase.from("viewing_states").select("id, state, requested_start, confirmed_start, proposed_start, meeting_instructions").eq("conversation_id", id).in("state", [...OPEN_STATES, "expired"]).maybeSingle(),
  ]);
  const viewing = viewingRow(viewingData);
  // The exact location is handed over only for a confirmed viewing (see viewing_location).
  const { data: loc } = viewing?.state === "confirmed" ? await supabase.rpc("viewing_location", { p_viewing: viewing.id }) : { data: null };
  const place = loc?.[0] ?? null;
  const meta = (list ?? []).find((x) => x.id === id);
  const { data: l } = meta ? await supabase.rpc("get_listing", { p_ref: meta.listing_ref }) : { data: null };
  const listing = l as unknown as { rent_amount?: number; advertiser?: { role: string; call: boolean; phone: string | null } } | null;
  const messages: ThreadMessage[] = (msgs ?? []).map((m) => ({ id: m.id, body: m.body, side: m.sender_side as ThreadMessage["side"], created_at: m.created_at, mine: m.sender_id === user.id }));

  return (
    <LiveConversation conversationId={id} userId={user.id} side="tenant">
    <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-4 pb-6">
      <BackLink href="/messages">Messages</BackLink>
      <div className="flex items-center gap-3">
        <Avatar name={meta?.org_name ?? "?"} size={44} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[1.25rem] font-bold">{meta?.org_name ?? "Conversation"}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-muted">
            {ADVERTISER_ROLE_LABEL[meta?.advertiser_role ?? ""] ?? "Advertiser"}
            <PeerStatus className="before:mr-0.5 before:text-muted before:content-['·']" />
          </p>
        </div>
      </div>
      {meta?.listing_ref ? (
        <Link href={`/homes/${meta.listing_ref}`} className="flex items-center gap-3 rounded-[14px] border border-line bg-surface p-3 hover:border-ink">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-cool text-deep"><Icon name="home" size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{meta.listing_title ?? meta.area}</span>
            <span className="text-[0.8125rem] text-muted">
              {listing?.rent_amount ? `KES ${formatAmount(listing.rent_amount)} / month` : meta.area}
              {meta.listing_status !== "published" ? <span className="font-semibold text-error"> · unavailable</span> : null}
            </span>
          </span>
          <Icon name="chevronRight" size={18} className="text-muted" />
        </Link>
      ) : null}
      {viewing ? (
        <div id="viewing" className="flex scroll-mt-24 flex-col gap-3 rounded-[14px] border border-line bg-surface p-3.5 text-[0.875rem] target:border-primary target:ring-4 target:ring-primary/15">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-semibold"><Icon name="calendar" size={18} className="text-primary" /> {formatAppointment(viewing.confirmed_start ?? viewing.proposed_start ?? viewing.requested_start)}</span>
            <StatusBadge tone={TENANT_LABEL[viewing.state]?.tone ?? "neutral"}>{(TENANT_LABEL[viewing.state]?.label ?? "Pending").split(" · ")[0]}</StatusBadge>
          </div>
          {viewing.state === "confirmed" && viewing.meeting_instructions ? (
            <p className="flex items-start gap-2"><Icon name="info" size={16} className="mt-0.5 shrink-0 text-deep" /> {viewing.meeting_instructions}</p>
          ) : null}
          {place ? (
            <ViewingDirections
              place={{ name: place.property_name, address: place.address, latitude: place.latitude === null ? null : Number(place.latitude), longitude: place.longitude === null ? null : Number(place.longitude) }}
              landmark={place.landmark}
            />
          ) : null}
          <TenantViewingActions viewingId={viewing.id} status={viewing.state} conversationId={null} />
        </div>
      ) : meta?.listing_status === "published" ? (
        <ButtonLink href={`/homes/${meta.listing_ref}/viewing`} variant="secondary" icon="calendar">
          Request a viewing
        </ButtonLink>
      ) : null}
      <Thread userId={user.id} conversationId={id} messages={messages} peerName={meta?.org_name ?? "The advertiser"} />
      {listing?.advertiser?.call && listing.advertiser.phone ? (
        <a href={`tel:${listing.advertiser.phone}`} className="inline-flex items-center justify-center gap-2 self-center text-[0.875rem] font-semibold text-muted hover:text-ink">
          <Icon name="phone" size={16} /> Call instead
        </a>
      ) : null}
    </div>
    </LiveConversation>
  );
}
