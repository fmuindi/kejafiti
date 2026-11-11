import type { Metadata } from "next";
import Link from "next/link";
import { PeriodNav, periodHref } from "@/components/rent/period-nav";
import { StillAvailableButton } from "@/components/workspace/still-available";
import {
  ActionCards,
  HomeSearch,
  OwingList,
  PositionPanel,
  PropertyChips,
  PropertyComparison,
  QueueList,
  QuickActions,
  RentSnapshot,
  type ActionCardItem,
} from "@/components/workspace/home";
import { HabitDistribution } from "@/components/rent/payment-habits";
import { ButtonLink, Eyebrow, StatusBadge } from "@/components/ui/primitives";
import { getProfile, getSessionUser, isOrgAdmin, requireWorkspace } from "@/lib/auth";
import { getDueFollowUps, getHabits, getMarketplaceWork, getReportedPayments, getMyWork, getOwing, getPosition, getReviewQueue, totalPosition } from "@/lib/dashboard";
import { formatDate, formatPeriod, formatTime, parsePeriodParam, periodParam } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getVisibleProperties } from "@/lib/rent/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Home" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Nairobi" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// The workspace home (blueprint pages 7-8). One system, two starting screens:
//  - owners and agency admins see the rent position first, then what needs them;
//  - managers, caretakers and accountants see their work queue first.
// Every figure opens the records behind it; all come from the same functions as the register.
export default async function HomePage({ params, searchParams }: PageProps<"/w/[orgId]">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const base = `/w/${orgId}`;
  const ws = await requireWorkspace(orgId, base);
  const supabase = await createClient();
  const [profile, user, properties] = await Promise.all([getProfile(), getSessionUser(), getVisibleProperties(supabase, orgId)]);
  const admin = isOrgAdmin(ws);
  const firstName = (profile?.full_name || "").split(" ")[0];

  if (properties.length === 0 && admin) return <FirstRun orgId={orgId} firstName={firstName} />;

  const period = parsePeriodParam(sp.period);
  const propertyId = typeof sp.property === "string" && properties.some((p) => p.id === sp.property) ? sp.property : properties.length === 1 ? properties[0].id : null;
  const property = properties.find((p) => p.id === propertyId) ?? null;

  const canFollowUp = admin || ws.can_manage_tenancies || ws.can_enter_payments || ws.can_confirm;
  const [position, owing, followUps, review, work, market, { data: changedAt }, reported, habits] = await Promise.all([
    getPosition(supabase, orgId, period),
    getOwing(supabase, orgId, propertyId, 200),
    getDueFollowUps(supabase, orgId, user!.id, admin, propertyId),
    ws.can_confirm ? getReviewQueue(supabase, orgId, propertyId) : Promise.resolve([]),
    getMyWork(supabase, ws),
    getMarketplaceWork(supabase, ws),
    supabase.rpc("records_changed_at", { p_org: orgId, p_property: propertyId ?? undefined }),
    canFollowUp ? getReportedPayments(supabase, orgId, propertyId) : Promise.resolve([]),
    getHabits(supabase, orgId, propertyId),
  ]);
  const rows = propertyId ? position.filter((r) => r.property_id === propertyId) : position;
  const t = totalPosition(rows);
  const returned = work.filter((w) => w.grp === "returned");
  const drafts = work.filter((w) => w.grp === "drafts");
  const owingActive = owing.filter((r) => r.tenancy_status === "active");

  const q = (extra: Record<string, string | undefined> = {}) => {
    const u = new URLSearchParams({ period: periodParam(period) });
    if (propertyId) u.set("property", propertyId);
    for (const [k, v] of Object.entries(extra)) if (v) u.set(k, v);
    return u.toString();
  };
  const perf = `${base}/dashboard?${q()}`;
  const owingHref = `${base}/owing${propertyId ? `?property=${propertyId}` : ""}`;
  const recordHref = propertyId ? `${base}/rent/${propertyId}/record?period=${periodParam(period)}` : `${base}/rent`;
  const inboxHref = `${base}/rent/inbox${propertyId ? `?property=${propertyId}` : ""}`;

  const cards: ActionCardItem[] = [
    ...(ws.can_confirm
      ? [{ label: "Awaiting your review", count: review.length, icon: "inbox" as const, href: inboxHref,
           detail: review.length ? `${formatMoney(review.reduce((s, e) => s + e.amount, 0))} submitted` : "Nothing to confirm" }]
      : []),
    ...(canFollowUp
      ? [{ label: "Missing payments reported", count: reported.length, icon: "alert" as const,
           href: reported.length === 1 ? `${base}/rent/${reported[0].property_id}/units/${reported[0].unit_id}#reported` : "#queue",
           detail: reported.length ? "Tenants say they paid" : "None reported" }]
      : []),
    { label: "Follow-ups due", count: followUps.length, icon: "clock", href: "#queue",
      detail: followUps.length ? "Today or earlier" : "None due today" },
    ...(ws.can_enter_payments && !admin
      ? [{ label: "Returned to you", count: returned.length, icon: "refresh" as const, tone: "error" as const, href: `${base}/rent/mine#returned`,
           detail: returned.length ? "Fix and resubmit" : "Nothing returned" }]
      : []),
    { label: "Tenants owing", count: owingActive.length, icon: "wallet", tone: "error", href: owingHref,
      detail: owingActive.length ? `${formatMoney(owingActive.reduce((s, r) => s + r.owed, 0))} overdue` : "Nobody overdue" },
  ];
  const marketCards: ActionCardItem[] = market
    ? [
        { label: "Enquiries to answer", count: market.unanswered, icon: "message", href: `${base}/enquiries`, detail: market.unanswered ? "Tenants are waiting" : "All answered" },
        { label: "Viewing requests", count: market.requests, icon: "calendar", href: `${base}/enquiries?tab=viewings`, detail: market.requests ? "Accept, move or decline" : "None waiting" },
      ]
    : [];
  const needsYou = review.length + reported.length + followUps.length + returned.length + drafts.length + (market ? market.unanswered + market.requests + market.staleListings.length + market.draftListings.length : 0);

  const heading = (
    <div className="flex flex-col gap-3">
      <div>
        <Eyebrow>
          {new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" }).format(new Date())}
          {" · "}{property ? property.name : `${properties.length} propert${properties.length === 1 ? "y" : "ies"}`}
        </Eyebrow>
        <h1 className="heading-page mt-1">
          {greeting()}{firstName ? `, ${firstName}` : ""}. {needsYou ? `${needsYou} thing${needsYou === 1 ? "" : "s"} need${needsYou === 1 ? "s" : ""} you.` : "You're up to date."}
        </h1>
      </div>
      <PropertyChips base={base} properties={properties} current={propertyId} period={period} />
    </div>
  );

  const habitsHref = (show?: string | null) => {
    const u = new URLSearchParams();
    if (propertyId) u.set("property", propertyId);
    if (show) u.set("show", show);
    return `${base}/habits${u.size ? `?${u}` : ""}`;
  };
  const habitsPanel = habits.length ? (
    <section aria-labelledby="habits-h" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="habits-h" className="heading-section">Payment habits</h2>
        <Link href={habitsHref()} className="link-action inline-flex min-h-11 items-center text-label">All {habits.length} tenants</Link>
      </div>
      <div className="surface p-4">
        <HabitDistribution rows={habits} hrefFor={habitsHref} />
      </div>
    </section>
  ) : null;

  const market_ = market ? <Marketplace orgId={orgId} market={market} /> : null;

  if (admin) {
    // Owner / agency admin: the position, then exceptions, then the comparison.
    return (
      <div className="flex flex-col gap-5">
        {heading}
        <PeriodNav period={period} hrefFor={periodHref(base, { property: propertyId ?? undefined })} />
        <PositionPanel
          t={t}
          period={period}
          changedAt={changedAt ?? null}
          links={{
            billed: perf,
            covered: perf,
            outstanding: propertyId ? `${base}/rent/${propertyId}?${q({ filter: "unpaid" })}` : perf,
            occupancy: `${base}/properties`,
            pending: inboxHref,
            owing: owingHref,
          }}
        />
        <QuickActions
          actions={[
            ...(ws.can_enter_payments || ws.can_confirm ? [{ href: recordHref, label: "Record payment", icon: "plus" as const, primary: true }] : []),
            ...(propertyId ? [{ href: `${base}/rent/${propertyId}/tenants`, label: "Tenants", icon: "team" as const }] : []),
            { href: `${base}/reports`, label: "Reports", icon: "file" },
            { href: `${base}/team`, label: "Team", icon: "user" },
          ]}
        />
        <section aria-labelledby="attention-h" className="flex flex-col gap-3">
          <h2 id="attention-h" className="heading-section">Needs attention</h2>
          <ActionCards items={[...cards, ...marketCards]} />
        </section>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section aria-labelledby="owing-h" id="owing" className="flex scroll-mt-24 flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="owing-h" className="heading-section">Who owes</h2>
              {owing.length > 6 ? <Link href={owingHref} className="link-action inline-flex min-h-11 items-center text-label">All {owing.length}</Link> : null}
            </div>
            {owing.length ? <OwingList orgId={orgId} rows={owing.slice(0, 6)} showProperty={!propertyId} /> : <p className="surface-empty p-4">Nobody has an overdue balance.</p>}
          </section>
          <section aria-labelledby="queue-h" id="queue" className="flex scroll-mt-24 flex-col gap-2">
            <h2 id="queue-h" className="heading-section">Your queue</h2>
            <QueueList orgId={orgId} review={review} work={work} followUps={followUps} reported={reported} />
            {market_}
          </section>
        </div>
        {habitsPanel}
        {!propertyId && position.length > 1 ? (
          <section aria-labelledby="compare-h" className="flex flex-col gap-2">
            <h2 id="compare-h" className="heading-section">Properties compared · {formatPeriod(period)}</h2>
            <PropertyComparison orgId={orgId} rows={position} period={period} />
          </section>
        ) : null}
      </div>
    );
  }

  // Manager / caretaker / accountant: the work queue first.
  return (
    <div className="flex flex-col gap-5">
      {heading}
      <div className="flex flex-col gap-2 sm:flex-row">
        <HomeSearch orgId={orgId} />
        {ws.can_enter_payments || ws.can_confirm ? <ButtonLink href={recordHref} icon="plus" size="lg" className="sm:min-h-field">Record payment</ButtonLink> : null}
      </div>
      <ActionCards items={cards} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="queue-h" id="queue" className="flex scroll-mt-24 flex-col gap-2">
          <h2 id="queue-h" className="heading-section">Your queue</h2>
          <QueueList orgId={orgId} review={review} work={work} followUps={followUps} reported={reported} />
        </section>
        <div className="flex flex-col gap-4">
          <RentSnapshot href={perf} t={t} period={period} />
          {owingActive.length ? (
            <section aria-labelledby="owing-h" className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="owing-h" className="heading-section">Who owes</h2>
                <Link href={owingHref} className="link-action inline-flex min-h-11 items-center text-label">All {owingActive.length}</Link>
              </div>
              <OwingList orgId={orgId} rows={owingActive.slice(0, 4)} showProperty={!propertyId} />
            </section>
          ) : null}
          {habitsPanel}
          {marketCards.length ? <ActionCards items={marketCards} /> : null}
          {market_}
        </div>
      </div>
    </div>
  );
}

function Marketplace({ orgId, market }: { orgId: string; market: NonNullable<Awaited<ReturnType<typeof getMarketplaceWork>>> }) {
  if (!market.todaysViewings.length && !market.staleListings.length && !market.draftListings.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {market.todaysViewings.length ? (
        <section aria-labelledby="today-h" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 id="today-h" className="heading-group">Today&apos;s viewings</h2>
            <Link href={`/w/${orgId}/viewings`} className="link-action inline-flex min-h-11 items-center text-label">Agenda</Link>
          </div>
          <ul className="surface-list">
            {market.todaysViewings.map((v) => (
              <li key={v.id} className="flex items-center gap-4 px-4 py-3">
                <span className="font-mono text-body">{formatTime(v.confirmed_start as string)}</span>
                <span className="min-w-0 flex-1 text-label">
                  Unit {((v.listings as unknown as { units: { label: string } | null } | null)?.units?.label) ?? ""} · {(v.properties as unknown as { name: string } | null)?.name}
                </span>
                <StatusBadge tone="success">Confirmed</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {market.staleListings.length ? (
        <section aria-labelledby="stale-h" className="flex flex-col gap-2">
          <h2 id="stale-h" className="heading-group">Still available? Tenants see the date you last confirmed</h2>
          <ul className="surface-list">
            {market.staleListings.slice(0, 3).map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Unit {l.unit} · {l.property}</span>
                  <span className="text-caption text-muted">Last confirmed {formatDate(l.confirmedAt, { year: false })}</span>
                </span>
                <StillAvailableButton orgId={orgId} listingIds={[l.id]} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {market.draftListings.length ? (
        <Link href={`/w/${orgId}/listings/${market.draftListings[0].id}`} className="surface flex items-center justify-between gap-3 p-4 hover:border-ink">
          <span>
            <span className="block font-semibold">{market.draftListings.length} listing{market.draftListings.length === 1 ? "" : "s"} to finish or correct</span>
            <span className="text-caption text-muted">{market.draftListings.some((d) => d.status === "needs_correction") ? "Our team asked for a correction" : "Drafts are saved as you go"}</span>
          </span>
          <span className="link-action text-label">Open</span>
        </Link>
      ) : null}
    </div>
  );
}

function FirstRun({ orgId, firstName }: { orgId: string; firstName: string }) {
  return (
    <div className="mx-auto flex max-w-narrow flex-col gap-5">
      <h1 className="heading-page">Welcome{firstName ? `, ${firstName}` : ""}. Let&apos;s get your vacant home seen.</h1>
      <p className="text-body text-muted">Listing is free for one vacancy. It takes about 10 minutes and saves as you go.</p>
      <ol className="flex flex-col gap-3">
        {[
          ["Where it is", "Area and a nearby landmark. Exact address stays private."],
          ["What the tenant pays", "Rent, deposit and any service charge."],
          ["A few photos", "Taken on your phone is fine."],
        ].map(([title, d], i) => (
          <li key={title} className="surface flex gap-4 p-4">
            <span className="font-mono text-label text-muted">0{i + 1}</span>
            <span>
              <span className="block font-semibold">{title}</span>
              <span className="text-label text-muted">{d}</span>
            </span>
          </li>
        ))}
      </ol>
      <ButtonLink href={`/w/${orgId}/listings/new`} size="lg" icon="plus">List a home</ButtonLink>
      <ButtonLink href={`/w/${orgId}/properties/new`} variant="secondary" size="lg">I manage a building with many units</ButtonLink>
    </div>
  );
}
