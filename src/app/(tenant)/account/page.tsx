import { SignOutForm } from "@/components/auth/sign-out-form";
import type { Metadata } from "next";
import Link from "next/link";
import { ActivityList } from "@/components/workspace/activity-list";
import { ProfileForm } from "@/components/auth/profile-form";
import { ClearDeviceData } from "@/components/auth/clear-device";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, PageTitle } from "@/components/ui/primitives";
import { getIsPlatformAdmin, getProfile, getWorkspaces, requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/rent/status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const signedInUserId = user.id;
  const [profile, workspaces, isAdmin] = await Promise.all([getProfile(), getWorkspaces(), getIsPlatformAdmin()]);
  const supabase = await createClient();
  const { data: notes } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at").eq("user_id", user.id).is("org_id", null).order("created_at", { ascending: false }).limit(20);

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-4 pt-5 pb-10">
      <PageTitle>Account</PageTitle>
      <ProfileForm name={profile?.full_name ?? ""} email={profile?.email ?? user.email ?? ""} />
      <section aria-labelledby="ws" className="flex flex-col gap-2">
        <h2 id="ws" className="font-display text-[18px] font-bold">Landlord and team workspaces</h2>
        {workspaces.map((w) => (
          <Link key={w.org_id} href={`/w/${w.org_id}`} className="flex min-h-[56px] items-center justify-between gap-3 rounded-[16px] border border-line bg-surface px-4 hover:border-ink">
            <span>
              <span className="block font-semibold">{w.org_name}</span>
              <span className="text-[13px] text-muted">{ROLE_LABEL[w.role]}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-primary">Switch to workspace <Icon name="chevronRight" size={16} /></span>
          </Link>
        ))}
        {workspaces.length === 0 ? <ButtonLink href="/start" variant="secondary">List a home or manage properties</ButtonLink> : null}
        {isAdmin ? <ButtonLink href="/admin" variant="secondary">Open the admin centre</ButtonLink> : null}
      </section>
      <section aria-labelledby="inbox" className="flex flex-col gap-2">
        <h2 id="inbox" className="font-display text-[18px] font-bold">Updates</h2>
        <p className="text-[13.5px] text-muted">Everything is kept in this inbox. Other channels (email, SMS, push) are not switched on yet.</p>
        <ActivityList items={notes ?? []} />
      </section>
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
