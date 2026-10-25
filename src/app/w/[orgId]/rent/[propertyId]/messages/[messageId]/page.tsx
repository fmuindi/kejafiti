import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/rent/print-button";
import { TenantMessageView } from "@/components/rent/tenant-message-view";
import { BackLink } from "@/components/shell/back-link";
import { Notice, StatusBadge } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth";
import { emailConfigured } from "@/lib/delivery";
import { MESSAGE_COLUMNS, deliveryLabel, type TenantMessage } from "@/lib/tenant-messages";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sent to tenant" };

// One invoice, reminder or message as the tenant got it, with whether the email went.
export default async function SentMessagePage({ params }: PageProps<"/w/[orgId]/rent/[propertyId]/messages/[messageId]">) {
  const { orgId, propertyId, messageId } = await params;
  const base = `/w/${orgId}/rent/${propertyId}`;
  const ws = await requireWorkspace(orgId, `${base}/messages/${messageId}`);
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_messages")
    .select(`${MESSAGE_COLUMNS}, tenancies(unit_id, units(label), tenants(full_name)), properties(name)`)
    .eq("id", messageId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (!data) notFound();
  const m = data as unknown as TenantMessage & {
    tenancies: { unit_id: string; units: { label: string } | null; tenants: { full_name: string } | null } | null;
    properties: { name: string } | null;
  };
  const { data: sender } = m.sent_by
    ? await supabase.from("memberships").select("display_name").eq("org_id", orgId).eq("user_id", m.sent_by).maybeSingle()
    : { data: null };
  const d = deliveryLabel(m.delivery_status, emailConfigured());
  const unit = m.tenancies?.units?.label;

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <BackLink href={m.tenancies ? `${base}/units/${m.tenancies.unit_id}` : `${base}/tenants`}>Unit {unit}</BackLink>
        <PrintButton label={m.kind === "invoice" ? "Print or save invoice" : "Print"} />
      </div>
      <div className="no-print flex flex-wrap items-center gap-2 text-label">
        <StatusBadge tone={d.tone}>{d.label}</StatusBadge>
        <span className="text-muted">to {m.email}</span>
      </div>
      {m.delivery_status === "failed" ? (
        <Notice tone="error" title="The email didn't go">
          {m.delivery_error ? <span className="block">Reason given: {m.delivery_error}</span> : null}
          If the address is wrong, correct it on the unit page. Then send it again; it is kept here either way.
        </Notice>
      ) : null}
      <TenantMessageView
        m={m}
        from={[ws.org_name, sender?.display_name].filter(Boolean).join(" · ")}
        to={`${m.tenancies?.tenants?.full_name ?? "Tenant"} · ${m.properties?.name ?? ""}, unit ${unit ?? ""}`}
      />
    </div>
  );
}
