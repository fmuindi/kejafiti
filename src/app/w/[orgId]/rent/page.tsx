import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, EmptyState, Eyebrow, PageTitle } from "@/components/ui/primitives";
import { isOrgAdmin, requireWorkspace } from "@/lib/auth";
import { currentPeriod, formatPeriod } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getSummary, getVisibleProperties } from "@/lib/rent/queries";
import { formatRate } from "@/lib/rent/status";
import { createClient } from "@/lib/supabase/server";

export default async function RentIndex({ params }: PageProps<"/w/[orgId]/rent">) {
  const { orgId } = await params;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/rent`);
  const supabase = await createClient();
  const properties = await getVisibleProperties(supabase, orgId);
  if (properties.length === 1) redirect(`/w/${orgId}/rent/${properties[0].id}`);
  const period = currentPeriod();
  const summaries = await Promise.all(properties.map((p) => getSummary(supabase, orgId, p.id, period)));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Eyebrow>Rent records · {formatPeriod(period)}</Eyebrow>
        <PageTitle className="mt-1">Choose a property</PageTitle>
        <p className="mt-2 max-w-2xl text-[14.5px] text-muted">
          Tenants pay through each property&apos;s existing arrangements. Staff check payments outside nyumbani, then record and
          confirm them here.
        </p>
      </div>
      {ws.can_confirm ? (
        <Link href={`/w/${orgId}/rent/inbox`} className="flex min-h-[56px] items-center gap-3 rounded-[16px] border border-[#f0d9ad] bg-waiting-tint px-4 font-semibold text-waiting-strong">
          <Icon name="inbox" /> Open the confirmation inbox <Icon name="chevronRight" className="ml-auto" />
        </Link>
      ) : null}
      {properties.length === 0 ? (
        <EmptyState
          title="No properties yet"
          icon="building"
          action={isOrgAdmin(ws) ? <ButtonLink href={`/w/${orgId}/properties/new`}>Add a property</ButtonLink> : undefined}
        >
          {isOrgAdmin(ws)
            ? "Add a property and its units, then set up current tenancies to start recording rent."
            : "You haven't been assigned to a property yet. Ask the workspace owner to assign one."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {properties.map((p, i) => {
            const s = summaries[i].summary;
            return (
              <li key={p.id}>
                <Link href={`/w/${orgId}/rent/${p.id}`} className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-4 hover:border-ink">
                  <span className="flex items-center justify-between">
                    <span className="font-display text-[19px] font-bold">{p.name}</span>
                    <Icon name="chevronRight" className="text-muted" />
                  </span>
                  <span className="text-[13.5px] text-muted">{p.area}</span>
                  {s ? (
                    <span className="text-[14px]">
                      <strong>{formatMoney(s.settled)}</strong> confirmed of {formatMoney(s.billed)} billed ·{" "}
                      {formatRate(s.collection_rate)}
                      {s.pending_count ? (
                        <span className="mt-1 block font-semibold text-waiting">
                          {s.pending_count} awaiting confirmation · {formatMoney(s.pending_amount)}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
