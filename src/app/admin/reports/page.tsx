import type { Metadata } from "next";
import Link from "next/link";
import { ReportResolve } from "@/components/admin/report-resolve";
import { EmptyState, StatusBadge } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/dates";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Listing reports" };

export default async function AdminReportsPage() {
  // Layouts and pages render in parallel, so every admin page checks for itself.
  await requirePlatformAdmin("/admin");
  const supabase = await createClient();
  const { data } = await supabase.from("listing_reports").select("id, reason, details, status, created_at, resolution_note, listings(id, ref, title)").order("created_at", { ascending: false }).limit(100);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="heading-page">Listing reports</h1>
      {(data ?? []).length === 0 ? <EmptyState title="No reports" icon="flag">Reports from tenants appear here.</EmptyState> : (
        <ul className="flex flex-col gap-3">
          {(data ?? []).map((r) => {
            const l = r.listings as unknown as { id: string; ref: string; title: string | null } | null;
            return (
              <li key={r.id} className="surface flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/admin/listings/${l?.id}`} className="link-action">{l?.ref} · {l?.title}</Link>
                  <StatusBadge tone={r.status === "open" ? "waiting" : "neutral"}>{r.status}</StatusBadge>
                </div>
                <p className="text-label"><strong>{r.reason.replaceAll("_", " ")}</strong> · {timeAgo(r.created_at)}</p>
                {r.details ? <p className="text-label text-muted">&quot;{r.details}&quot;</p> : null}
                {r.status === "open" || r.status === "reviewing" ? <ReportResolve reportId={r.id} /> : r.resolution_note ? <p className="text-caption text-muted">Resolution: {r.resolution_note}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
