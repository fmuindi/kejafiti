import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityAvatar } from "@/components/messaging/activity-avatar";
import { ViewingResponse } from "@/components/messaging/viewing-response";
import { EmptyState, StatusBadge, cx } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth";
import { formatAppointment, timeAgo } from "@/lib/dates";
import { onlineConversations } from "@/lib/presence-server";
import { createClient } from "@/lib/supabase/server";
import { STAFF_LABEL, viewingRows } from "@/lib/viewings";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Enquiries" };

const STAGE: Record<string, string> = { new: "New", contacted: "Contacted", viewing_planned: "Viewing planned", closed: "Closed" };

export default async function EnquiriesPage({ params, searchParams }: PageProps<"/w/[orgId]/enquiries">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/enquiries`);
  if (!ws.can_manage_listings) notFound();
  const tab = sp.tab === "viewings" ? "viewings" : sp.tab === "all" ? "all" : "reply";
  const supabase = await createClient();
  const [{ data: convs }, { data: requestData }, { data: members }] = await Promise.all([
    supabase.rpc("my_conversations", { p_org: orgId }),
    supabase.from("viewing_states").select("id, status, state, requested_start, proposed_start, tenant_note, created_at, tenant_id, listing_id, listings(ref, title, units(label))").eq("org_id", orgId).in("status", ["requested", "new_time_proposed"]).order("requested_start"),
    supabase.from("memberships").select("id, display_name, user_id").eq("org_id", orgId).eq("status", "active"),
  ]);
  const requests = viewingRows(requestData);
  const rows = (convs ?? []).filter((c) => (tab === "reply" ? c.needs_reply && c.follow_up !== "closed" : tab === "all" ? true : false));
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) grouped.set(`${r.area} · ${r.listing_title ?? ""}`, [...(grouped.get(`${r.area} · ${r.listing_title ?? ""}`) ?? []), r]);
  const online = await onlineConversations(supabase, rows.map((c) => c.id));
  const memberName = new Map((members ?? []).map((m) => [m.id, m.display_name]));
  const needCount = (convs ?? []).filter((c) => c.needs_reply && c.follow_up !== "closed").length;

  return (
    <div className="mx-auto flex max-w-standard flex-col gap-5">
      <PageHeader icon="message" title="Enquiries" meta={needCount ? `${needCount} need a reply` : "All answered"} />
      <nav aria-label="Enquiry views" className="flex gap-2 border-b border-line">
        {[["reply", `Reply needed ${needCount}`], ["viewings", `Viewings ${(requests ?? []).length}`], ["all", "All"]].map(([k, label]) => (
          <Link key={k} href={`/w/${orgId}/enquiries?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cx("-mb-px border-b-2 px-3 py-2.5 text-body font-semibold", tab === k ? "border-primary text-ink" : "border-transparent text-muted")}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "viewings" ? (
        (requests ?? []).length === 0 ? (
          <EmptyState title="No viewing requests waiting" icon="calendar">New requests appear here. Accept, suggest another time or decline.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {(requests ?? []).map((v) => {
              const l = v.listings as unknown as { ref: string; title: string | null; units: { label: string } | null } | null;
              return (
                <li key={v.id} className="surface flex flex-col gap-3 p-4">
                  <p className="flex justify-between font-mono text-micro tracking-caps text-muted uppercase">
                    <span>Viewing request · Unit {l?.units?.label}</span>
                    <span>{timeAgo(v.created_at)}</span>
                  </p>
                  <p className="font-semibold">{l?.title}</p>
                  <p className="text-body">
                    {v.state === "expired" ? <><StatusBadge tone="error">{STAFF_LABEL.expired.label}</StatusBadge>{" "}{v.status === "new_time_proposed" ? "Your suggested time" : "The requested time"} <strong>{formatAppointment((v.proposed_start ?? v.requested_start) as string)}</strong> passed without confirmation.</> : v.status === "new_time_proposed" ? <>You proposed <strong>{formatAppointment(v.proposed_start as string)}</strong>; waiting for the tenant.</> : <>Wants to view on <strong>{formatAppointment(v.requested_start)}</strong> EAT</>}
                  </p>
                  {v.tenant_note ? <p className="text-label text-muted">&quot;{v.tenant_note}&quot;</p> : null}
                  <ViewingResponse viewingId={v.id} state={v.state} />
                </li>
              );
            })}
          </ul>
        )
      ) : rows.length === 0 ? (
        <EmptyState title={tab === "reply" ? "No enquiries need a reply" : "No enquiries yet"} icon="message">
          {tab === "reply" ? "You're up to date." : "Tenants' messages about your listings appear here. Improving photos and confirming availability helps listings get seen."}
        </EmptyState>
      ) : (
        [...grouped.entries()].map(([group, items]) => (
          <section key={group} aria-label={group}>
            <h2 className="heading-group mb-2">{group}</h2>
            <ul className="surface-list">
              {items.map((c) => (
                <li key={c.id}>
                  <Link href={`/w/${orgId}/enquiries/${c.id}`} className="flex gap-3 px-4 py-3.5 hover:bg-cool">
                    <ActivityAvatar name={c.tenant_name ?? "Tenant"} online={online.has(c.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-3">
                        <span className={cx("truncate", c.unread ? "font-bold" : "font-semibold")}>{c.tenant_name ?? "Tenant"} · {c.unit_label}</span>
                        <span className={cx("shrink-0 text-caption", c.needs_reply ? "font-semibold text-waiting" : "text-muted")}>{timeAgo(c.last_message_at)}</span>
                      </span>
                      <span className="block truncate text-label text-muted">{c.last_message}</span>
                      <span className="text-caption text-muted">
                        {STAGE[c.follow_up]}{c.needs_reply ? " · not yet replied" : ""}{c.assigned_membership_id ? ` · assigned to ${memberName.get(c.assigned_membership_id) ?? "staff"}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
