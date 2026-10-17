import type { NextRequest } from "next/server";
import { csvResponse } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const id = request.nextUrl.searchParams.get("tenancy") ?? "";
  const { data: t } = await supabase.from("tenancies").select("id, org_id, property_id, units(label), tenants(full_name)").eq("id", id).maybeSingle();
  if (!t) return new Response("Not found", { status: 404 });
  const log = await supabase.rpc("log_export", { p_org: t.org_id, p_property: t.property_id, p_kind: "statement_csv", p_period: null as unknown as string });
  if (log.error) return new Response(log.error.message, { status: 403 });
  const { data: lines } = await supabase.rpc("tenancy_statement", { p_tenancy: t.id });
  const unit = (t.units as unknown as { label: string } | null)?.label ?? "";
  const tenant = (t.tenants as unknown as { full_name: string } | null)?.full_name ?? "";
  return csvResponse(`statement-${unit}-${tenant}.csv`, [
    ["Tenant statement", tenant, `Unit ${unit}`],
    ["Basis", "Confirmed records only. Positive balance = owed; negative = credit."],
    [],
    ["Date", "Description", "Charge", "Payment", "Balance", "Ref"],
    ...((lines ?? []) as Array<Record<string, string | number | null>>).map((l) => [l.line_date as string, l.description as string, Number(l.charge) || "", Number(l.payment) || "", Number(l.balance), (l.ref as string) ?? ""]),
  ]);
}
