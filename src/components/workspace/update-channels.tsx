import { Icon, type IconName } from "@/components/ui/icon";
import { cx } from "@/components/ui/primitives";
import { emailConfigured } from "@/lib/delivery";

// How updates reach people, stated as it is (IMP-08). Nothing here claims a channel that
// isn't switched on. Optional email, SMS, push and digests await a product decision.
export function UpdateChannels() {
  const email = emailConfigured();
  const rows: Array<{ icon: IconName; label: string; status: string; tone: "on" | "partial" | "off" }> = [
    { icon: "bell", label: "In the app", status: "On", tone: "on" },
    { icon: "file", label: "Email", status: email ? "Invites and alerts only" : "Off", tone: email ? "partial" : "off" },
    { icon: "phone", label: "SMS, WhatsApp, push", status: "Coming soon", tone: "off" },
  ];
  return (
    <section aria-labelledby="channels" className="flex flex-col gap-2">
      <h2 id="channels" className="flex items-center gap-2 text-[0.9375rem] font-semibold text-muted">
        <Icon name="bell" size={16} /> Notifications
      </h2>
      <ul className="flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
        {rows.map((r) => (
          <li key={r.label} className="flex min-h-12 items-center gap-3 px-4 text-[0.90625rem]">
            <Icon name={r.icon} size={18} className="text-muted" />
            <span className="flex-1 font-semibold">{r.label}</span>
            <span
              className={cx(
                "rounded-full px-2.5 py-0.5 text-[0.78125rem] font-semibold",
                r.tone === "on" ? "bg-success-tint text-success" : r.tone === "partial" ? "bg-waiting-tint text-waiting-strong" : "bg-cool text-muted",
              )}
            >
              {r.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
