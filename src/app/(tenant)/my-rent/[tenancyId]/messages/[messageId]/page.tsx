import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/rent/print-button";
import { TenantMessageView } from "@/components/rent/tenant-message-view";
import { BackLink } from "@/components/shell/back-link";
import { requireUser } from "@/lib/auth";
import { getMyTenancies } from "@/lib/my-rent";
import { MESSAGE_COLUMNS, type TenantMessage } from "@/lib/tenant-messages";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "From your landlord", robots: { index: false } };

// An invoice, reminder or message the tenant's landlord or agent sent them (tenant self-view).
export default async function MyMessagePage({ params }: PageProps<"/my-rent/[tenancyId]/messages/[messageId]">) {
  const { tenancyId, messageId } = await params;
  await requireUser(`/my-rent/${tenancyId}/messages/${messageId}`);
  const supabase = await createClient();
  const [tenancies, { data }] = await Promise.all([
    getMyTenancies(supabase),
    supabase.from("tenant_messages").select(MESSAGE_COLUMNS).eq("id", messageId).eq("tenancy_id", tenancyId).maybeSingle(),
  ]);
  const t = tenancies.find((x) => x.tenancy_id === tenancyId);
  if (!t || !data) notFound();
  const m = data as unknown as TenantMessage;

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-5 px-4 pt-5 pb-10">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <BackLink href={`/my-rent/${tenancyId}`}>{t.property_name} · Unit {t.unit_label}</BackLink>
        {m.kind === "invoice" ? <PrintButton label="Print or save invoice" /> : null}
      </div>
      <TenantMessageView m={m} from={t.org_name} to={`${t.property_name}, unit ${t.unit_label}`} />
      <p className="no-print text-caption text-muted">
        Questions about this? Contact {t.org_name} directly; replies to the email aren&apos;t read.
      </p>
    </div>
  );
}
