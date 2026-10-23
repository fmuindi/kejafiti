import "server-only";
import type { ServerClient } from "@/lib/supabase/server";

// The tenant's own tenancies (tenant self-view). Labels come from public.my_tenancies(); the
// statement from public.tenancy_statement(), which row-level security limits to their own
// charges and confirmed payments.

export type MyTenancy = {
  tenancy_id: string;
  status: "active" | "ended";
  start_date: string;
  end_date: string | null;
  due_day: number;
  org_name: string;
  property_name: string;
  area: string | null;
  unit_label: string;
  current_rent: number | null;
  balance: number;
};

export type StatementLine = { line_date: string; kind: string; description: string; charge: number; payment: number; balance: number; ref: string | null };

export async function getMyTenancies(supabase: ServerClient): Promise<MyTenancy[]> {
  const { data } = await supabase.rpc("my_tenancies");
  return ((data ?? []) as unknown as MyTenancy[]).map((t) => ({ ...t, balance: Number(t.balance), current_rent: t.current_rent === null ? null : Number(t.current_rent) }));
}

/** Plain words for a balance: positive is owed, negative is credit held. */
export function balanceWords(balance: number): { label: string; tone: "owed" | "credit" | "clear" } {
  if (balance > 0) return { label: "You owe", tone: "owed" };
  if (balance < 0) return { label: "Credit in your favour", tone: "credit" };
  return { label: "All paid up", tone: "clear" };
}
