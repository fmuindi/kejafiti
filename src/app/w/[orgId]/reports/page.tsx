import type { Metadata } from "next";
import Link from "next/link";
import { FinalizeReport, type PreFinalize } from "@/components/rent/finalize-report";
import { PrintButton } from "@/components/rent/print-button";
import { AI } from "@/lib/ai/config";
import { ReportView, type ReportSnapshot } from "@/components/rent/report-view";
import { Icon } from "@/components/ui/icon";
import { EmptyState, Notice } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth";
import { addMonths, currentPeriod, formatDateTime, formatPeriod, parsePeriodParam, periodParam } from "@/lib/dates";
import { getVisibleProperties } from "@/lib/rent/queries";
import { formatAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Reports" };

type Summary = { billed: number; settled: number; outstanding: number; pending_count: number };

/** Totals that moved between two versions, e.g. "confirmed +5,000". */
function summaryDiff(a: Summary | null | undefined, b: Summary | null | undefined): string[] {
  if (!a || !b) return [];
  const out: string[] = [];
  for (const [k, label] of [["billed", "billed"], ["settled", "confirmed"], ["outstanding", "outstanding"]] as const) {
    const d = Number(b[k]) - Number(a[k]);
    if (d) out.push(`${label} ${d > 0 ? "+" : "−"}${formatAmount(Math.abs(d))}`);
  }
  return out;
}

export default async function ReportsPage({ params, searchParams }: PageProps<"/w/[orgId]/reports">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/reports`);
  const supabase = await createClient();
  const properties = await getVisibleProperties(supabase, orgId);
  const propertyId = typeof sp.property === "string" && properties.some((p) => p.id === sp.property) ? sp.property : properties[0]?.id;
  const period = parsePeriodParam(sp.period);
  if (!propertyId) return <EmptyState title="No properties yet" icon="chart">Reports appear once a property has rent records.</EmptyState>;

  const [{ data: draft, error }, { data: versions }, { data: pre }] = await Promise.all([
    supabase.rpc("build_report", { p_property: propertyId, p_period: period }),
    supabase.from("report_versions").select("id, version, finalized_at, prepared_by, change_note, snapshot->summary").eq("property_id", propertyId).eq("period_start", period).order("version", { ascending: false }),
    supabase.rpc("report_prefinalize", { p_property: propertyId, p_period: period }),
  ]);
  const ids = [...new Set((versions ?? []).map((v) => v.prepared_by))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const canFinalize = ws.can_confirm || ws.can_export;
  const snapshot = draft as unknown as ReportSnapshot | null;
  const pending = snapshot?.summary?.pending_count ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon="file" title="Reports" />
      <form className="flex flex-wrap items-end gap-2" aria-label="Report filters">
        <label className="flex flex-col gap-1 text-[0.8125rem] text-muted">
          Property
          <select name="property" defaultValue={propertyId} className="min-h-11 rounded-[12px] border border-line bg-surface px-3 text-[0.90625rem] font-semibold text-ink">
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[0.8125rem] text-muted">
          Period
          <select name="period" defaultValue={periodParam(period)} className="min-h-11 rounded-[12px] border border-line bg-surface px-3 text-[0.90625rem] font-semibold text-ink">
            {Array.from({ length: 12 }, (_, i) => addMonths(currentPeriod(), -i)).map((p) => <option key={p} value={periodParam(p)}>{formatPeriod(p)}</option>)}
          </select>
        </label>
        <button type="submit" className="min-h-11 rounded-[12px] bg-ink px-4 text-[0.90625rem] font-semibold text-white">Show</button>
      </form>

      {(versions ?? []).length ? (
        <section aria-labelledby="versions" className="rounded-[18px] border border-line bg-surface p-4">
          <h2 id="versions" className="font-display text-[1.125rem] font-bold">Finalized versions</h2>
          <ul className="mt-2 divide-y divide-divider">
            {(versions ?? []).map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[0.875rem]">
                <span>
                  <strong>v{v.version}</strong> · {formatDateTime(v.finalized_at)} · {people?.find((p) => p.id === v.prepared_by)?.full_name ?? "staff"}
                  {v.change_note ? <span className="block text-[0.8125rem] text-muted">Reason: &quot;{v.change_note}&quot;</span> : null}
                  {(() => {
                    // Concise change summary against the version before it (IMP-18).
                    const prev = (versions ?? []).find((x) => x.version === v.version - 1);
                    const d = summaryDiff(prev?.summary as Summary | null, v.summary as Summary | null);
                    return prev ? <span className="block text-[0.8125rem] text-muted">{d.length ? `Since v${prev.version}: ${d.join(" · ")}` : `Same totals as v${prev.version}`}</span> : null;
                  })()}
                </span>
                <span className="flex gap-3 font-semibold">
                  <Link href={`/w/${orgId}/reports/${v.id}`} className="text-primary underline">View final / PDF</Link>
                  {ws.can_export ? <a href={`/api/export/report?version=${v.id}`} className="text-primary underline">CSV</a> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.78125rem] text-muted">Finalized versions never change. A later correction produces a new version with a change note.</p>
        </section>
      ) : null}

      {error || !snapshot ? (
        <Notice tone="error" role="alert">We couldn&apos;t build this report. Reload to try again.</Notice>
      ) : (
        <>
          {pending ? <Notice tone="waiting" title={`${pending} entr${pending === 1 ? "y is" : "ies are"} still awaiting confirmation`}>Resolve them before finalizing, so the report reflects every checked payment.</Notice> : null}
          {canFinalize && pre ? (
            <FinalizeReport orgId={orgId} propertyId={propertyId} propertyName={snapshot.property.name} period={period} nextVersion={(versions?.[0]?.version ?? 0) + 1} review={pre as unknown as PreFinalize} aiCommentary={AI.assistEnabled("report_commentary")} />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[0.875rem] font-semibold">
              <Icon name="eye" size={16} /> DRAFT preview: live from confirmed records, not saved and may change
            </p>
            <PrintButton label="Print draft" />
          </div>
          <ReportView r={snapshot} meta={{ status: "Draft" }} />
        </>
      )}
    </div>
  );
}
