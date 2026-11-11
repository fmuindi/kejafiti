import type { Metadata } from "next";
import Link from "next/link";
import { OwingList } from "@/components/workspace/home";
import { BackLink } from "@/components/shell/back-link";
import { EmptyState, Eyebrow, cx } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth";
import { getOwing } from "@/lib/dashboard";
import { formatMoney, sumAmounts } from "@/lib/money";
import { getVisibleProperties } from "@/lib/rent/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Who owes" };

// The list behind every "overdue" figure: each tenancy with an unpaid, already-due balance,
// largest first, with what is already being done about it (follow-ups, reminders, submissions).
export default async function OwingPage({ params, searchParams }: PageProps<"/w/[orgId]/owing">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const base = `/w/${orgId}`;
  await requireWorkspace(orgId, `${base}/owing`);
  const supabase = await createClient();
  const properties = await getVisibleProperties(supabase, orgId);
  const propertyId = typeof sp.property === "string" && properties.some((p) => p.id === sp.property) ? sp.property : null;
  const show = sp.show === "former" ? "former" : "current";
  const all = await getOwing(supabase, orgId, propertyId, 500);
  const rows = all.filter((r) => (show === "former" ? r.tenancy_status === "ended" : r.tenancy_status === "active"));
  const total = sumAmounts(rows.map((r) => r.owed));
  const former = all.filter((r) => r.tenancy_status === "ended").length;
  const href = (extra: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const merged = { property: propertyId, show: show === "former" ? "former" : null, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    const s = u.toString();
    return `${base}/owing${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto flex max-w-standard flex-col gap-5">
      <BackLink href={base}>Home</BackLink>
      <div>
        <Eyebrow>{propertyId ? properties.find((p) => p.id === propertyId)?.name : "All properties"}</Eyebrow>
        <h1 className="heading-page mt-1">Who owes</h1>
        <p className="mt-1 text-body text-muted">
          {rows.length ? `${formatMoney(total)} overdue across ${rows.length} ${show === "former" ? "former tenanc" + (rows.length === 1 ? "y" : "ies") : "tenant" + (rows.length === 1 ? "" : "s")}.` : "Nobody in this list."}{" "}
          Charges already due, less confirmed payments and credit. Submitted payments are shown but don&apos;t count until confirmed.
        </p>
      </div>
      <nav aria-label="Filter" className="flex flex-wrap gap-2">
        {properties.length > 1
          ? [{ id: null, name: "All properties" }, ...properties].map((p) => (
              <Chip key={p.id ?? "all"} href={href({ property: p.id })} on={p.id === propertyId}>{p.name}</Chip>
            ))
          : null}
        <Chip href={href({ show: null })} on={show === "current"}>Current tenants</Chip>
        <Chip href={href({ show: "former" })} on={show === "former"}>Former tenants {former}</Chip>
      </nav>
      {rows.length ? (
        <OwingList orgId={orgId} rows={rows} showProperty={!propertyId} />
      ) : (
        <EmptyState title={show === "former" ? "No former tenant owes" : "Nobody is overdue"} icon="check">
          {show === "former" ? "Arrears stay with the tenancy they belong to; settled ones leave this list." : "When a due charge isn't covered by a confirmed payment, the tenant appears here."}
        </EmptyState>
      )}
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
