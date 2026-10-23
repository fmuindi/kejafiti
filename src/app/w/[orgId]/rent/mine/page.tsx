import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth";
import { formatDate, timeAgo } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "My entries" };

// The signed-in person's own rent work (IMP-16), grouped by who has to act next. Same
// definition as the Team page's open work and the overview counts (my_rent_work).
const GROUPS = [
  { key: "returned", title: "Returned to you", help: "A manager sent these back with a reason. Correct them and submit again.", action: "Fix and resubmit" },
  { key: "drafts", title: "Your saved drafts", help: "Saved to the workspace but not submitted yet.", action: "Continue" },
  { key: "submitted", title: "Submitted, waiting for a manager", help: "Nothing for you to do. They count only once a manager confirms them.", action: "View" },
] as const;

export default async function MyEntriesPage({ params }: PageProps<"/w/[orgId]/rent/mine">) {
  const { orgId } = await params;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/rent/mine`);
  if (!ws.can_enter_payments) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_rent_work", { p_org: orgId });
  const rows = data ?? [];
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5">
      <PageHeader icon="inbox" title="My entries" />
      {error ? (
        <p role="alert" className="text-error">We couldn&apos;t load your entries. Reload to try again.</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing waiting on you" icon="check">
          Entries you save, submit or get back for correction appear here. Unsent entries kept only on a device are not included.
        </EmptyState>
      ) : (
        GROUPS.map((g) => {
          const items = rows.filter((r) => r.grp === g.key);
          return (
            <section key={g.key} id={g.key} aria-labelledby={`h-${g.key}`} className="scroll-mt-20">
              <h2 id={`h-${g.key}`} className="font-display text-[20px] font-bold">
                {g.title} <span className="font-mono text-[15px] text-muted">{items.length}</span>
              </h2>
              <p className="text-[13.5px] text-muted">{g.help}</p>
              {items.length ? (
                <ul className="mt-2 flex flex-col divide-y divide-divider overflow-hidden rounded-[16px] border border-line bg-surface">
                  {items.map((r) => {
                    const href = g.key === "submitted" ? `/w/${orgId}/rent/${r.property_id}/entries/${r.entry_id}` : `/w/${orgId}/rent/${r.property_id}/record?tenancy=${r.tenancy_id}&entry=${r.entry_id}`;
                    return (
                      <li key={r.entry_id}>
                        <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-cool">
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">
                              {r.ref} · Unit {r.unit_label} · {formatMoney(Number(r.amount))}
                            </span>
                            <span className="block text-[13px] text-muted">
                              {r.property_name} · paid {formatDate(r.paid_on)} · updated {timeAgo(r.updated_at)}
                            </span>
                            {g.key === "returned" && r.decision_reason ? <span className="mt-1 block text-[13.5px] text-error">&quot;{r.decision_reason}&quot;</span> : null}
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-semibold text-primary">
                            {g.action} <Icon name="chevronRight" size={16} />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 rounded-[14px] border border-dashed border-line bg-surface p-3 text-[14px] text-muted">None.</p>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
