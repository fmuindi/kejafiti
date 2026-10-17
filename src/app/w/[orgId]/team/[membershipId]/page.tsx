import Link from "next/link";
import { notFound } from "next/navigation";
import { EditAccess } from "@/components/team/edit-access";
import { Icon } from "@/components/ui/icon";
import { Eyebrow, PageTitle } from "@/components/ui/primitives";
import { isOrgAdmin, requireWorkspace } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { getVisibleProperties } from "@/lib/rent/queries";
import { ROLE_LABEL } from "@/lib/rent/status";
import { createClient } from "@/lib/supabase/server";

export default async function EditMemberPage({ params }: PageProps<"/w/[orgId]/team/[membershipId]">) {
  const { orgId, membershipId } = await params;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/team`);
  if (!isOrgAdmin(ws)) notFound();
  const supabase = await createClient();
  const [{ data }, properties, { data: audit }] = await Promise.all([
    supabase.rpc("team_overview", { p_org: orgId }),
    getVisibleProperties(supabase, orgId),
    supabase.from("audit_events").select("id, action, created_at, actor_id").eq("org_id", orgId).eq("target_id", membershipId).order("created_at", { ascending: false }).limit(20),
  ]);
  const m = ((data ?? []) as unknown as Array<Record<string, unknown>>).find((x) => x.membership_id === membershipId) as
    | { membership_id: string; display_name: string; email: string; role: string; status: string; all_properties: boolean; property_ids: string[]; can_manage_tenancies: boolean; can_enter_payments: boolean; can_confirm: boolean; can_correct: boolean; can_export: boolean; can_view_attachments: boolean; can_manage_listings: boolean }
    | undefined;
  if (!m || m.role === "owner") notFound();

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-5">
      <Link href={`/w/${orgId}/team`} className="inline-flex min-h-11 items-center gap-1 self-start font-semibold">
        <Icon name="chevronLeft" /> Team
      </Link>
      <div>
        <Eyebrow>{ROLE_LABEL[m.role]} · {m.status}</Eyebrow>
        <PageTitle className="mt-1">{m.display_name}</PageTitle>
        <p className="mt-1 text-[14.5px] text-muted">{m.email}</p>
      </div>
      <EditAccess
        orgId={orgId}
        membershipId={membershipId}
        properties={properties.map((p) => ({ id: p.id, name: p.name }))}
        isOwner={ws.role === "owner"}
        initial={{
          role: m.role as "manager",
          all_properties: m.all_properties,
          property_ids: m.property_ids,
          can_manage_tenancies: m.can_manage_tenancies,
          can_enter_payments: m.can_enter_payments,
          can_confirm: m.can_confirm,
          can_correct: m.can_correct,
          can_export: m.can_export,
          can_view_attachments: m.can_view_attachments,
          can_manage_listings: m.can_manage_listings,
        }}
      />
      {(audit ?? []).length ? (
        <section aria-labelledby="log">
          <h2 id="log" className="font-display text-[18px] font-bold">Access history</h2>
          <ul className="mt-2 flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {(audit ?? []).map((a) => (
              <li key={a.id} className="flex justify-between gap-3 px-4 py-2.5 text-[14px]">
                <span>{a.action.replaceAll("_", " ")}</span>
                <span className="text-muted">{formatDateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
