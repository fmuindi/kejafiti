"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/primitives";

const QUEUES = [
  { href: "/admin/onboarding", label: "Landlord onboarding", key: "onboarding" },
  { href: "/admin", label: "Listing review", key: "listing_review", exact: true },
  { href: "/admin/reports", label: "Listing reports", key: "listing_reports" },
  { href: "/admin/support", label: "Support", key: "support_open" },
  // Failed, overdue, held or stuck: needs attention even when nothing has "failed".
  { href: "/admin/deliveries", label: "Deliveries", key: "delivery_attention" },
];
const RECORDS = [
  { href: "/admin/users", label: "Users & advertisers" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminNav({ counts }: { counts: Record<string, number> }) {
  const path = usePathname();
  const active = (href: string, exact?: boolean) => (exact ? path === href || path.startsWith("/admin/listings") : path.startsWith(href));
  const link = (href: string, label: string, count?: number, exact?: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active(href, exact) ? "page" : undefined}
      className={cx("flex min-h-11 items-center justify-between rounded-control px-3 text-body", active(href, exact) ? "bg-white font-semibold text-ink" : "text-white/85 hover:bg-white/10")}
    >
      {label}
      {count ? <span className={cx("font-mono text-caption", active(href, exact) ? "text-ink" : "text-waiting-on-dark")}>{count}</span> : null}
    </Link>
  );
  return (
    <nav aria-label="Admin" className="flex flex-col gap-4">
      <div>
        <p className="mb-1 px-3 font-mono text-micro tracking-caps text-white/60">QUEUES</p>
        <div className="flex flex-col gap-1">{QUEUES.map((q) => link(q.href, q.label, counts[q.key], q.exact))}</div>
      </div>
      <div>
        <p className="mb-1 px-3 font-mono text-micro tracking-caps text-white/60">RECORDS</p>
        <div className="flex flex-col gap-1">{RECORDS.map((r) => link(r.href, r.label))}</div>
      </div>
    </nav>
  );
}
