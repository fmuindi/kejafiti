import type { Metadata } from "next";
import Link from "next/link";
import { ProfileForm } from "@/components/auth/profile-form";
import { Icon } from "@/components/ui/icon";
import { PageTitle } from "@/components/ui/primitives";
import { getProfile, getWorkspaces, requireWorkspace } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/rent/status";

export const metadata: Metadata = { title: "Account" };

export default async function WorkspaceAccountPage({ params }: PageProps<"/w/[orgId]/account">) {
  const { orgId } = await params;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/account`);
  const [profile, all] = await Promise.all([getProfile(), getWorkspaces()]);
  const perms = [
    [ws.can_enter_payments, "Enter payments"],
    [ws.can_confirm, "Confirm rent records"],
    [ws.can_correct, "Correct confirmed records"],
    [ws.can_manage_tenancies, "Manage tenancies and charges"],
    [ws.can_manage_listings, "Manage listings and enquiries"],
    [ws.can_view_attachments, "View receipts"],
    [ws.can_export, "Export reports"],
  ] as const;
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-5">
      <PageTitle>Account</PageTitle>
      <ProfileForm name={profile?.full_name ?? ""} email={profile?.email ?? ""} />
      <section aria-labelledby="access" className="rounded-[18px] border border-line bg-surface p-4">
        <h2 id="access" className="font-semibold">Your access in {ws.org_name}</h2>
        <p className="text-[14px] text-muted">{ROLE_LABEL[ws.role]} · {ws.all_properties ? "all properties" : `${ws.property_ids.length} assigned propert${ws.property_ids.length === 1 ? "y" : "ies"}`}</p>
        <ul className="mt-2 grid gap-1 text-[14px] sm:grid-cols-2">
          {perms.map(([on, label]) => (
            <li key={label} className={on ? "" : "text-muted line-through"}>{on ? "✓ " : ""}{label}</li>
          ))}
        </ul>
        <p className="mt-2 text-[12.5px] text-muted">Only the workspace owner can change this.</p>
      </section>
      {all.length > 1 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Other workspaces</h2>
          {all.filter((w) => w.org_id !== orgId).map((w) => (
            <Link key={w.org_id} href={`/w/${w.org_id}`} className="flex min-h-[52px] items-center justify-between rounded-[14px] border border-line bg-surface px-4 font-semibold">{w.org_name}<Icon name="chevronRight" /></Link>
          ))}
        </section>
      ) : null}
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-semibold"><Icon name="swap" size={18} /> Switch to tenant</Link>
      <form action="/auth/sign-out" method="post">
        <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border-[1.5px] border-ink px-4 font-semibold"><Icon name="logout" size={18} /> Sign out</button>
      </form>
    </div>
  );
}
