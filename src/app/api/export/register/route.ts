import type { NextRequest } from "next/server";
import { csvResponse } from "@/lib/csv";
import { formatPeriod, parsePeriodParam } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const property = request.nextUrl.searchParams.get("property") ?? "";
  const period = parsePeriodParam(request.nextUrl.searchParams.get("period") ?? undefined);
  const { data: p } = await supabase.from("properties").select("id, org_id, name").eq("id", property).maybeSingle();
  if (!p) return new Response("Not found", { status: 404 });
  // Export permission is checked (and the export audited) in the database.
  const log = await supabase.rpc("log_export", { p_org: p.org_id, p_property: p.id, p_kind: "register_csv", p_period: period });
  if (log.error) return new Response(log.error.message, { status: 403 });
  const { data: rows } = await supabase.rpc("rent_register", { p_property: p.id, p_period: period });
  const { data: s } = await supabase.rpc("rent_summary", { p_org: p.org_id, p_property: p.id, p_period: period });
  const sum = (s ?? [])[0];
  return csvResponse(`${p.name}-${period.slice(0, 7)}-rent-register.csv`, [
    ["Property", p.name],
    ["Rent period", formatPeriod(period)],
    ["Basis", "Confirmed by property staff. Pending entries are not counted."],
    ["Generated", new Date().toISOString()],
    ["Rent billed", sum?.billed ?? 0, "Confirmed", sum?.settled ?? 0, "Collection rate %", sum?.collection_rate ?? "N/A", "Outstanding", sum?.outstanding ?? 0],
    [],
    ["Unit", "Tenant", "Tenancy", "Billed", "Confirmed", "Outstanding", "Status", "Overdue", "Pending amount", "Credit"],
    ...((rows ?? []) as Array<Record<string, unknown>>).map((r) => [
      r.unit_label as string, (r.tenant_name as string) ?? "", (r.tenancy_status as string) ?? "", Number(r.billed), Number(r.confirmed), Number(r.outstanding),
      r.rent_status as string, r.overdue ? "yes" : "no", Number(r.pending_amount), Number(r.credit),
    ]),
  ]);
}
