import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/rent/print-button";
import { ReportView, type ReportCommentary, type ReportSnapshot } from "@/components/rent/report-view";
import { Icon } from "@/components/ui/icon";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/shell/back-link";

export const metadata: Metadata = { title: "Report version" };

// A finalized version renders only from its stored, immutable snapshot. "Save as PDF" uses
// the browser's print dialog, so the PDF matches exactly what is shown.
export default async function ReportVersionPage({ params }: PageProps<"/w/[orgId]/reports/[versionId]">) {
  const { orgId, versionId } = await params;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/reports`);
  const supabase = await createClient();
  const { data: v } = await supabase.from("report_versions").select("*").eq("id", versionId).eq("org_id", orgId).maybeSingle();
  if (!v) notFound();
  const { data: who } = await supabase.from("profiles").select("full_name").eq("id", v.prepared_by).maybeSingle();
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <BackLink href={`/w/${orgId}/reports?property=${v.property_id}&period=${v.period_start.slice(0, 7)}`}>Reports</BackLink>
        <div className="flex gap-2">
          {ws.can_export ? <a href={`/api/export/report?version=${v.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] border-[1.5px] border-ink px-4 font-semibold"><Icon name="download" size={16} /> CSV of v{v.version}</a> : null}
          <PrintButton />
        </div>
      </div>
      <ReportView r={v.snapshot as unknown as ReportSnapshot} meta={{ status: `Final v${v.version}`, preparedBy: who?.full_name ?? "staff", finalizedAt: v.finalized_at, notes: v.notes, changeNote: v.change_note, commentary: v.commentary as ReportCommentary }} />
    </div>
  );
}
