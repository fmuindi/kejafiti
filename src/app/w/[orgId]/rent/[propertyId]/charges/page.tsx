import Link from "next/link";
import { ChargesActions } from "@/components/rent/charges-actions";
import { PeriodNav, periodHref } from "@/components/rent/period-nav";
import { Icon } from "@/components/ui/icon";
import { EmptyState, Eyebrow, Notice } from "@/components/ui/primitives";
import { isOrgAdmin, requireWorkspace } from "@/lib/auth";
import { formatDate, formatPeriod, parsePeriodParam } from "@/lib/dates";
import { formatMoney, sumAmounts } from "@/lib/money";
import { getProperty } from "@/lib/rent/queries";
import { createClient } from "@/lib/supabase/server";

export default async function ChargesPage({ params, searchParams }: PageProps<"/w/[orgId]/rent/[propertyId]/charges">) {
  const { orgId, propertyId } = await params;
  const sp = await searchParams;
  const base = `/w/${orgId}/rent/${propertyId}`;
  const ws = await requireWorkspace(orgId, `${base}/charges`);
  const supabase = await createClient();
  const property = await getProperty(supabase, ws, propertyId);
  const period = parsePeriodParam(sp.period);
  const { data, error } = await supabase.rpc("preview_rent_charges", { p_property: propertyId, p_period: period });
  const rows = (data ?? []) as Array<{ tenancy_id: string; unit_id: string; unit_label: string; tenant_name: string; amount: number; due_date: string; already_exists: boolean }>;
  const toCreate = rows.filter((r) => !r.already_exists && r.amount);
  const canCreate = ws.can_manage_tenancies || ws.can_confirm;

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5">
      <Link href={base} className="inline-flex min-h-11 items-center gap-1 self-start font-semibold">
        <Icon name="chevronLeft" /> {property.name}
      </Link>
      <div>
        <Eyebrow>Rent charges</Eyebrow>
        <h1 className="mt-1 font-display text-[28px] font-bold">Review {formatPeriod(period)} charges</h1>
        <p className="mt-1 text-[14px] text-muted">
          Each current tenancy is charged its rent for the period, using the rate in effect on the first day. Check this list before
          creating the charges. Vacant units are never charged.
        </p>
      </div>
      <PeriodNav period={period} hrefFor={periodHref(`${base}/charges`)} />
      {error ? (
        <Notice tone="error" role="alert" title="We couldn't load the preview.">Reload to try again.</Notice>
      ) : rows.length === 0 ? (
        <EmptyState title="No tenancies in this period" icon="file">Set up tenancies on the units first.</EmptyState>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {rows.map((r) => (
              <li key={r.tenancy_id} className="flex items-center justify-between gap-3 px-4 py-3 text-[14.5px]">
                <span>
                  <span className="font-mono">{r.unit_label}</span> · {r.tenant_name}
                  <span className="block text-[13px] text-muted">Due {formatDate(r.due_date)}</span>
                </span>
                <span className="text-right">
                  <span className="font-mono font-medium">{formatMoney(r.amount)}</span>
                  <span className={`block text-[12.5px] font-semibold ${r.already_exists ? "text-success" : "text-waiting"}`}>
                    {r.already_exists ? "Created" : "Not created yet"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[14px]">
            {toCreate.length
              ? `${toCreate.length} charge${toCreate.length === 1 ? "" : "s"} to create · ${formatMoney(sumAmounts(toCreate.map((r) => r.amount)))}`
              : "All charges for this period exist."}
          </p>
        </>
      )}
      <ChargesActions
        orgId={orgId}
        propertyId={propertyId}
        period={period}
        count={toCreate.length}
        canCreate={canCreate}
        autoCharges={property.auto_charges}
        canToggleAuto={isOrgAdmin(ws)}
      />
    </div>
  );
}
