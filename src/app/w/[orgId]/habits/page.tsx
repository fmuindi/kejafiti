import type { Metadata } from "next";
import Link from "next/link";
import { HabitBadge, HabitDistribution, MiniStrip } from "@/components/rent/payment-habits";
import { BackLink } from "@/components/shell/back-link";
import { EmptyState, Eyebrow, cx } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth";
import { getHabits } from "@/lib/dashboard";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { HABIT, byConcern, formatDays, habitOf, type HabitKey, type HabitRow } from "@/lib/rent/habits";
import { getVisibleProperties } from "@/lib/rent/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payment habits" };

const KEYS: HabitKey[] = ["on_time", "usually", "often_late", "new"];

// How every current tenant pays over the last twelve rent months, most in need of attention
// first. Months are settled by confirmed payments, oldest charge first, like the balance.
export default async function HabitsPage({ params, searchParams }: PageProps<"/w/[orgId]/habits">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const base = `/w/${orgId}`;
  await requireWorkspace(orgId, `${base}/habits`);
  const supabase = await createClient();
  const properties = await getVisibleProperties(supabase, orgId);
  const propertyId = typeof sp.property === "string" && properties.some((p) => p.id === sp.property) ? sp.property : null;
  const show = KEYS.includes(sp.show as HabitKey) ? (sp.show as HabitKey) : sp.show === "overdue" ? "overdue" : null;
  const all = (await getHabits(supabase, orgId, propertyId)).sort(byConcern);
  const rows = all.filter((r) => (show === "overdue" ? r.overdue > 0 : show ? habitOf(r) === show : true));
  const overdue = all.filter((r) => r.overdue > 0).length;
  const href = (extra: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ property: propertyId, show, ...extra })) if (v) u.set(k, v);
    const s = u.toString();
    return `${base}/habits${s ? `?${s}` : ""}`;
  };
  const unitHref = (r: HabitRow) => `${base}/rent/${r.property_id}/units/${r.unit_id}#habits`;

  return (
    <div className="mx-auto flex max-w-wide flex-col gap-5">
      <BackLink href={base}>Home</BackLink>
      <div>
        <Eyebrow>{propertyId ? properties.find((p) => p.id === propertyId)?.name : "All properties"}</Eyebrow>
        <h1 className="heading-page mt-1">Payment habits</h1>
        <p className="mt-1 max-w-reading text-body text-muted">
          How each current tenant has paid over the last 12 rent months. A month is on time when confirmed payments dated by
          its due date cover it. Payments awaiting confirmation don&apos;t count yet.
        </p>
      </div>

      {all.length ? <HabitDistribution rows={all} hrefFor={(k) => href({ show: k })} current={show === "overdue" ? null : show} /> : null}

      <nav aria-label="Filter" className="flex flex-wrap gap-2">
        {properties.length > 1
          ? [{ id: null, name: "All properties" }, ...properties].map((p) => (
              <Chip key={p.id ?? "all"} href={href({ property: p.id })} on={p.id === propertyId}>{p.name}</Chip>
            ))
          : null}
        <Chip href={href({ show: null })} on={!show}>Everyone {all.length}</Chip>
        <Chip href={href({ show: "overdue" })} on={show === "overdue"}>Overdue now {overdue}</Chip>
        {show && show !== "overdue" ? <Chip href={href({ show })} on>{HABIT[show].label}</Chip> : null}
      </nav>

      {rows.length === 0 ? (
        <EmptyState title="Nobody in this list" icon="check">
          {all.length ? "Try another filter." : "When tenancies have rent charged, their payment habits appear here."}
        </EmptyState>
      ) : (
        <>
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => (
              <li key={r.tenancy_id}>
                <Link href={unitHref(r)} className="surface flex flex-col gap-2 p-4 hover:border-ink">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.tenant_name}</span>
                      <span className="block text-caption text-muted">Unit {r.unit_label}{propertyId ? "" : ` · ${r.property_name}`}</span>
                    </span>
                    <HabitBadge row={r} className="shrink-0" />
                  </span>
                  <MiniStrip recent={r.recent} />
                  <span className="text-caption text-muted">
                    {[
                      r.months_due ? `On time ${r.on_time} of ${r.months_due}` : "No months due yet",
                      r.avg_days_late !== null ? `late ${formatDays(r.avg_days_late)} on average` : null,
                      r.promises_broken ? `${r.promises_broken} missed promise${r.promises_broken === 1 ? "" : "s"}` : null,
                    ].filter(Boolean).join(" · ")}
                  </span>
                  {r.owed > 0 ? <span className="text-label font-semibold text-error">Owes {formatMoney(r.owed)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
          <div className="surface hidden overflow-x-auto md:block" tabIndex={0} role="region" aria-label="Payment habits table (scrolls sideways)">
            <table className="w-full min-w-[860px] text-label">
              <caption className="sr-only">Each current tenant&apos;s payment habit over the last 12 rent months</caption>
              <thead>
                <tr className="border-b border-line text-left font-mono text-micro text-muted">
                  <th scope="col" className="px-4 py-2 font-medium">Tenant</th>
                  <th scope="col" className="px-3 py-2 font-medium">Habit</th>
                  <th scope="col" className="px-3 py-2 font-medium">Last 6 months</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">On time</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Avg late</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Longest</th>
                  <th scope="col" className="px-3 py-2 font-medium">Promises</th>
                  <th scope="col" className="px-3 py-2 font-medium">Last paid</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Owes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tenancy_id} className="border-b border-divider last:border-0 hover:bg-cool">
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <Link href={unitHref(r)} className="font-semibold hover:underline">{r.tenant_name}</Link>
                      <span className="block text-caption text-muted">Unit {r.unit_label}{propertyId ? "" : ` · ${r.property_name}`}</span>
                    </th>
                    <td className="px-3 py-3"><HabitBadge row={r} /></td>
                    <td className="px-3 py-3"><MiniStrip recent={r.recent} /></td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.months_due ? `${r.on_time}/${r.months_due}` : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.avg_days_late !== null ? formatDays(r.avg_days_late) : "—"}</td>
                    <td className={cx("px-3 py-3 text-right tabular-nums", r.overdue ? "font-semibold text-error" : "")}>{r.max_days_late ? formatDays(r.max_days_late) : "—"}</td>
                    <td className="px-3 py-3">
                      {r.promises_kept + r.promises_broken ? (
                        <span className={r.promises_broken ? "text-waiting-strong" : ""}>{r.promises_kept} of {r.promises_kept + r.promises_broken} kept</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{r.last_paid_on ? formatDate(r.last_paid_on, { year: false }) : "—"}</td>
                    <td className={cx("px-4 py-3 text-right font-semibold tabular-nums", r.owed > 0 ? "text-error" : "text-muted")}>{r.owed > 0 ? formatMoney(r.owed) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-caption text-muted">
        Key for the small squares: green on time, amber paid late, red overdue. Open a tenant for the full 12 months and what happened.
      </p>
    </div>
  );
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={on ? "page" : undefined} className={cx("inline-flex min-h-10 items-center rounded-full border-strong px-3.5 text-label font-semibold", on ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink")}>
      {children}
    </Link>
  );
}
