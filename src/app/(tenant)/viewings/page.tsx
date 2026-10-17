import type { Metadata } from "next";
import Link from "next/link";
import { TenantViewingActions } from "@/components/messaging/tenant-viewing-actions";
import { ButtonLink, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { getProfile, requireUser } from "@/lib/auth";
import { formatAppointment, formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My viewings" };

const STATUS: Record<string, { label: string; tone: "success" | "waiting" | "error" | "neutral" }> = {
  requested: { label: "Requested · awaiting advertiser", tone: "waiting" },
  new_time_proposed: { label: "New time proposed", tone: "waiting" },
  confirmed: { label: "Confirmed", tone: "success" },
  declined: { label: "Declined", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  attended: { label: "Attended", tone: "neutral" },
  not_attended: { label: "Not attended", tone: "neutral" },
  unknown: { label: "Outcome not recorded", tone: "neutral" },
};

export default async function TenantViewingsPage() {
  const user = await requireUser("/viewings");
  const profile = await getProfile();
  const supabase = await createClient();
  const [{ data: viewings }, { data: saved }] = await Promise.all([
    supabase.from("viewings").select("id, status, requested_start, proposed_start, confirmed_start, meeting_instructions, decline_reason, cancel_reason, conversation_id, listings(ref, title, status, let_on)").eq("tenant_id", user.id).order("requested_start", { ascending: false }).limit(50),
    supabase.from("saved_listings").select("listing_id, listings(ref, title, status, let_on)").eq("user_id", user.id).limit(50),
  ]);
  const open = (viewings ?? []).filter((v) => ["requested", "new_time_proposed", "confirmed"].includes(v.status));
  const past = (viewings ?? []).filter((v) => !["requested", "new_time_proposed", "confirmed"].includes(v.status));
  const changes = (saved ?? []).filter((s) => (s.listings as unknown as { status: string } | null)?.status !== "published");
  const confirmed = open.filter((v) => v.status === "confirmed").length;
  const first = (profile?.full_name || "").split(" ")[0];

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-5 pb-10">
      <div>
        <p className="font-mono text-[12px] tracking-[0.6px] text-muted uppercase">Your move</p>
        <h1 className="mt-1 font-display text-[30px] leading-[1.05] font-bold tracking-[-0.8px]">
          {first ? `Hi ${first}, ` : ""}
          {confirmed ? `${confirmed} viewing${confirmed === 1 ? " is" : "s are"} confirmed.` : open.length ? "Your requests are waiting for replies." : "No viewings yet."}
        </h1>
      </div>
      {open.length === 0 && past.length === 0 ? (
        <EmptyState title="Request a viewing from any listing" icon="calendar" action={<ButtonLink href="/search">Find a home</ButtonLink>}>
          Requests show as pending until the advertiser confirms. Times are East Africa Time.
        </EmptyState>
      ) : null}
      <ul className="flex flex-col gap-3">
        {open.map((v) => {
          const l = v.listings as unknown as { ref: string; title: string | null } | null;
          const s = STATUS[v.status];
          const when = v.confirmed_start ?? v.proposed_start ?? v.requested_start;
          return (
            <li key={v.id} className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                <span className="font-mono text-[12px] text-muted">EAT · UTC+3</span>
              </div>
              <p className="font-display text-[20px] font-bold">{formatAppointment(when)}</p>
              <Link href={`/homes/${l?.ref}`} className="font-semibold hover:underline">{l?.title}</Link>
              {v.status === "requested" ? <p className="text-[14px] text-muted">You asked for {formatAppointment(v.requested_start)}. Not confirmed yet.</p> : null}
              {v.status === "new_time_proposed" ? <p className="text-[14px] text-waiting-strong">The advertiser suggested {formatAppointment(v.proposed_start as string)} instead.</p> : null}
              {v.status === "confirmed" && v.meeting_instructions ? <p className="rounded-[12px] bg-cool p-3 text-[14px]">{v.meeting_instructions}</p> : null}
              <TenantViewingActions viewingId={v.id} status={v.status} conversationId={v.conversation_id} />
            </li>
          );
        })}
      </ul>
      {changes.length ? (
        <section aria-labelledby="changes">
          <h2 id="changes" className="font-display text-[18px] font-bold">Changes to homes you saved</h2>
          <ul className="mt-2 flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {changes.map((s) => {
              const l = s.listings as unknown as { ref: string; title: string | null; status: string; let_on: string | null };
              return (
                <li key={s.listing_id}>
                  <Link href={`/homes/${l.ref}`} className="flex flex-col px-4 py-3 hover:bg-cool">
                    <span className="font-semibold">{l.title}</span>
                    <span className="text-[13px] font-semibold text-error">No longer available{l.let_on ? ` · let on ${formatDate(l.let_on, { year: false })}` : ""}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {past.length ? (
        <section aria-labelledby="past">
          <h2 id="past" className="font-display text-[18px] font-bold">Past and closed</h2>
          <ul className="mt-2 flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {past.map((v) => (
              <li key={v.id} className="flex flex-col px-4 py-3 text-[14px]">
                <span className="font-semibold">{(v.listings as unknown as { title: string | null } | null)?.title}</span>
                <span className="text-muted">{formatAppointment(v.confirmed_start ?? v.requested_start)} · {STATUS[v.status].label}{v.decline_reason || v.cancel_reason ? ` · "${v.decline_reason ?? v.cancel_reason}"` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
