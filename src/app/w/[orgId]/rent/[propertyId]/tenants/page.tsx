import type { Metadata } from "next";
import { BackLink } from "@/components/shell/back-link";
import { TenantsBoard, type TenantRow } from "@/components/rent/tenants-board";
import { Eyebrow, Notice } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth";
import { addMonths, currentPeriod, parsePeriodParam, periodParam } from "@/lib/dates";
import { emailConfigured } from "@/lib/delivery";
import { getProperty } from "@/lib/rent/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tenants" };

// A property's tenants in one place: who has an email and online access, who owes, and when
// each was last contacted. Select some to send invoices, reminders or a message, or to invite
// them to see their records online.
export default async function TenantsPage({ params, searchParams }: PageProps<"/w/[orgId]/rent/[propertyId]/tenants">) {
  const { orgId, propertyId } = await params;
  const base = `/w/${orgId}/rent/${propertyId}`;
  const period = parsePeriodParam((await searchParams).period);
  const ws = await requireWorkspace(orgId, `${base}/tenants`);
  const supabase = await createClient();
  const property = await getProperty(supabase, ws, propertyId);
  const { data, error } = await supabase.rpc("property_tenants", { p_property: propertyId });
  const rows = ((data ?? []) as unknown as TenantRow[]).map((r) => ({ ...r, balance: Number(r.balance) }));
  const current = rows.filter((r) => r.status === "active");
  const owing = rows.filter((r) => r.balance > 0).length;
  const online = current.filter((r) => r.access === "linked").length;
  // The invoice month: this month, the next, and the five before.
  const now = currentPeriod();
  const periods = [addMonths(now, 1), now, ...[1, 2, 3, 4, 5].map((n) => addMonths(now, -n))];

  return (
    <div className="mx-auto flex max-w-standard flex-col gap-5">
      <BackLink href={`${base}?period=${periodParam(period)}`}>{property.name}</BackLink>
      <div>
        <Eyebrow>{property.name}</Eyebrow>
        <h1 className="heading-page mt-1">Tenants</h1>
        <p className="mt-1 text-body text-muted">
          {current.length} current · {owing} owe rent · {online} see their records online
        </p>
      </div>
      {!emailConfigured() ? (
        <Notice tone="waiting" title="Email is switched off">
          Invoices, reminders and messages are kept and shown to tenants with online access, and their emails wait until email is set up.
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="error" role="alert">We couldn&apos;t load the tenants. Reload to try again.</Notice>
      ) : (
        <TenantsBoard
          orgId={orgId}
          propertyId={propertyId}
          rows={rows}
          periods={periods}
          defaultPeriod={periods.includes(period) ? period : now}
          canManage={ws.can_manage_tenancies}
        />
      )}
    </div>
  );
}
