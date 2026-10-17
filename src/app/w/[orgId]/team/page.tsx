import Link from "next/link";
import { notFound } from "next/navigation";
import { AddMemberPanel } from "@/components/team/add-member";
import { MemberActions } from "@/components/team/member-actions";
import { Icon } from "@/components/ui/icon";
import { EmptyState, Notice, PageTitle, StatusBadge, cx } from "@/components/ui/primitives";
import { isOrgAdmin, requireWorkspace } from "@/lib/auth";
import { formatDate, timeAgo } from "@/lib/dates";
import { emailConfigured } from "@/lib/delivery";
import { getVisibleProperties } from "@/lib/rent/queries";
import { ROLE_LABEL } from "@/lib/rent/status";
import { createClient } from "@/lib/supabase/server";

type Member = {
  membership_id: string; user_id: string | null; display_name: string; email: string; role: string; status: string;
  invite_expires_at: string | null; all_properties: boolean; property_names: string[]; property_ids: string[];
  can_manage_tenancies: boolean; can_enter_payments: boolean; can_confirm: boolean; can_correct: boolean; can_export: boolean;
  can_view_attachments: boolean; can_manage_listings: boolean; last_active_at: string | null; submitted_pending: number;
  open_work: number; status_changed_at: string | null;
};

export default async function TeamPage({ params, searchParams }: PageProps<"/w/[orgId]/team">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/team`);
  if (!isOrgAdmin(ws)) notFound();
  const supabase = await createClient();
  const [{ data, error }, properties] = await Promise.all([supabase.rpc("team_overview", { p_org: orgId }), getVisibleProperties(supabase, orgId)]);
  const all = (data ?? []) as unknown as Member[];

  const fProp = typeof sp.property === "string" ? sp.property : "";
  const fRole = typeof sp.role === "string" ? sp.role : "";
  const fStatus = typeof sp.status === "string" ? sp.status : "";
  const now = new Date();
  const statusOf = (m: Member) => (m.status === "invited" && m.invite_expires_at && new Date(m.invite_expires_at) < now ? "expired" : m.status);
  const members = all.filter(
    (m) =>
      (!fProp || m.all_properties || m.property_ids.includes(fProp)) &&
      (!fRole || m.role === fRole) &&
      (!fStatus || statusOf(m) === fStatus),
  );
  const replacements = all.filter((m) => m.status === "active" && m.user_id).map((m) => ({ id: m.membership_id, name: m.display_name }));

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_400px]">
      <section aria-labelledby="team" className="min-w-0">
        <PageTitle>
          <span id="team">Team</span>
        </PageTitle>
        <p className="mt-2 text-[15px] text-muted">People who manage your properties. Only you can change their access.</p>
        {!emailConfigured() ? (
          <Notice tone="waiting" className="mt-4" title="Invitation emails aren't being sent yet">
            No email provider is configured, so invitations wait in the queue. After you invite someone, copy their invitation link
            and send it to them directly.
          </Notice>
        ) : null}

        <form className="mt-5 flex flex-wrap gap-2" aria-label="Filter team">
          <select name="property" defaultValue={fProp} aria-label="Property" className="min-h-11 rounded-[12px] border border-line bg-surface px-3 text-[14.5px]">
            <option value="">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select name="role" defaultValue={fRole} aria-label="Role" className="min-h-11 rounded-[12px] border border-line bg-surface px-3 text-[14.5px]">
            <option value="">All roles</option>
            <option value="manager">Property manager</option>
            <option value="caretaker">Caretaker</option>
            <option value="viewer">Accountant (view only)</option>
            <option value="agency_admin">Agency admin</option>
          </select>
          <select name="status" defaultValue={fStatus} aria-label="Status" className="min-h-11 rounded-[12px] border border-line bg-surface px-3 text-[14.5px]">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="expired">Invitation expired</option>
            <option value="suspended">Suspended</option>
          </select>
          <button type="submit" className="min-h-11 rounded-[12px] bg-ink px-4 text-[14.5px] font-semibold text-white">Filter</button>
        </form>

        {error ? (
          <Notice tone="error" role="alert" className="mt-4" title="We couldn't load your team.">Reload to try again.</Notice>
        ) : members.length === 0 ? (
          <div className="mt-5">
            <EmptyState title={all.length > 1 ? "No one matches these filters" : "It's just you so far"} icon="team">
              Add a property manager or caretaker. You choose their properties and whether they can confirm rent records.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-5 flex flex-col divide-y divide-divider overflow-hidden rounded-[18px] border border-line bg-surface">
            {members.map((m) => {
              const st = statusOf(m);
              return (
                <li key={m.membership_id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{m.display_name}</p>
                    <p className="text-[13.5px] text-muted">
                      {ROLE_LABEL[m.role]} · {m.email}
                      {m.status === "active" ? ` · active ${timeAgo(m.last_active_at)}` : ""}
                    </p>
                    <p className="mt-1 text-[13.5px]">{m.role === "owner" || m.all_properties ? "All properties" : m.property_names.join(", ") || "No properties"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:w-[310px] lg:justify-end">
                    {st === "active" ? <StatusBadge tone="success">Active</StatusBadge> : null}
                    {st === "invited" ? <StatusBadge tone="waiting">Invited · expires {formatDate(m.invite_expires_at, { year: false })}</StatusBadge> : null}
                    {st === "expired" ? <StatusBadge tone="error">Invitation expired</StatusBadge> : null}
                    {st === "suspended" ? <StatusBadge tone="neutral" icon="lock">Suspended {m.status_changed_at ? formatDate(m.status_changed_at, { year: false }) : ""}</StatusBadge> : null}
                    <span className={cx("text-[13px] font-semibold", m.can_confirm || m.role === "owner" ? "text-success" : "text-muted")}>
                      {m.role === "owner" || m.role === "agency_admin" ? "Full access" : m.can_confirm ? "Can confirm" : m.can_enter_payments ? "Submits only" : "View only"}
                    </span>
                    {m.submitted_pending ? <span className="text-[13px] font-semibold text-waiting">{m.submitted_pending} submitted</span> : null}
                    {m.open_work ? <span className="text-[13px] font-semibold text-waiting">{m.open_work} open</span> : null}
                  </div>
                  {m.role !== "owner" && m.user_id !== null && m.status !== "invited" ? (
                    <div className="flex flex-wrap gap-2 lg:w-[220px] lg:justify-end">
                      <Link href={`/w/${orgId}/team/${m.membership_id}`} className="inline-flex min-h-10 items-center gap-1 rounded-[10px] border border-line px-3 text-[14px] font-semibold">
                        <Icon name="edit" size={16} /> Edit access
                      </Link>
                      <MemberActions orgId={orgId} membershipId={m.membership_id} status={m.status} name={m.display_name} replacements={replacements.filter((r) => r.id !== m.membership_id)} />
                    </div>
                  ) : m.status === "invited" ? (
                    <div className="flex flex-wrap gap-2 lg:w-[220px] lg:justify-end">
                      <MemberActions orgId={orgId} membershipId={m.membership_id} status="invited" name={m.display_name} replacements={[]} />
                    </div>
                  ) : (
                    <div className="lg:w-[220px]" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[13px] text-muted">
          Suspending or removing someone blocks their access straight away. Their past entries stay in the records, and anything they
          left open moves to the person you choose.
        </p>
      </section>
      <AddMemberPanel orgId={orgId} properties={properties.map((p) => ({ id: p.id, name: p.name }))} isOwner={ws.role === "owner"} />
    </div>
  );
}
