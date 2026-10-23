import type { Metadata } from "next";
import Link from "next/link";
import { OnboardingQuick } from "@/components/admin/onboarding-quick";
import { RetryButton } from "@/components/admin/retry-button";
import { EmptyState, Eyebrow, buttonClass } from "@/components/ui/primitives";
import { formatAmount } from "@/lib/money";
import { timeAgo } from "@/lib/dates";
import { ADVERTISER_ROLE_LABEL, PRICE_BASIS_LABEL } from "@/lib/listing/catalog";
import { requirePlatformAdmin } from "@/lib/auth";
import { emailProvider } from "@/lib/delivery";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Listing review" };

export default async function AdminReviewPage() {
  // Layouts and pages render in parallel, so every admin page checks for itself.
  await requirePlatformAdmin("/admin");
  const supabase = await createClient();
  const [{ data: queue }, { data: counts }, { data: regs }, { data: orgs }, { data: fails }, { data: healthData }] = await Promise.all([
    supabase.rpc("admin_review_queue"),
    supabase.rpc("admin_queue_counts"),
    supabase.rpc("admin_recent_registrations", { p_limit: 6 }),
    supabase.rpc("admin_onboarding_queue"),
    supabase.from("delivery_tasks").select("id, template, channel, destination, last_error, status, updated_at").in("status", ["failed"]).order("updated_at", { ascending: false }).limit(5),
    supabase.rpc("admin_delivery_health"),
  ]);
  const h = (healthData ?? {}) as Record<string, number | null>;
  const deliveryIssues = [
    Number(h.overdue) ? `${h.overdue} overdue (oldest due ${h.oldest_due_minutes} min ago)` : null,
    Number(h.held) ? `${h.held} held because they're older than ${h.max_age_hours} h` : null,
    Number(h.stuck) ? `${h.stuck} stuck mid-send` : null,
  ].filter(Boolean) as string[];
  const provider = emailProvider();
  const c = (counts ?? {}) as Record<string, number>;
  const newOrgs = (orgs ?? []).filter((o) => o.onboarding_status === "new").slice(0, 4);

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
      <section aria-labelledby="lr" className="min-w-0">
        <Eyebrow>{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date())} EAT</Eyebrow>
        <h1 id="lr" className="mt-1 font-display text-[2.125rem] font-bold tracking-[-1px] md:text-[2.5rem]">Listing review</h1>
        <dl className="mt-4 grid grid-cols-2 divide-divider rounded-[18px] border border-line bg-surface sm:grid-cols-4 sm:divide-x">
          {[["Oldest in queue", c.oldest_review_hours ? `${Math.round(c.oldest_review_hours)} h` : "—", c.oldest_review_hours > 24], ["Submitted today", c.submitted_today ?? 0, false], ["Sent back for correction", c.sent_back ?? 0, false], ["Published today", c.published_today ?? 0, false]].map(([k, v, warn]) => (
            <div key={k as string} className="p-4">
              <dd className={`font-display text-[1.625rem] font-bold ${warn ? "text-waiting" : ""}`}>{v as string}</dd>
              <dt className="text-[0.8125rem] text-muted">{k as string}</dt>
            </div>
          ))}
        </dl>
        {(queue ?? []).length === 0 ? (
          <div className="mt-5"><EmptyState title="Nothing waiting for review" icon="check">Submitted listings appear here, oldest first.</EmptyState></div>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-[18px] border border-line bg-surface" tabIndex={0} role="region" aria-label="Listings waiting for review (scrolls sideways)">
            <table className="w-full min-w-[720px] text-[0.875rem]">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[0.75rem] text-muted uppercase">
                  {["Listing", "Advertiser", "Flags", "Waiting", ""].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(queue ?? []).map((l) => (
                  <tr key={l.id} className="border-b border-divider last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{l.title} · {l.area}</p>
                      <p className="font-mono text-[0.78125rem] text-muted">{l.ref} · KES {formatAmount(Number(l.rent_amount))}{PRICE_BASIS_LABEL[l.price_basis] ? ` ${PRICE_BASIS_LABEL[l.price_basis]}` : ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{l.org_name}</p>
                      <p className="text-[0.78125rem] text-muted">{ADVERTISER_ROLE_LABEL[l.advertiser_role]} · {l.identity_checked_at ? "identity checked" : "identity pending"}{l.advertiser_role !== "owner" ? (l.authority_checked_at ? " · authority checked" : " · authority not checked") : ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      {((l.flags as string[]) ?? []).length ? (
                        <ul className="text-[0.8125rem] font-semibold text-waiting">{(l.flags as string[]).map((f) => <li key={f}>{f}</li>)}</ul>
                      ) : <span className="text-muted">No flags</span>}
                    </td>
                    <td className="px-4 py-3 font-mono">{timeAgo(l.submitted_at).replace(" ago", "")}</td>
                    <td className="px-4 py-3"><Link href={`/admin/listings/${l.id}`} className={buttonClass("secondary", "sm")}>Review</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="flex flex-col gap-6">
        <section aria-labelledby="reg">
          <h2 id="reg" className="mb-2 font-display text-[1.25rem] font-bold">New registrations</h2>
          <ul className="flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {newOrgs.map((o) => (
              <li key={o.org_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold">{o.name} · {o.kind === "agency" ? "agent" : "landlord"}</span>
                  <span className="text-[0.78125rem] text-muted">{timeAgo(o.created_at)}{o.assignee_name ? ` · onboarding with ${o.assignee_name}` : ""}</span>
                </span>
                {!o.assignee_id ? <OnboardingQuick orgId={o.org_id} /> : null}
              </li>
            ))}
            <li className="px-4 py-3 text-[0.84375rem] text-muted">
              {(regs ?? []).length} recent account{(regs ?? []).length === 1 ? "" : "s"} · <Link href="/admin/users" className="font-semibold text-ink underline">see all</Link>
            </li>
          </ul>
        </section>
        <section aria-labelledby="fail">
          <h2 id="fail" className="mb-2 font-display text-[1.25rem] font-bold">Deliveries</h2>
          {!provider ? (
            <p className="mb-2 rounded-[16px] border border-line bg-surface p-4 text-[0.875rem]"><strong>Email is switched off.</strong> Messages stay queued until a provider is configured. <Link href="/admin/deliveries" className="font-semibold underline">Details</Link></p>
          ) : null}
          {deliveryIssues.length ? (
            <div role="alert" className="mb-2 rounded-[16px] border-[1.5px] border-error bg-surface p-4 text-[0.875rem]">
              <p className="font-semibold text-error">Messages need attention</p>
              <ul className="mt-1 list-disc pl-5">{deliveryIssues.map((i) => <li key={i}>{i}</li>)}</ul>
              <Link href="/admin/deliveries" className="mt-1 inline-flex min-h-11 items-center font-semibold underline">Open deliveries</Link>
            </div>
          ) : null}
          {(fails ?? []).length === 0 ? (
            <p className="rounded-[16px] border border-dashed border-line bg-surface p-4 text-[0.875rem] text-muted">No failed deliveries.{deliveryIssues.length ? "" : ` ${Number(h.due ?? 0) + Number(h.scheduled ?? 0)} waiting to send, none overdue.`}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
              {(fails ?? []).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block font-semibold">{f.template.replaceAll("_", " ")} · {f.channel} failed</span>
                    <span className="block truncate text-[0.78125rem] text-muted">{f.last_error}</span>
                  </span>
                  <RetryButton taskId={f.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
