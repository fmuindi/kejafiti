import { SignOutForm } from "@/components/auth/sign-out-form";
import type { Metadata } from "next";
import Link from "next/link";
import { UpdateChannels } from "@/components/workspace/update-channels";
import { ProfileForm } from "@/components/auth/profile-form";
import { ClearDeviceData } from "@/components/auth/clear-device";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, PageTitle } from "@/components/ui/primitives";
import { getUnreadCount } from "@/lib/updates";
import { getIsPlatformAdmin, getProfile, getWorkspaces, requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/rent/status";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const signedInUserId = user.id;
  const [profile, workspaces, isAdmin] = await Promise.all([getProfile(), getWorkspaces(), getIsPlatformAdmin()]);
  const unread = await getUnreadCount();

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-4 pt-5 pb-10">
      <PageTitle>Account</PageTitle>
      <ProfileForm name={profile?.full_name ?? ""} email={profile?.email ?? user.email ?? ""} />
      <section aria-labelledby="ws" className="flex flex-col gap-2">
        <h2 id="ws" className="font-display text-[18px] font-bold">My workspaces</h2>
        {workspaces.map((w) => (
          <Link key={w.org_id} href={`/w/${w.org_id}`} className="flex min-h-[56px] items-center justify-between gap-3 rounded-[16px] border border-line bg-surface px-4 hover:border-ink">
            <span>
              <span className="block font-semibold">{w.org_name}</span>
              <span className="text-[13px] text-muted">{ROLE_LABEL[w.role]}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-primary">Open workspace <Icon name="chevronRight" size={16} /></span>
          </Link>
        ))}
        {workspaces.length === 0 ? <ButtonLink href="/start" variant="secondary">List a home or manage properties</ButtonLink> : null}
        {isAdmin ? <ButtonLink href="/admin" variant="secondary">Admin centre</ButtonLink> : null}
      </section>
      <Link href="/updates" className="flex min-h-[56px] items-center justify-between gap-3 rounded-[16px] border border-line bg-surface px-4 hover:border-ink">
        <span className="flex items-center gap-2 font-semibold"><Icon name="bell" size={18} /> Updates</span>
        <span className="text-[14px] text-muted">{unread ? `${unread} unread` : "All caught up"}</span>
      </Link>
      <UpdateChannels />
      <section aria-labelledby="device" className="flex flex-col gap-2">
        <h2 id="device" className="font-display text-[18px] font-bold">This device</h2>
        <ClearDeviceData userId={user.id} />
        <SignOutForm userId={signedInUserId}>
          <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border-[1.5px] border-ink px-4 font-semibold">
            <Icon name="logout" size={18} /> Sign out
          </button>
        </SignOutForm>
      </section>
    </div>
  );
}
