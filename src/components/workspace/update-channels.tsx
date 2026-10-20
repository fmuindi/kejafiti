import { emailConfigured } from "@/lib/delivery";

// How updates reach people, stated as it is (IMP-08). Nothing here claims a channel that
// isn't switched on. Optional email, SMS, push and digests await a product decision.
export function UpdateChannels() {
  const email = emailConfigured();
  const rows: Array<[string, string]> = [
    ["In the app", "Always on. Every update is kept here, including ones also sent another way."],
    ["Email", email ? "Only required notices: team invitations and, for platform admins, registration and onboarding alerts." : "Switched off on this server. Required notices wait here in the app."],
    ["SMS, WhatsApp, push", "Not available yet."],
    ["Email summaries", "Not available yet. Optional updates are in the app only."],
  ];
  return (
    <section aria-labelledby="channels" className="flex flex-col gap-2">
      <h2 id="channels" className="font-display text-[18px] font-bold">How you get updates</h2>
      <dl className="flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface px-4">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-2.5 text-[14px] sm:grid-cols-[180px_1fr]">
            <dt className="font-semibold">{k}</dt>
            <dd className="text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
