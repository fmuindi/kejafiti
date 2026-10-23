import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowUpControls } from "@/components/messaging/follow-up";
import { LiveConversation, PeerStatus } from "@/components/messaging/live";
import { Thread, type ThreadMessage } from "@/components/messaging/thread";
import { BackLink } from "@/components/shell/back-link";
import { ViewingResponse } from "@/components/messaging/viewing-response";
import { Avatar, StatusBadge } from "@/components/ui/primitives";
import { getSessionUser, requireWorkspace } from "@/lib/auth";
import { formatAppointment } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { STAFF_LABEL, viewingRow } from "@/lib/viewings";

export const metadata: Metadata = { title: "Enquiry" };

const QUICK = [
  "Still available. When would you like to view it?",
  "Suggest a viewing: I can show it on Saturday morning. Does 10:00 AM work?",
  "Now let. Thank you for your interest; this home is no longer available.",
];

export default async function EnquiryPage({ params }: PageProps<"/w/[orgId]/enquiries/[conversationId]">) {
  const { orgId, conversationId } = await params;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/enquiries/${conversationId}`);
  const user = await getSessionUser();
  const supabase = await createClient();
  const { data: c } = await supabase.from("conversations").select("id, org_id, follow_up, assigned_membership_id, tenant_id, listing_id, listings(ref, title, rent_amount, status, units(label))").eq("id", conversationId).eq("org_id", orgId).maybeSingle();
  if (!c) notFound();
  const [{ data: msgs }, { data: tenant }, { data: viewingData }, { data: members }] = await Promise.all([
    supabase.from("messages").select("id, body, sender_side, sender_id, created_at").eq("conversation_id", conversationId).order("created_at"),
    supabase.from("profiles").select("full_name").eq("id", c.tenant_id).maybeSingle(),
    supabase.from("viewing_states").select("id, status, state, requested_start, proposed_start, confirmed_start").eq("conversation_id", conversationId).in("status", ["requested", "new_time_proposed", "confirmed"]).maybeSingle(),
    ws.role === "owner" || ws.role === "agency_admin" ? supabase.from("memberships").select("id, display_name").eq("org_id", orgId).eq("status", "active") : Promise.resolve({ data: [] }),
  ]);
  const viewing = viewingRow(viewingData);
  const l = c.listings as unknown as { ref: string; title: string | null; rent_amount: number | null; status: string; units: { label: string } | null };
  // Messages from any team member show on the advertiser side of the thread.
  const messages: ThreadMessage[] = (msgs ?? []).map((m) => ({ id: m.id, body: m.body, side: m.sender_side as ThreadMessage["side"], created_at: m.created_at, mine: m.sender_side === "advertiser" || m.sender_id === user?.id }));

  return (
    <LiveConversation conversationId={conversationId} userId={user?.id ?? ""} side="advertiser">
    <div className="mx-auto flex max-w-reading flex-col gap-5">
      <BackLink href={`/w/${orgId}/enquiries`}>Enquiries</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={tenant?.full_name || "Tenant"} size={48} />
          <div className="min-w-0">
            <h1 className="heading-compact truncate">{tenant?.full_name || "Tenant"}</h1>
            <div><PeerStatus /></div>
            <Link href={`/homes/${l.ref}`} className="text-label text-muted block hover:underline">Unit {l.units?.label} · {l.title}{l.rent_amount ? ` · KES ${formatAmount(Number(l.rent_amount))}` : ""}</Link>
          </div>
        </div>
        <FollowUpControls conversationId={conversationId} stage={c.follow_up} assigned={c.assigned_membership_id} members={(members ?? []) as Array<{ id: string; display_name: string }>} />
      </div>
      {viewing ? (
        <div id="viewing" className="surface flex scroll-mt-24 flex-col gap-3 p-4 target:border-primary target:ring-4 target:ring-primary/15">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">Viewing · {formatAppointment(viewing.confirmed_start ?? viewing.proposed_start ?? viewing.requested_start)} EAT</span>
            <StatusBadge tone={STAFF_LABEL[viewing.state]?.tone ?? "neutral"}>{STAFF_LABEL[viewing.state]?.label ?? viewing.state}</StatusBadge>
          </div>
          <ViewingResponse viewingId={viewing.id} state={viewing.state} />
        </div>
      ) : null}
      <p className="text-caption text-muted">You&apos;re replying as {ws.org_name}. Calls or WhatsApp chats outside nyumbani won&apos;t appear here.</p>
      <Thread userId={user?.id ?? ""} conversationId={conversationId} messages={messages} quickReplies={QUICK} peerName={tenant?.full_name || "The tenant"} />
    </div>
    </LiveConversation>
  );
}
