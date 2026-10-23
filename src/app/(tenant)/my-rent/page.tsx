import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { TenantJumps } from "@/components/shell/tenant-jumps";
import { Icon } from "@/components/ui/icon";
import { EmptyState, cx } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { balanceWords, getMyTenancies } from "@/lib/my-rent";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My rent" };

export default async function MyRentPage() {
  await requireUser("/my-rent");
  const tenancies = await getMyTenancies(await createClient());

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-5 px-4 pt-5 pb-10">
      <PageHeader icon="wallet" title="My rent" meta={tenancies.length ? "Shared by your landlord or agent · confirmed records only" : null} />
      <TenantJumps current="/my-rent" />
      {tenancies.length === 0 ? (
        <EmptyState title="No tenancy linked yet" icon="wallet">
          When your landlord or agent shares your tenancy on nyumbani, you&apos;ll get an email with a link. Open it while signed in with
          that email, and your rent and statement appear here.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {tenancies.map((t) => {
            const b = balanceWords(t.balance);
            return (
              <li key={t.tenancy_id}>
                <Link href={`/my-rent/${t.tenancy_id}`} className="surface flex flex-col gap-3 p-4 hover:border-ink">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-title-sm font-bold">{t.property_name} · Unit {t.unit_label}</p>
                      <p className="text-label text-muted">
                        {[t.area, t.org_name].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Icon name="arrowRight" size={20} className="mt-1 shrink-0 text-primary" />
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <p className="text-label text-muted">
                      {t.status === "active"
                        ? `${t.current_rent ? `${formatMoney(t.current_rent)} a month · ` : ""}due on day ${t.due_day}`
                        : `Ended ${formatDate(t.end_date)}`}
                    </p>
                    <p className="text-right">
                      <span className="block text-caption text-muted">{b.label}</span>
                      <span className={cx("font-display text-title font-extrabold", b.tone === "owed" ? "text-error" : "text-success")}>
                        {formatMoney(Math.abs(t.balance))}
                      </span>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-caption text-muted">
        nyumbani never collects rent. Pay through your property&apos;s usual arrangements; a payment shows here once your landlord or agent
        has checked and confirmed it. If something looks wrong, message them.
      </p>
    </div>
  );
}
