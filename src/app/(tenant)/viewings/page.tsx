import type { Metadata } from "next";
import Link from "next/link";
import { TenantViewingActions } from "@/components/messaging/tenant-viewing-actions";
import { PageHeader } from "@/components/shell/page-header";
import { TenantJumps } from "@/components/shell/tenant-jumps";
import { ViewingDirections } from "@/components/tenant/viewing-directions";
import { DateTile } from "@/components/ui/date-tile";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { appointmentParts, formatAppointment, formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STATES, TENANT_LABEL } from "@/lib/viewings";

export const metadata: Metadata = { title: "Viewings" };

/** One line under a viewing: what is happening, and what the tenant does next. */
const NEXT: Record<string, string> = {
  requested: "Waiting for the advertiser",
  new_time_proposed: "New time suggested. Accept it or ask for another.",
  expired: "Time passed. Ask for a new time.",
};
const needsTenant = (state: string) => state === "new_time_proposed" || state === "expired";

export default async function TenantViewingsPage() {
  await requireUser("/viewings");
  const supabase = await createClient();
  // Listing context comes through my_viewings / my_saved_listings: tenants can't read the
  // listings table directly, so embedding it here returned null (IMP-02).
  const [{ data: viewings, error }, { data: saved }] = await Promise.all([supabase.rpc("my_viewings"), supabase.rpc("my_saved_listings")]);
  const all = viewings ?? [];
  // Waiting on the tenant first, then upcoming, soonest first.
  const active = all
    .filter((v) => OPEN_STATES.includes(v.state) || v.state === "expired")
    .reverse()
    .sort((a, b) => Number(needsTenant(b.state)) - Number(needsTenant(a.state)));
  const past = all.filter((v) => !OPEN_STATES.includes(v.state) && v.state !== "expired");
  const changes = (saved ?? []).filter((s) => s.status !== "published");
  const confirmed = active.filter((v) => v.state === "confirmed").length;
  const needYou = active.filter((v) => needsTenant(v.state)).length;
  // Exact location and directions, for confirmed viewings only (see viewing_location).
  const places = new Map(
    await Promise.all(
      active.filter((v) => v.state === "confirmed").map(async (v) => [v.id, (await supabase.rpc("viewing_location", { p_viewing: v.id })).data?.[0] ?? null] as const),
    ),
  );
  const meta = [confirmed ? `${confirmed} confirmed` : null, needYou ? `${needYou} need${needYou === 1 ? "s" : ""} you` : null].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-5 pb-10">
      <PageHeader icon="calendar" title="Viewings" meta={meta || null} />
      <TenantJumps current="/viewings" />
      {error ? <p role="alert" className="text-error">Couldn&apos;t load viewings. Reload to try again.</p> : null}
      {!error && active.length === 0 && past.length === 0 ? (
        <EmptyState title="No viewings yet" icon="calendar" action={<ButtonLink href="/search" icon="search">Find a home</ButtonLink>}>
          Request one from any home.
        </EmptyState>
      ) : null}
      <ul className="flex flex-col gap-3">
        {active.map((v) => {
          const s = TENANT_LABEL[v.state] ?? TENANT_LABEL.unknown;
          const when = v.confirmed_start ?? v.proposed_start ?? v.requested_start;
          const p = appointmentParts(when);
          return (
            <li key={v.id} className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-4">
              <div className="flex items-start gap-3.5">
                <DateTile at={when} tone={s.tone === "success" ? "success" : s.tone === "waiting" ? "waiting" : "neutral"} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[1.1875rem] leading-tight font-bold">
                    {p.weekday} · {p.time}
                  </p>
                  <ListingLink v={v} />
                </div>
                <StatusBadge tone={s.tone}>{s.label.split(" · ")[0]}</StatusBadge>
              </div>
              {NEXT[v.state] ? (
                <p className={needsTenant(v.state) ? "flex items-center gap-2 text-[0.875rem] font-semibold text-waiting-strong" : "flex items-center gap-2 text-[0.875rem] text-muted"}>
                  <Icon name={needsTenant(v.state) ? "alert" : "clock"} size={16} /> {NEXT[v.state]}
                </p>
              ) : null}
              {v.state === "confirmed" && v.meeting_instructions ? (
                <p className="flex items-start gap-2 text-[0.875rem]">
                  <Icon name="info" size={16} className="mt-0.5 shrink-0 text-deep" /> {v.meeting_instructions}
                </p>
              ) : null}
              {places.get(v.id) ? <Directions p={places.get(v.id)!} /> : null}
              <TenantViewingActions viewingId={v.id} status={v.state} conversationId={v.conversation_id} />
            </li>
          );
        })}
      </ul>
      {changes.length ? (
        <section aria-labelledby="changes" className="flex flex-col gap-2">
          <h2 id="changes" className="flex items-center gap-2 text-[0.9375rem] font-semibold text-muted">
            <Icon name="alert" size={16} /> Saved homes now let
          </h2>
          <ul className="flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {changes.map((l) => (
              <li key={l.listing_id}>
                <Link href={`/homes/${l.ref}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-cool">
                  <span className="truncate font-semibold">{l.title ?? `Home in ${l.area}`}</span>
                  <span className="shrink-0 text-[0.8125rem] text-error">{l.let_on ? `Let ${formatDate(l.let_on, { year: false })}` : "Unavailable"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {past.length ? (
        <details className="group rounded-[16px] border border-line bg-surface">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-semibold">
            <Icon name="history" size={18} className="text-muted" /> Past <span className="text-muted">{past.length}</span>
            <Icon name="chevronDown" size={18} className="ml-auto text-muted transition-transform group-open:rotate-180" />
          </summary>
          <ul className="flex flex-col divide-y divide-divider border-t border-divider">
            {past.map((v) => (
              <li key={v.id} className="flex flex-col px-4 py-3 text-[0.875rem]">
                <span className="font-semibold">{v.listing_title ?? `Home in ${v.area}`}</span>
                <span className="text-muted">
                  {formatAppointment(v.confirmed_start ?? v.requested_start)} · {(TENANT_LABEL[v.state] ?? TENANT_LABEL.unknown).label}
                  {v.decline_reason || v.cancel_reason ? ` · "${v.decline_reason ?? v.cancel_reason}"` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

// Listing link that never builds a URL from a missing reference, and says when the home is gone.
function ListingLink({ v }: { v: { listing_ref: string; listing_title: string | null; listing_status: string; area: string; org_name: string } }) {
  const title = v.listing_title ?? `Home in ${v.area}`;
  return (
    <p className="mt-0.5 flex min-w-0 flex-col text-[0.875rem]">
      {v.listing_ref ? (
        <Link href={`/homes/${v.listing_ref}`} className="truncate hover:underline">
          {title}
        </Link>
      ) : (
        <span className="truncate">{title}</span>
      )}
      <span className="truncate text-[0.8125rem] text-muted">
        {v.org_name} · {v.area}
        {v.listing_status !== "published" ? <span className="font-semibold text-error"> · unavailable</span> : null}
      </span>
    </p>
  );
}

function Directions({ p }: { p: { property_name: string; address: string | null; landmark: string | null; latitude: number | null; longitude: number | null } }) {
  return (
    <ViewingDirections
      place={{ name: p.property_name, address: p.address, latitude: p.latitude === null ? null : Number(p.latitude), longitude: p.longitude === null ? null : Number(p.longitude) }}
      landmark={p.landmark}
    />
  );
}
