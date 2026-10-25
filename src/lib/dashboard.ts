import "server-only";
import type { Workspace } from "@/lib/auth";
import { daysSince, todayEAT } from "@/lib/dates";
import type { ServerClient } from "@/lib/supabase/server";
import { STAFF_ACTION_STATES, viewingRows } from "@/lib/viewings";

// Data for the workspace home (blueprint pages 7-8). Every figure comes from the same database
// functions as the register, Performance and exports, so the home never tells a different story.

export type PositionRow = {
  property_id: string;
  property_name: string;
  billed: number;
  settled: number;
  collection_rate: number | null;
  outstanding: number;
  overdue: number;
  pending_count: number;
  occupied: number;
  lettable: number;
  unavailable: number;
  units_total: number;
  owed_now: number;
  owing_tenancies: number;
  last_confirmed_at: string | null;
};

export type OwingRow = {
  tenancy_id: string;
  tenancy_status: "active" | "ended";
  property_id: string;
  property_name: string;
  unit_id: string;
  unit_label: string;
  tenant_name: string;
  owed: number;
  oldest_due: string;
  pending_amount: number;
  open_follow_ups: number;
  next_follow_up: string | null;
  last_contact_at: string | null;
  last_contact_kind: FollowUpKind | null;
  last_reminder_at: string | null;
};

export type FollowUpKind = "contacted" | "promised" | "reported" | "note";
export const FOLLOW_UP_LABEL: Record<FollowUpKind, string> = {
  contacted: "Contacted",
  promised: "Promised to pay",
  reported: "Says they paid",
  note: "Note",
};

export type DueFollowUp = {
  id: string;
  kind: FollowUpKind;
  note: string | null;
  due_on: string;
  property_id: string;
  unit_id: string;
  unit_label: string;
  tenant_name: string;
  assigned_to: string | null;
};

export type ReviewItem = { id: string; amount: number; property_id: string; unit_label: string; tenant_name: string; submitted_by_name: string | null };
export type WorkItem = { entry_id: string; ref: string; grp: "returned" | "drafts" | "submitted"; amount: number; property_id: string; property_name: string; unit_label: string; tenancy_id: string; decision_reason: string | null };

const num = (v: unknown) => Number(v ?? 0);

/** Sum of the per-property rows: the portfolio, without mixing anything the rows don't share. */
export function totalPosition(rows: PositionRow[]) {
  const t = rows.reduce(
    (a, r) => ({
      billed: a.billed + r.billed,
      settled: a.settled + r.settled,
      outstanding: a.outstanding + r.outstanding,
      pending_count: a.pending_count + r.pending_count,
      occupied: a.occupied + r.occupied,
      lettable: a.lettable + r.lettable,
      unavailable: a.unavailable + r.unavailable,
      owed_now: a.owed_now + r.owed_now,
      owing_tenancies: a.owing_tenancies + r.owing_tenancies,
    }),
    { billed: 0, settled: 0, outstanding: 0, pending_count: 0, occupied: 0, lettable: 0, unavailable: 0, owed_now: 0, owing_tenancies: 0 },
  );
  // Rounded to cents: the rows are exact, the sum of floats may not be.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ...t,
    billed: r2(t.billed),
    settled: r2(t.settled),
    outstanding: r2(t.outstanding),
    owed_now: r2(t.owed_now),
    collection_rate: t.billed > 0 ? Math.round((t.settled / t.billed) * 1000) / 10 : null,
  };
}

export async function getPosition(supabase: ServerClient, orgId: string, period: string): Promise<PositionRow[]> {
  const { data } = await supabase.rpc("portfolio_position", { p_org: orgId, p_period: period });
  return ((data ?? []) as unknown as PositionRow[]).map((r) => ({
    ...r,
    billed: num(r.billed),
    settled: num(r.settled),
    collection_rate: r.collection_rate === null ? null : num(r.collection_rate),
    outstanding: num(r.outstanding),
    overdue: num(r.overdue),
    owed_now: num(r.owed_now),
  }));
}

export async function getOwing(supabase: ServerClient, orgId: string, propertyId: string | null, limit = 100): Promise<OwingRow[]> {
  const { data } = await supabase.rpc("owing_tenancies", { p_org: orgId, p_property: propertyId ?? undefined, p_limit: limit });
  return ((data ?? []) as unknown as OwingRow[]).map((r) => ({ ...r, owed: num(r.owed), pending_amount: num(r.pending_amount) }));
}

/** Open follow-ups due today or earlier. Staff see theirs and unassigned ones; owners see all. */
export async function getDueFollowUps(supabase: ServerClient, orgId: string, userId: string, everyone: boolean, propertyId: string | null): Promise<DueFollowUp[]> {
  let q = supabase
    .from("rent_follow_ups")
    .select("id, kind, note, due_on, property_id, assigned_to, tenancies(unit_id, units(label), tenants(full_name))")
    .eq("org_id", orgId)
    .is("resolved_at", null)
    .lte("due_on", todayEAT())
    .order("due_on")
    .limit(50);
  if (!everyone) q = q.or(`assigned_to.eq.${userId},assigned_to.is.null`);
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data } = await q;
  return (data ?? []).map((f) => {
    const t = f.tenancies as unknown as { unit_id: string; units: { label: string } | null; tenants: { full_name: string } | null } | null;
    return {
      id: f.id,
      kind: f.kind as FollowUpKind,
      note: f.note,
      due_on: f.due_on as string,
      property_id: f.property_id,
      unit_id: t?.unit_id ?? "",
      unit_label: t?.units?.label ?? "",
      tenant_name: t?.tenants?.full_name ?? "",
      assigned_to: f.assigned_to,
    };
  });
}

export async function getReviewQueue(supabase: ServerClient, orgId: string, propertyId: string | null): Promise<ReviewItem[]> {
  let q = supabase
    .from("payment_entries")
    .select("id, amount, property_id, submitted_at, submitted_by, units(label), tenancies(tenants(full_name))")
    .eq("org_id", orgId)
    .eq("status", "awaiting_confirmation")
    .order("submitted_at")
    .limit(50);
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data } = await q;
  const ids = [...new Set((data ?? []).map((e) => e.submitted_by).filter(Boolean) as string[])];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  return (data ?? []).map((e) => ({
    id: e.id,
    amount: num(e.amount),
    property_id: e.property_id,
    unit_label: (e.units as unknown as { label: string } | null)?.label ?? "",
    tenant_name: (e.tenancies as unknown as { tenants: { full_name: string } | null } | null)?.tenants?.full_name ?? "",
    submitted_by_name: (e.submitted_by && names.get(e.submitted_by)) || null,
  }));
}

export async function getMyWork(supabase: ServerClient, ws: Workspace): Promise<WorkItem[]> {
  if (!ws.can_enter_payments) return [];
  const { data } = await supabase.rpc("my_rent_work", { p_org: ws.org_id });
  return ((data ?? []) as unknown as WorkItem[]).map((w) => ({ ...w, amount: num(w.amount) }));
}

/** Marketplace work for people who manage listings: enquiries, viewing requests, stale vacancies. */
export async function getMarketplaceWork(supabase: ServerClient, ws: Workspace) {
  if (!ws.can_manage_listings) return null;
  const orgId = ws.org_id;
  const [convs, viewings, listings] = await Promise.all([
    supabase.from("conversations").select("id, last_tenant_message_at, last_advertiser_message_at").eq("org_id", orgId).neq("follow_up", "closed").limit(200),
    supabase.from("viewing_states").select("id, status, state, requested_start, confirmed_start, listing_id, listings(ref, units(label)), properties(name)").eq("org_id", orgId).in("status", ["requested", "new_time_proposed", "confirmed"]).order("requested_start").limit(50),
    supabase.from("listings").select("id, status, availability_confirmed_at, units(label), properties(name)").eq("org_id", orgId).in("status", ["published", "draft", "needs_correction"]).limit(200),
  ]);
  const unanswered = (convs.data ?? []).filter((c) => c.last_tenant_message_at && (!c.last_advertiser_message_at || c.last_advertiser_message_at < c.last_tenant_message_at)).length;
  const list = viewingRows(viewings.data as Exclude<typeof viewings.data, null>);
  const today = todayEAT();
  return {
    unanswered,
    requests: list.filter((v) => STAFF_ACTION_STATES.includes(v.state)).length,
    todaysViewings: list.filter((v) => v.status === "confirmed" && v.confirmed_start && new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(v.confirmed_start)) === today),
    staleListings: (listings.data ?? [])
      .filter((l) => l.status === "published" && (daysSince(l.availability_confirmed_at) ?? 99) > 10)
      .map((l) => ({
        id: l.id,
        unit: (l.units as unknown as { label: string } | null)?.label ?? "",
        property: (l.properties as unknown as { name: string } | null)?.name ?? "",
        confirmedAt: l.availability_confirmed_at,
      })),
    draftListings: (listings.data ?? []).filter((l) => l.status === "draft" || l.status === "needs_correction"),
  };
}
