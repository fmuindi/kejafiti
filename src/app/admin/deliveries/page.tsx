import type { Metadata } from "next";
import { RetryButton } from "@/components/admin/retry-button";
import { Notice, StatusBadge } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/dates";
import { emailConfigured } from "@/lib/delivery";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Deliveries" };

// Queued means waiting; accepted means the provider took it. Neither proves receipt.
export default async function DeliveriesPage() {
  // Layouts and pages render in parallel, so every admin page checks for itself.
  await requirePlatformAdmin("/admin");
  const supabase = await createClient();
  const { data } = await supabase.from("delivery_tasks").select("id, template, channel, destination, status, attempts, last_error, provider_ref, created_at, updated_at").order("created_at", { ascending: false }).limit(100);
  const mask = (d: string) => d.replace(/^(.).*(@.*)$/, "$1•••$2");
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[34px] font-bold tracking-[-1px]">Deliveries</h1>
      {!emailConfigured() ? <Notice tone="waiting" title="No email provider configured">Tasks stay queued until RESEND_API_KEY and SUPABASE_SECRET_KEY are set and the worker runs. Nothing is lost.</Notice> : null}
      <div className="overflow-x-auto rounded-[18px] border border-line bg-surface">
        <table className="w-full min-w-[760px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[12px] text-muted uppercase">
              {["Message", "To", "Status", "Attempts", "Updated", ""].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((t) => (
              <tr key={t.id} className="border-b border-divider last:border-0">
                <td className="px-4 py-3">{t.template.replaceAll("_", " ")} · {t.channel}{t.last_error ? <span className="block text-[12.5px] text-error">{t.last_error}</span> : null}</td>
                <td className="px-4 py-3 font-mono text-[13px]">{mask(t.destination)}</td>
                <td className="px-4 py-3"><StatusBadge tone={t.status === "failed" ? "error" : t.status === "accepted" || t.status === "delivered" ? "success" : "waiting"}>{t.status}</StatusBadge></td>
                <td className="px-4 py-3 font-mono">{t.attempts}</td>
                <td className="px-4 py-3">{formatDateTime(t.updated_at)}</td>
                <td className="px-4 py-3">{t.status === "failed" ? <RetryButton taskId={t.id} /> : null}</td>
              </tr>
            ))}
            {(data ?? []).length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">No delivery tasks yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
