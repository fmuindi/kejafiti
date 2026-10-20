import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, StatusBadge, cx } from "@/components/ui/primitives";
import { requirePlatformAdmin } from "@/lib/auth";
import { timeAgo } from "@/lib/dates";
import { SUPPORT_STATUS, categoryLabel } from "@/lib/support";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Support" };

const TABS = [
  { key: "active", label: "Open", statuses: ["open", "in_progress"] },
  { key: "waiting", label: "Waiting on requester", statuses: ["waiting_on_you"] },
  { key: "resolved", label: "Resolved", statuses: ["resolved"] },
];

// Support queue (IMP-19): high priority first, then oldest.
export default async function SupportQueue({ searchParams }: PageProps<"/admin/support">) {
  await requirePlatformAdmin("/admin/support");
  const asked = (await searchParams).tab;
  const tab = TABS.find((t) => t.key === asked) ?? TABS[0];
  const supabase = await createClient();
  const { data } = await supabase.from("support_tickets").select("id, ref, subject, category, status, priority, assignee_id, created_at, updated_at").in("status", tab.statuses).order("created_at").limit(200);
  const rank = { high: 0, normal: 1, low: 2 } as Record<string, number>;
  const rows = [...(data ?? [])].sort((a, b) => rank[a.priority] - rank[b.priority]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[34px] font-bold tracking-[-1px]">Support</h1>
      <p className="-mt-2 text-[14px] text-muted">Requests contain only what people wrote or attached. Support gives no access to their conversations or rent records.</p>
      <nav aria-label="Support views" className="flex gap-2 border-b border-line">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/support?tab=${t.key}`} aria-current={t.key === tab.key ? "page" : undefined} className={cx("-mb-px border-b-2 px-3 py-2.5 text-[15px] font-semibold", t.key === tab.key ? "border-primary text-ink" : "border-transparent text-muted")}>{t.label}</Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="Nothing here" icon="inbox">New requests appear in Open.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-divider overflow-hidden rounded-[16px] border border-line bg-surface">
          {rows.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/support/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cool">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{t.priority === "high" ? "High · " : ""}{t.ref} · {t.subject}</span>
                  <span className="text-[13px] text-muted">{categoryLabel(t.category)} · opened {timeAgo(t.created_at)}{t.assignee_id ? "" : " · unassigned"}</span>
                </span>
                <StatusBadge tone={SUPPORT_STATUS[t.status]?.tone ?? "neutral"}>{SUPPORT_STATUS[t.status]?.label ?? t.status}</StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
