import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowUpControls } from "@/components/messaging/follow-up";
import { Thread, type ThreadMessage } from "@/components/messaging/thread";
import { ViewingResponse } from "@/components/messaging/viewing-response";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/primitives";
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
    <div className="mx-auto flex max-w-[760px] flex-col gap-4">
      <Link href={`/w/${orgId}/enquiries`} className="inline-flex min-h-11 items-center gap-1 self-start font-semibold"><Icon name="chevronLeft" /> Enquiries</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold">{tenant?.full_name || "Tenant"}</h1>
          <Link href={`/homes/${l.ref}`} className="text-[14px] text-muted hover:underline">Unit {l.units?.label} · {l.title}{l.rent_amount ? ` · KES ${formatAmount(Number(l.rent_amount))}` : ""}</Link>
        </div>
        <FollowUpControls conversationId={conversationId} stage={c.follow_up} assigned={c.assigned_membership_id} members={(members ?? []) as Array<{ id: string; display_name: string }>} />
      </div>
      {viewing ? (
        <div className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">Viewing · {formatAppointment(viewing.confirmed_start ?? viewing.proposed_start ?? viewing.requested_start)} EAT</span>
            <StatusBadge tone={STAFF_LABEL[viewing.state]?.tone ?? "neutral"}>{STAFF_LABEL[viewing.state]?.label ?? viewing.state}</StatusBadge>
          </div>
          {viewing.state === "requested" || viewing.state === "expired" ? <ViewingResponse viewingId={viewing.id} expired={viewing.state === "expired"} /> : null}
          {viewing.status === "confirmed" ? <ViewingResponse viewingId={viewing.id} confirmed /> : null}
        </div>
      ) : null}
      <p className="text-[12.5px] text-muted">You&apos;re replying as {ws.org_name}. Calls or WhatsApp chats outside nyumbani won&apos;t appear here.</p>
      <Thread conversationId={conversationId} messages={messages} quickReplies={QUICK} />
    </div>
  );
}
