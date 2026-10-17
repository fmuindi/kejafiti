import "server-only";
import { notFound } from "next/navigation";
import type { ServerClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/auth";
import type { RentStatus } from "./status";

export type RegisterRow = {
  unit_id: string;
  unit_label: string;
  occupancy: string;
  layout: string;
  tenancy_id: string | null;
  tenancy_status: string | null;
  tenant_name: string | null;
  billed: number;
  confirmed: number;
  outstanding: number;
  due_date: string | null;
  rent_status: RentStatus;
  overdue: boolean;
  pending_count: number;
  pending_amount: number;
  pending_by: string | null;
  credit: number;
  last_confirmed_at: string | null;
  last_confirmed_by: string | null;
  charge_ids: string[];
};

export type Summary = {
  billed: number;
  settled: number;
  collection_rate: number | null;
  outstanding: number;
  overdue: number;
  pending_count: number;
  pending_amount: number;
  occupied: number;
  lettable: number;
  unavailable: number;
  units_total: number;
  computed_at: string;
};

/** Loads a property the user can see (RLS) and the user's effective permissions on it. */
export async function getProperty(supabase: ServerClient, ws: Workspace, propertyId: string) {
  const { data } = await supabase
    .from("properties")
    .select("id, org_id, name, area, town, road, rent_due_day, evidence_policy, auto_charges, building_style")
    .eq("id", propertyId)
    .eq("org_id", ws.org_id)
    .maybeSingle();
  if (!data) notFound();
  const assigned = ws.all_properties || ws.property_ids.includes(propertyId);
  if (!assigned) notFound();
  return data;
}

export async function getVisibleProperties(supabase: ServerClient, orgId: string) {
  const { data } = await supabase
    .from("properties")
    .select("id, name, area, archived_at")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("name");
  return data ?? [];
}

export async function getRegister(supabase: ServerClient, propertyId: string, period: string) {
  const { data, error } = await supabase.rpc("rent_register", { p_property: propertyId, p_period: period });
  return { rows: (data ?? []) as unknown as RegisterRow[], error };
}

export async function getSummary(supabase: ServerClient, orgId: string, propertyId: string | null, period: string) {
  const { data, error } = await supabase.rpc("rent_summary", {
    p_org: orgId,
    // null = all of the user's properties in this workspace (RLS limits the set)
    p_property: propertyId as string,
    p_period: period,
  });
  const row = ((data ?? []) as unknown as Summary[])[0];
  return { summary: row ?? null, error };
}

/** Open (unsettled) charges for a tenancy, plus confirmed allocations so far. */
export async function getOpenCharges(supabase: ServerClient, tenancyId: string) {
  const { data: charges } = await supabase
    .from("rent_charges")
    .select("id, category, period_start, due_date, amount, description, charge_adjustments(amount), allocations(amount)")
    .eq("tenancy_id", tenancyId)
    .order("due_date");
  return (charges ?? []).map((c) => {
    const adj = (c.charge_adjustments ?? []).reduce((s: number, a: { amount: number }) => s + Number(a.amount), 0);
    const alloc = (c.allocations ?? []).reduce((s: number, a: { amount: number }) => s + Number(a.amount), 0);
    return {
      id: c.id,
      category: c.category,
      periodStart: c.period_start,
      dueDate: c.due_date,
      net: Math.round((Number(c.amount) + adj) * 100) / 100,
      confirmed: Math.round(alloc * 100) / 100,
      description: c.description,
    };
  });
}
