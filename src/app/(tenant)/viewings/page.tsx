import type { Metadata } from "next";
import Link from "next/link";
import { TenantViewingActions } from "@/components/messaging/tenant-viewing-actions";
import { ButtonLink, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { getProfile, requireUser } from "@/lib/auth";
import { formatAppointment, formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STATES, TENANT_LABEL } from "@/lib/viewings";

export const metadata: Metadata = { title: "My viewings" };

export default async function TenantViewingsPage() {
  await requireUser("/viewings");
  const profile = await getProfile();
  const supabase = await createClient();
  // Listing context comes through my_viewings / my_saved_listings: tenants can't read the
  // listings table directly, so embedding it here returned null (IMP-02).
  const [{ data: viewings, error }, { data: saved }] = await Promise.all([supabase.rpc("my_viewings"), supabase.rpc("my_saved_listings")]);
  // Upcoming first, soonest at the top; a request whose time passed moves to "Needs a new time".
  const open = (viewings ?? []).filter((v) => OPEN_STATES.includes(v.state)).reverse();
  const expired = (viewings ?? []).filter((v) => v.state === "expired");
  const past = (viewings ?? []).filter((v) => !OPEN_STATES.includes(v.state) && v.state !== "expired");
  const changes = (saved ?? []).filter((s) => s.status !== "published");
  const confirmed = open.filter((v) => v.status === "confirmed").length;
  const first = (profile?.full_name || "").split(" ")[0];
  const headline = confirmed
    ? `${confirmed} viewing${confirmed === 1 ? " is" : "s are"} confirmed.`
    : open.length
      ? "Your requests are waiting for replies."
      : expired.length
        ? `${expired.length === 1 ? "A requested time" : "Some requested times"} passed without confirmation.`
        : "No viewings yet.";

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-5 pb-10">
      <div>
        <p className="font-mono text-[12px] tracking-[0.6px] text-muted uppercase">Your move</p>
        <h1 className="mt-1 font-display text-[30px] leading-[1.05] font-bold tracking-[-0.8px]">
          {first ? `Hi ${first}, ${headline.charAt(0).toLowerCase()}${headline.slice(1)}` : headline}
        </h1>
      </div>
      {error ? <p role="alert" className="text-error">We couldn&apos;t load your viewings. Reload to try again.</p> : null}
      {!error && open.length === 0 && expired.length === 0 && past.length === 0 ? (
        <EmptyState title="Request a viewing from any listing" icon="calendar" action={<ButtonLink href="/search">Find a home</ButtonLink>}>
          Requests show as pending until the advertiser confirms. Times are East Africa Time.
        </EmptyState>
      ) : null}
      <ul className="flex flex-col gap-3">
        {[...open, ...expired].map((v) => {
          const s = TENANT_LABEL[v.state] ?? TENANT_LABEL.unknown;
          const when = v.confirmed_start ?? v.proposed_start ?? v.requested_start;
          return (
            <li key={v.id} className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                <span className="font-mono text-[12px] text-muted">EAT · UTC+3</span>
              </div>
              <p className="font-display text-[20px] font-bold">{formatAppointment(when)}</p>
              <ListingLink v={v} />
              {v.state === "requested" ? <p className="text-[14px] text-muted">You asked for {formatAppointment(v.requested_start)}. Not confirmed yet.</p> : null}
              {v.state === "new_time_proposed" ? <p className="text-[14px] text-waiting-strong">The advertiser suggested {formatAppointment(v.proposed_start as string)} instead.</p> : null}
              {v.state === "expired" ? <p className="text-[14px] text-muted">This time passed before it was confirmed. Ask for a new time, or cancel the request.</p> : null}
              {v.state === "confirmed" && v.meeting_instructions ? <p className="rounded-[12px] bg-cool p-3 text-[14px]">{v.meeting_instructions}</p> : null}
              <TenantViewingActions viewingId={v.id} status={v.state} conversationId={v.conversation_id} />
            </li>
          );
        })}
      </ul>
      {changes.length ? (
        <section aria-labelledby="changes">
          <h2 id="changes" className="font-display text-[18px] font-bold">Changes to homes you saved</h2>
          <ul className="mt-2 flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {changes.map((l) => (
              <li key={l.listing_id}>
                <Link href={`/homes/${l.ref}`} className="flex flex-col px-4 py-3 hover:bg-cool">
                  <span className="font-semibold">{l.title ?? `Home in ${l.area}`}</span>
                  <span className="text-[13px] font-semibold text-error">No longer available{l.let_on ? ` · let on ${formatDate(l.let_on, { year: false })}` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {past.length ? (
        <section aria-labelledby="past">
          <h2 id="past" className="font-display text-[18px] font-bold">Past and closed</h2>
          <ul className="mt-2 flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {past.map((v) => (
              <li key={v.id} className="flex flex-col px-4 py-3 text-[14px]">
                <span className="font-semibold">{v.listing_title ?? `Home in ${v.area}`}</span>
                <span className="text-muted">{formatAppointment(v.confirmed_start ?? v.requested_start)} · {(TENANT_LABEL[v.state] ?? TENANT_LABEL.unknown).label}{v.decline_reason || v.cancel_reason ? ` · "${v.decline_reason ?? v.cancel_reason}"` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// Listing link that never builds a URL from a missing reference, and says when the home is gone.
function ListingLink({ v }: { v: { listing_ref: string; listing_title: string | null; listing_status: string; area: string; org_name: string } }) {
  const title = v.listing_title ?? `Home in ${v.area}`;
  return (
    <p className="flex flex-col">
      {v.listing_ref ? <Link href={`/homes/${v.listing_ref}`} className="font-semibold hover:underline">{title}</Link> : <span className="font-semibold">{title}</span>}
      <span className="text-[13px] text-muted">
        {v.org_name} · {v.area}
        {v.listing_status !== "published" ? <span className="font-semibold text-error"> · no longer available</span> : null}
      </span>
    </p>
  );
}
