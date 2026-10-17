import type { Metadata } from "next";
import { formatDateTime } from "@/lib/dates";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  // Layouts and pages render in parallel, so every admin page checks for itself.
  await requirePlatformAdmin("/admin");
  const supabase = await createClient();
  const { data } = await supabase.from("audit_events").select("id, action, target_type, target_id, created_at, actor_id, org_id, details").order("created_at", { ascending: false }).limit(200);
  const actorIds = [...new Set((data ?? []).map((a) => a.actor_id).filter(Boolean) as string[])];
  const { data: people } = actorIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
  const who = (id: string | null) => (id ? people?.find((p) => p.id === id)?.full_name || people?.find((p) => p.id === id)?.email || "user" : "system");
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[34px] font-bold tracking-[-1px]">Audit log</h1>
      <p className="text-[14px] text-muted">Permission changes, corrections, exports and reviews. Records are append-only.</p>
      <ul className="flex flex-col divide-y divide-divider rounded-[18px] border border-line bg-surface">
        {(data ?? []).map((a) => (
          <li key={a.id} className="flex flex-wrap justify-between gap-3 px-4 py-3 text-[14px]">
            <span><strong>{a.action.replaceAll("_", " ")}</strong> · {a.target_type} · by {who(a.actor_id)}</span>
            <span className="text-muted">{formatDateTime(a.created_at)}</span>
          </li>
        ))}
        {(data ?? []).length === 0 ? <li className="px-4 py-6 text-center text-muted">No events yet.</li> : null}
      </ul>
    </div>
  );
}
