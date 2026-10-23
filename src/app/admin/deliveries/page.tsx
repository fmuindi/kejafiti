import type { Metadata } from "next";
import { ProcessNowButton, RetryButton } from "@/components/admin/retry-button";
import { Notice, StatusBadge } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/dates";
import { PROVIDER_LABEL, emailProvider, enabledChannels } from "@/lib/delivery";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Deliveries" };

type Tone = "success" | "waiting" | "error" | "neutral";

// What each state means. "Handed over" means the provider accepted it; that is not proof of receipt.
const STATE: Record<string, { label: string; tone: Tone; help: string }> = {
  due: { label: "Due", tone: "waiting", help: "Waiting for the next worker run." },
  overdue: { label: "Overdue", tone: "error", help: "Due longer than expected. Is the worker running?" },
  scheduled: { label: "Scheduled", tone: "neutral", help: "Not due yet." },
  retrying: { label: "Retrying", tone: "waiting", help: "An attempt failed; another is scheduled." },
  sending: { label: "Sending", tone: "waiting", help: "A worker is sending it now." },
  stuck: { label: "Stuck", tone: "error", help: "A worker stopped mid-send. The next run takes it over." },
  held: { label: "Held · too old", tone: "error", help: "Not sent automatically because it is old. Send or cancel it." },
  accepted: { label: "Handed over", tone: "success", help: "The provider accepted it." },
  delivered: { label: "Delivered", tone: "success", help: "The provider reported delivery." },
  failed: { label: "Failed", tone: "error", help: "Stopped after a permanent error or 5 attempts." },
  cancelled: { label: "Cancelled", tone: "neutral", help: "Will not be sent." },
};

export default async function DeliveriesPage() {
  // Layouts and pages render in parallel, so every admin page checks for itself.
  await requirePlatformAdmin("/admin");
  const supabase = await createClient();
  const [{ data: rows }, { data: healthData }] = await Promise.all([supabase.rpc("admin_delivery_tasks", { p_limit: 100 }), supabase.rpc("admin_delivery_health")]);
  const h = (healthData ?? {}) as Record<string, number | null>;
  const provider = emailProvider();
  const channels = enabledChannels();
  const attention = Number(h.overdue ?? 0) + Number(h.held ?? 0) + Number(h.stuck ?? 0) + Number(h.failed ?? 0);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[2.125rem] font-bold tracking-[-1px]">Deliveries</h1>

      <section aria-labelledby="health" className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
        <h2 id="health" className="font-display text-[1.125rem] font-bold">Delivery health</h2>
        <p className="text-[0.875rem]">
          <strong>Email:</strong> {provider ? PROVIDER_LABEL[provider] : "switched off (no provider configured)"} ·{" "}
          <strong>SMS, WhatsApp, push:</strong> switched off. In-app notifications always work.
        </p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Due now", h.due ?? 0, Number(h.overdue) > 0],
            ["Oldest due", h.oldest_due_minutes == null ? "—" : `${h.oldest_due_minutes} min`, Number(h.overdue) > 0],
            ["Held · too old", h.held ?? 0, Number(h.held) > 0],
            ["Failed", h.failed ?? 0, Number(h.failed) > 0],
            ["Scheduled retries", h.scheduled ?? 0, false],
            ["Stuck sending", h.stuck ?? 0, Number(h.stuck) > 0],
            ["Handed over (24 h)", h.accepted_24h ?? 0, false],
          ].map(([k, v, warn]) => (
            <div key={k as string}>
              <dd className={`font-display text-[1.375rem] font-bold ${warn ? "text-error" : ""}`}>{String(v)}</dd>
              <dt className="text-[0.8125rem] text-muted">{k as string}</dt>
            </div>
          ))}
        </dl>
        {!provider ? (
          <Notice tone="waiting" title="Email is switched off">
            Tasks stay queued until an email provider is configured (MAILPIT_URL for local development, or RESEND_API_KEY) and SUPABASE_SECRET_KEY is set. Nothing is lost.
          </Notice>
        ) : Number(h.overdue) > 0 ? (
          <Notice tone="error" role="alert" title={`${h.overdue} message${h.overdue === 1 ? " is" : "s are"} overdue`}>
            Due for more than {h.expected_delay_minutes} minutes. The scheduled worker (POST /api/jobs/deliver) may not be running.
          </Notice>
        ) : null}
        {Number(h.held) > 0 ? (
          <p className="text-[0.84375rem] text-muted">
            Messages older than {h.max_age_hours} hours are held rather than sent automatically, so turning on a provider never replays an old backlog. Send or cancel each one below.
          </p>
        ) : null}
        {channels.includes("email") ? <ProcessNowButton /> : null}
      </section>

      <div className="overflow-x-auto rounded-[18px] border border-line bg-surface" tabIndex={0} role="region" aria-label="Delivery tasks (scrolls sideways)">
        <table className="w-full min-w-[820px] text-[0.875rem]">
          <caption className="sr-only">Delivery tasks, newest first{attention ? `. ${attention} need attention.` : ""}</caption>
          <thead>
            <tr className="border-b border-line text-left font-mono text-[0.75rem] text-muted uppercase">
              {["Message", "To", "Status", "Attempts", "Created", "Updated", "Action"].map((col) => (
                <th key={col} scope="col" className="px-4 py-2.5 font-medium">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((t) => {
              const st = STATE[t.state] ?? { label: t.state, tone: "neutral" as Tone, help: "" };
              const off = !channels.includes(t.channel) && ["due", "overdue", "scheduled", "retrying"].includes(t.state);
              return (
                <tr key={t.id} className="border-b border-divider last:border-0">
                  <td className="px-4 py-3">
                    {t.template.replaceAll("_", " ")} · {t.channel}
                    {t.last_error ? <span className="block text-[0.78125rem] text-error">{t.last_error}</span> : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-[0.8125rem]">{t.destination_masked}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={off ? "neutral" : st.tone}>{off ? "Channel switched off" : st.label}</StatusBadge>
                    <span className="mt-1 block text-[0.75rem] text-muted">{off ? "Stays queued until a provider is configured." : st.help}</span>
                  </td>
                  <td className="px-4 py-3 font-mono">{t.attempts}</td>
                  <td className="px-4 py-3">{formatDateTime(t.created_at)}</td>
                  <td className="px-4 py-3">{formatDateTime(t.updated_at)}</td>
                  <td className="px-4 py-3">
                    {t.state === "failed" ? <RetryButton taskId={t.id} allowCancel /> : t.state === "held" ? <RetryButton taskId={t.id} label="Send" allowCancel /> : null}
                  </td>
                </tr>
              );
            })}
            {(rows ?? []).length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">No delivery tasks yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
