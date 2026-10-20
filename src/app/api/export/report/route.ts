import type { NextRequest } from "next/server";
import { csvResponse } from "@/lib/csv";
import { formatPeriod } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

type Snap = {
  basis: string; generated_at: string; property: { name: string }; period_start: string;
  summary: Record<string, number | null> | null;
  register: Array<Record<string, string | number | boolean | null>>;
  payments: Array<Record<string, string | number | null>>;
};

// Finalized versions export their stored snapshot, never a recalculation.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const id = request.nextUrl.searchParams.get("version") ?? "";
  const { data: v } = await supabase.from("report_versions").select("id, org_id, property_id, period_start, version, snapshot, finalized_at, notes, change_note, commentary").eq("id", id).maybeSingle();
  if (!v) return new Response("Not found", { status: 404 });
  const log = await supabase.rpc("log_export", { p_org: v.org_id, p_property: v.property_id, p_kind: "report_csv", p_period: v.period_start });
  if (log.error) return new Response(log.error.message, { status: 403 });
  const s = v.snapshot as unknown as Snap;
  return csvResponse(`${s.property.name}-${v.period_start.slice(0, 7)}-report-v${v.version}.csv`, [
    ["Monthly property summary", s.property.name, formatPeriod(v.period_start), `FINAL version ${v.version}`],
    ["Basis", s.basis],
    ["Finalized", v.finalized_at],
    ["Notes", v.notes ?? ""],
    ["Change note", v.change_note ?? ""],
    ["What changed", (v.commentary as { changes?: string } | null)?.changes ?? ""],
    ["Unresolved issues", (v.commentary as { issues?: string } | null)?.issues ?? ""],
    ["Next actions", (v.commentary as { next_actions?: string } | null)?.next_actions ?? ""],
    ["Rent billed", s.summary?.billed ?? 0, "Confirmed", s.summary?.settled ?? 0, "Collection rate %", s.summary?.collection_rate ?? "N/A", "Outstanding", s.summary?.outstanding ?? 0, "Pending (not counted)", s.summary?.pending_amount ?? 0],
    [],
    ["Unit", "Tenant", "Billed", "Confirmed", "Outstanding", "Status"],
    ...s.register.map((r) => [r.unit_label as string, (r.tenant_name as string) ?? "", Number(r.billed), Number(r.confirmed), Number(r.outstanding), r.rent_status as string]),
    [],
    ["Payment ref", "Unit", "Tenant", "Amount", "Paid on", "Recorded by", "Recorded at", "Confirmed by", "Confirmed at"],
    ...s.payments.map((p) => [p.ref as string, p.unit_label as string, p.tenant_name as string, Number(p.amount), p.paid_on as string, p.recorded_by as string, p.recorded_at as string, p.confirmed_by as string, p.confirmed_at as string]),
  ]);
}
