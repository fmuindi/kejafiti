import type { Metadata } from "next";
import Link from "next/link";
import { OnboardingQuick } from "@/components/admin/onboarding-quick";
import { RetryButton } from "@/components/admin/retry-button";
import { EmptyState, Eyebrow, Notice, buttonClass } from "@/components/ui/primitives";
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
  // Live listings held for an edit (re-review) look like new submissions in the queue; mark them.
  const ids = (queue ?? []).map((l) => l.id);
  const { data: held } = ids.length ? await supabase.from("listings").select("id").in("id", ids).not("pending_edit", "is", null) : { data: [] };
  const edited = new Set((held ?? []).map((h) => h.id));
  const newOrgs = (orgs ?? []).filter((o) => o.onboarding_status === "new").slice(0, 4);

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
      <section aria-labelledby="lr" className="min-w-0">
        <Eyebrow>{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date())} EAT</Eyebrow>
        <h1 id="lr" className="heading-page mt-1">Listing review</h1>
        <dl className="surface mt-4 grid grid-cols-2 divide-divider sm:grid-cols-4 sm:divide-x">
          {[["Oldest in queue", c.oldest_review_hours ? `${Math.round(c.oldest_review_hours)} h` : "—", c.oldest_review_hours > 24], ["Submitted today", c.submitted_today ?? 0, false], ["Sent back for correction", c.sent_back ?? 0, false], ["Published today", c.published_today ?? 0, false]].map(([k, v, warn]) => (
            <div key={k as string} className="p-4">
              <dd className={`font-display text-title-lg font-bold ${warn ? "text-waiting" : ""}`}>{v as string}</dd>
              <dt className="text-caption text-muted">{k as string}</dt>
            </div>
          ))}
        </dl>
        {(queue ?? []).length === 0 ? (
          <div className="mt-5"><EmptyState title="Nothing waiting for review" icon="check">Submitted listings appear here, oldest first.</EmptyState></div>
        ) : (
          <div className="surface mt-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Listings waiting for review (scrolls sideways)">
            <table className="w-full min-w-[720px] text-label">
              <thead>
                <tr className="border-b border-line text-left font-mono text-micro text-muted uppercase">
                  {["Listing", "Advertiser", "Flags", "Waiting", ""].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(queue ?? []).map((l) => (
                  <tr key={l.id} className="border-b border-divider last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{l.title} · {l.area}{edited.has(l.id) ? <span className="ml-2 rounded-full bg-waiting-tint px-2 py-0.5 text-micro text-waiting-strong">Edited after publishing</span> : null}</p>
                      <p className="tabular-nums text-caption text-muted">{l.ref} · KES {formatAmount(Number(l.rent_amount))}{PRICE_BASIS_LABEL[l.price_basis] ? ` ${PRICE_BASIS_LABEL[l.price_basis]}` : ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{l.org_name}</p>
                      <p className="text-caption text-muted">{ADVERTISER_ROLE_LABEL[l.advertiser_role]} · {l.identity_checked_at ? "identity checked" : "identity pending"}{l.advertiser_role !== "owner" ? (l.authority_checked_at ? " · authority checked" : " · authority not checked") : ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      {((l.flags as string[]) ?? []).length ? (
                        <ul className="text-caption font-semibold text-waiting">{(l.flags as string[]).map((f) => <li key={f}>{f}</li>)}</ul>
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
          <h2 id="reg" className="heading-section mb-2">New registrations</h2>
          <ul className="surface-list">
            {newOrgs.map((o) => (
              <li key={o.org_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold">{o.name} · {o.kind === "agency" ? "agent" : "landlord"}</span>
                  <span className="text-caption text-muted">{timeAgo(o.created_at)}{o.assignee_name ? ` · onboarding with ${o.assignee_name}` : ""}</span>
                </span>
                {!o.assignee_id ? <OnboardingQuick orgId={o.org_id} /> : null}
              </li>
            ))}
            <li className="px-4 py-3 text-label text-muted">
              {(regs ?? []).length} recent account{(regs ?? []).length === 1 ? "" : "s"} · <Link href="/admin/users" className="link-action">see all</Link>
            </li>
          </ul>
        </section>
        <section aria-labelledby="fail">
          <h2 id="fail" className="heading-section mb-2">Deliveries</h2>
          {!provider ? (
            <Notice tone="waiting" className="mb-2" title="Email is switched off">Messages stay queued until a provider is configured. <Link href="/admin/deliveries" className="link-action">Details</Link></Notice>
          ) : null}
          {deliveryIssues.length ? (
            <Notice tone="error" role="alert" className="mb-2" title="Messages need attention" action={<Link href="/admin/deliveries" className="link-action">Open deliveries</Link>}>
              <ul className="list-disc pl-5">{deliveryIssues.map((i) => <li key={i}>{i}</li>)}</ul>
            </Notice>
          ) : null}
          {(fails ?? []).length === 0 ? (
            <p className="surface-empty p-4">No failed deliveries.{deliveryIssues.length ? "" : ` ${Number(h.due ?? 0) + Number(h.scheduled ?? 0)} waiting to send, none overdue.`}</p>
          ) : (
            <ul className="surface-list">
              {(fails ?? []).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block font-semibold">{f.template.replaceAll("_", " ")} · {f.channel} failed</span>
                    <span className="block truncate text-caption text-muted">{f.last_error}</span>
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
