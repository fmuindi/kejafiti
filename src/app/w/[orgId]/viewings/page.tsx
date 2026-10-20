import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ViewingResponse } from "@/components/messaging/viewing-response";
import { EmptyState, PageTitle, StatusBadge } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth";
import { formatDayDate, formatTime, isoHoursAgo } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { STAFF_LABEL, viewingRows } from "@/lib/viewings";

export const metadata: Metadata = { title: "Viewings" };

// Mobile agenda: confirmed and requested viewings grouped by day (EAT).
export default async function AgendaPage({ params }: PageProps<"/w/[orgId]/viewings">) {
  const { orgId } = await params;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/viewings`);
  if (!ws.can_manage_listings) notFound();
  const supabase = await createClient();
  const { data } = await supabase
    .from("viewing_states")
    .select("id, status, state, requested_start, confirmed_start, conversation_id, listings(title, units(label)), properties(name)")
    .eq("org_id", orgId)
    .in("status", ["requested", "confirmed", "new_time_proposed"])
    .gte("requested_start", isoHoursAgo(24))
    .order("requested_start")
    .limit(100);
  const rows = viewingRows(data);
  const days = new Map<string, typeof rows>();
  for (const v of rows) {
    const when = v.confirmed_start ?? v.requested_start;
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(when));
    days.set(key, [...(days.get(key) ?? []), v]);
  }
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5">
      <PageTitle>Viewings</PageTitle>
      {days.size === 0 ? (
        <EmptyState title="No upcoming viewings" icon="calendar">Requests and confirmed viewings appear here by day, in East Africa Time.</EmptyState>
      ) : (
        [...days.entries()].map(([day, items]) => (
          <section key={day} aria-label={formatDayDate(day)}>
            <h2 className="mb-2 font-display text-[18px] font-bold">{formatDayDate(day)}</h2>
            <ul className="flex flex-col divide-y divide-divider rounded-[18px] border border-line bg-surface">
              {items.map((v) => {
                const l = v.listings as unknown as { title: string | null; units: { label: string } | null } | null;
                return (
                  <li key={v.id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-[15px]">{formatTime(v.confirmed_start ?? v.requested_start)}</span>
                      <span className="min-w-0 flex-1">
                        <Link href={v.conversation_id ? `/w/${orgId}/enquiries/${v.conversation_id}` : "#"} className="font-semibold hover:underline">Unit {l?.units?.label} · {(v.properties as unknown as { name: string } | null)?.name}</Link>
                        <span className="block truncate text-[13px] text-muted">{l?.title}</span>
                      </span>
                      <StatusBadge tone={STAFF_LABEL[v.state]?.tone ?? "neutral"}>{STAFF_LABEL[v.state]?.label ?? v.state}</StatusBadge>
                    </div>
                    {v.state === "requested" || v.state === "expired" ? <ViewingResponse viewingId={v.id} expired={v.state === "expired"} /> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
