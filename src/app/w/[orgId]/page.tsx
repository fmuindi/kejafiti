import type { Metadata } from "next";
import Link from "next/link";
import { StillAvailableButton } from "@/components/workspace/still-available";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, Eyebrow, StatusBadge } from "@/components/ui/primitives";
import { getProfile, isOrgAdmin, requireWorkspace } from "@/lib/auth";
import { currentPeriod, daysSince, formatDate, formatPeriod, formatTime, timeAgo, todayEAT } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getSummary } from "@/lib/rent/queries";
import { formatRate } from "@/lib/rent/status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Nairobi" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function OverviewPage({ params }: PageProps<"/w/[orgId]">) {
  const { orgId } = await params;
  const ws = await requireWorkspace(orgId, `/w/${orgId}`);
  const supabase = await createClient();
  const profile = await getProfile();
  const period = currentPeriod();
  const today = todayEAT();

  const [props, convs, viewings, listings, pending, summary] = await Promise.all([
    supabase.from("properties").select("id, name", { count: "exact" }).eq("org_id", orgId).is("archived_at", null),
    ws.can_manage_listings
      ? supabase.from("conversations").select("id, last_tenant_message_at, last_advertiser_message_at, follow_up, property_id, properties(name)").eq("org_id", orgId).neq("follow_up", "closed").order("last_tenant_message_at", { ascending: true }).limit(100)
      : Promise.resolve({ data: [] }),
    ws.can_manage_listings
      ? supabase.from("viewings").select("id, status, requested_start, confirmed_start, listing_id, listings(ref, units(label)), properties(name)").eq("org_id", orgId).in("status", ["requested", "confirmed"]).order("requested_start").limit(50)
      : Promise.resolve({ data: [] }),
    ws.can_manage_listings
      ? supabase.from("listings").select("id, ref, status, availability_confirmed_at, units(label, layout), properties(name)").eq("org_id", orgId).in("status", ["published", "draft", "needs_correction", "under_review"]).limit(100)
      : Promise.resolve({ data: [] }),
    ws.can_confirm
      ? supabase.from("payment_entries").select("id, amount, submitted_by, property_id, properties(name)").eq("org_id", orgId).eq("status", "awaiting_confirmation")
      : Promise.resolve({ data: [] }),
    getSummary(supabase, orgId, null, period),
  ]);

  const unanswered = (convs.data ?? []).filter((c) => c.last_tenant_message_at && (!c.last_advertiser_message_at || c.last_advertiser_message_at < c.last_tenant_message_at));
  const oldest = unanswered[0];
  const requests = (viewings.data ?? []).filter((v) => v.status === "requested");
  const todays = (viewings.data ?? []).filter((v) => v.status === "confirmed" && v.confirmed_start && new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(v.confirmed_start)) === today);
  const stale = (listings.data ?? []).filter((l) => l.status === "published" && (daysSince(l.availability_confirmed_at) ?? 99) > 10);
  const drafts = (listings.data ?? []).filter((l) => l.status === "draft" || l.status === "needs_correction");
  const pendingTotal = (pending.data ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const s = summary.summary;
  const tasks = unanswered.length + requests.length + (pending.data ?? []).length + stale.length + drafts.length;
  const firstName = (profile?.full_name || "").split(" ")[0];
  const propertyCount = props.count ?? 0;

  if (propertyCount === 0 && isOrgAdmin(ws)) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col gap-6">
        <h1 className="font-display text-[34px] leading-[1.02] font-bold tracking-[-1.2px]">Welcome{firstName ? `, ${firstName}` : ""}. Let&apos;s get your vacant home seen.</h1>
        <p className="text-[15px] text-muted">Listing is free for one vacancy. It takes about 10 minutes and saves as you go.</p>
        <ol className="flex flex-col gap-3">
          {[
            ["Where it is", "Area and a nearby landmark. Exact address stays private."],
            ["What the tenant pays", "Rent, deposit and any service charge."],
            ["A few photos", "Taken on your phone is fine."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-4 rounded-[16px] border border-line bg-surface p-4">
              <span className="font-mono text-[14px] text-muted">0{i + 1}</span>
              <span>
                <span className="block font-semibold">{t}</span>
                <span className="text-[14px] text-muted">{d}</span>
              </span>
            </li>
          ))}
        </ol>
        <ButtonLink href={`/w/${orgId}/listings/new`} size="lg" icon="plus">List a home</ButtonLink>
        <ButtonLink href={`/w/${orgId}/properties/new`} variant="secondary" size="lg">I manage a building with many units</ButtonLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Eyebrow>
          {new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" }).format(new Date())} · {propertyCount} propert{propertyCount === 1 ? "y" : "ies"}
          {s ? ` · ${s.units_total} units` : ""}
        </Eyebrow>
        <h1 className="mt-1 font-display text-[30px] leading-[1.05] font-bold tracking-[-0.8px] md:text-[40px]">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}. {tasks ? `${tasks} thing${tasks === 1 ? "" : "s"} need${tasks === 1 ? "s" : ""} you.` : "You're up to date."}
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section aria-label="Needs attention" className="overflow-hidden rounded-[22px] border border-line bg-surface">
          <ul className="divide-y divide-divider">
            {ws.can_manage_listings ? (
              <li>
                <Link href={`/w/${orgId}/enquiries`} className="flex items-center gap-4 px-4 py-4 hover:bg-cool">
                  <span className={`font-display text-[26px] font-bold ${unanswered.length ? "text-waiting" : "text-muted"}`}>{unanswered.length}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">Enquiries need a reply</span>
                    <span className="text-[13.5px] text-muted">{oldest ? `Oldest waiting ${timeAgo(oldest.last_tenant_message_at)} · ${(oldest.properties as unknown as { name: string } | null)?.name ?? ""}` : "Nothing waiting"}</span>
                  </span>
                  <Icon name="chevronRight" className="text-muted" />
                </Link>
              </li>
            ) : null}
            {ws.can_manage_listings ? (
              <li>
                <Link href={`/w/${orgId}/enquiries?tab=viewings`} className="flex items-center gap-4 px-4 py-4 hover:bg-cool">
                  <span className={`font-display text-[26px] font-bold ${requests.length ? "text-waiting" : "text-muted"}`}>{requests.length}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">Viewing requests to answer</span>
                    <span className="text-[13.5px] text-muted">Accept, suggest a time or decline</span>
                  </span>
                  <Icon name="chevronRight" className="text-muted" />
                </Link>
              </li>
            ) : null}
            <li>
              <Link href={ws.can_confirm ? `/w/${orgId}/rent/inbox` : `/w/${orgId}/rent`} className="flex items-center gap-4 px-4 py-4 hover:bg-cool">
                <span className={`font-display text-[26px] font-bold ${(pending.data ?? []).length ? "text-waiting" : "text-muted"}`}>{(pending.data ?? []).length}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Rent entries awaiting confirmation</span>
                  <span className="text-[13.5px] text-muted">
                    {(pending.data ?? []).length ? `${formatMoney(pendingTotal)} · ` : ""}
                    {s ? `${formatPeriod(period)} ${formatRate(s.collection_rate)} confirmed` : "No rent records yet"}
                  </span>
                </span>
                <Icon name="chevronRight" className="text-muted" />
              </Link>
            </li>
            {ws.can_manage_listings ? (
              <li className="px-4 py-4">
                <div className="flex items-center gap-4">
                  <span className={`font-display text-[26px] font-bold ${stale.length ? "text-waiting" : "text-muted"}`}>{stale.length}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">Vacancies to reconfirm</span>
                    <span className="text-[13.5px] text-muted">Tenants see the date you last confirmed</span>
                  </span>
                </div>
                {stale.slice(0, 3).map((l) => {
                  const unit = l.units as unknown as { label: string; layout: string } | null;
                  return (
                    <div key={l.id} className="mt-3 flex items-center gap-3 rounded-[14px] bg-cool p-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-[13px] uppercase">Unit {unit?.label} · {(l.properties as unknown as { name: string } | null)?.name}</span>
                        <span className="text-[13px] text-muted">Last confirmed {formatDate(l.availability_confirmed_at, { year: false })}</span>
                      </span>
                      <StillAvailableButton orgId={orgId} listingIds={[l.id]} />
                    </div>
                  );
                })}
              </li>
            ) : null}
            {drafts.length ? (
              <li>
                <Link href={`/w/${orgId}/listings/${drafts[0].id}`} className="flex items-center gap-4 px-4 py-4 hover:bg-cool">
                  <span className="font-display text-[26px] font-bold text-waiting">{drafts.length}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">Listings to finish or correct</span>
                    <span className="text-[13.5px] text-muted">{drafts.some((d) => d.status === "needs_correction") ? "Our team asked for a correction" : "Drafts are saved as you go"}</span>
                  </span>
                  <Icon name="chevronRight" className="text-muted" />
                </Link>
              </li>
            ) : null}
          </ul>
        </section>

        <div className="flex flex-col gap-4">
          {ws.can_manage_listings ? (
            <section aria-labelledby="today" className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <h2 id="today" className="font-display text-[18px] font-bold">Today&apos;s viewings</h2>
                <Link href={`/w/${orgId}/viewings`} className="text-[14px] font-semibold text-primary">Agenda</Link>
              </div>
              {todays.length ? (
                <ul className="flex flex-col divide-y divide-divider rounded-[18px] border border-line bg-surface">
                  {todays.map((v) => (
                    <li key={v.id} className="flex items-center gap-4 px-4 py-3">
                      <span className="font-mono text-[15px]">{formatTime(v.confirmed_start as string)}</span>
                      <span className="min-w-0 flex-1 text-[14px]">
                        Unit {((v.listings as unknown as { units: { label: string } | null } | null)?.units?.label) ?? ""} · {(v.properties as unknown as { name: string } | null)?.name}
                      </span>
                      <StatusBadge tone="success">Confirmed</StatusBadge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-[16px] border border-dashed border-line bg-surface p-4 text-[14px] text-muted">No viewings today.</p>
              )}
            </section>
          ) : null}
          {s && s.billed > 0 ? (
            <Link href={`/w/${orgId}/dashboard`} className="rounded-[18px] border border-line bg-surface p-4 hover:border-ink">
              <Eyebrow>Rent · {formatPeriod(period)}</Eyebrow>
              <p className="mt-1">
                <span className="font-display text-[22px] font-extrabold">{formatMoney(s.settled)}</span>
                <span className="text-muted"> of {formatMoney(s.billed)} confirmed · {formatRate(s.collection_rate)}</span>
              </p>
              <p className="mt-1 text-[12.5px] text-muted">Confirmed by property staff. Open the dashboard</p>
            </Link>
          ) : null}
          {ws.can_manage_listings ? <ButtonLink href={`/w/${orgId}/listings/new`} size="lg" icon="plus">List a home</ButtonLink> : null}
        </div>
      </div>
    </div>
  );
}
