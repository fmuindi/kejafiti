import { SignOutForm } from "@/components/auth/sign-out-form";
import type { Metadata } from "next";
import Link from "next/link";
import { UpdateChannels } from "@/components/workspace/update-channels";
import { ProfileForm } from "@/components/auth/profile-form";
import { EmailSettings, type EmailCategory } from "@/components/auth/email-settings";
import { emailConfigured } from "@/lib/delivery";
import { createClient } from "@/lib/supabase/server";
import { ClearDeviceData } from "@/components/auth/clear-device";
import { Icon, type IconName } from "@/components/ui/icon";
import { cx } from "@/components/ui/primitives";
import { getUnreadCount } from "@/lib/updates";
import { getIsPlatformAdmin, getProfile, getWorkspaces, requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/rent/status";
import { getTenantCounts } from "@/lib/tenant-counts";

export const metadata: Metadata = { title: "Account" };

// Tenants see the categories that can reach them; workspace members also see the work ones.
const TENANT_EMAIL: EmailCategory[] = [
  { key: "enquiries", label: "Messages and viewings", description: "Replies, viewing requests, confirmations and changes" },
  { key: "alerts", label: "Home alerts", description: "New homes matching your saved searches, at the pace each search is set to" },
  { key: "support", label: "Support", description: "Replies to your help requests" },
];
const WORK_EMAIL: EmailCategory[] = [
  { key: "rent", label: "Rent records", description: "Entries waiting for you, and entries confirmed or returned" },
  { key: "listings", label: "Listings", description: "Review decisions and reports about your listings" },
  { key: "team", label: "Team", description: "Invitations accepted and changes to your access" },
  { key: "reports", label: "Reports", description: "Monthly reports" },
];
const OTHER_EMAIL: EmailCategory = { key: "other", label: "Everything else", description: "Any other update" };

type Tile = { href: string; label: string; icon: IconName; meta: string; attention?: boolean };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const supabase = await createClient();
  const [profile, workspaces, isAdmin, unread, c, { data: settings }] = await Promise.all([
    getProfile(), getWorkspaces(), getIsPlatformAdmin(), getUnreadCount(), getTenantCounts(),
    supabase.from("notification_settings").select("email_off").eq("user_id", user.id).maybeSingle(),
  ]);
  const emailCategories = [...TENANT_EMAIL, ...(workspaces.length ? WORK_EMAIL : []), OTHER_EMAIL];
  const tiles: Tile[] = [
    { href: "/messages", label: "Messages", icon: "message", meta: c.unread ? `${c.unread} unread` : "All read", attention: c.unread > 0 },
    {
      href: "/viewings",
      label: "Viewings",
      icon: "calendar",
      meta: c.viewingsNeedYou ? `${c.viewingsNeedYou} need you` : c.viewingsUpcoming ? `${c.viewingsUpcoming} upcoming` : "None booked",
      attention: c.viewingsNeedYou > 0,
    },
    ...(c.tenancies ? [{ href: "/my-rent", label: "My rent", icon: "wallet" as const, meta: c.tenancies === 1 ? "Your tenancy" : `${c.tenancies} tenancies` }] : []),
    { href: "/saved", label: "Saved", icon: "heart", meta: c.saved ? `${c.saved} home${c.saved === 1 ? "" : "s"}` : "None yet" },
    { href: "/updates", label: "Updates", icon: "bell", meta: unread ? `${unread} new` : "Caught up", attention: unread > 0 },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: "lock" as const, meta: "Platform" }] : []),
  ];

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-5 pb-10">
      <h1 className="sr-only">Account</h1>
      <ProfileForm name={profile?.full_name ?? ""} email={profile?.email ?? user.email ?? ""} />
      <nav aria-label="Your places">
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {tiles.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className={cx(
                  "flex h-full flex-col gap-2.5 rounded-[18px] border-[1.5px] p-3.5 transition-colors",
                  t.attention ? "border-primary bg-pink hover:bg-pink/70" : "border-line bg-surface hover:border-ink",
                )}
              >
                <span aria-hidden="true" className={cx("grid size-10 place-items-center rounded-[12px]", t.attention ? "bg-primary text-white" : "bg-cool text-deep")}>
                  <Icon name={t.icon} size={20} />
                </span>
                <span>
                  <span className="block font-semibold">{t.label}</span>
                  <span className={cx("block text-[0.8125rem]", t.attention ? "font-semibold text-primary-hover" : "text-muted")}>{t.meta}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <section aria-labelledby="ws" className="flex flex-col gap-2">
        <h2 id="ws" className="flex items-center gap-2 text-[0.9375rem] font-semibold text-muted">
          <Icon name="building" size={16} /> Properties
        </h2>
        <ul className="flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
          {workspaces.map((w) => (
            <li key={w.org_id}>
              <Link href={`/w/${w.org_id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-cool">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{w.org_name}</span>
                  <span className="text-[0.8125rem] text-muted">{ROLE_LABEL[w.role]}</span>
                </span>
                <Icon name="arrowRight" size={18} className="text-primary" />
              </Link>
            </li>
          ))}
          {workspaces.length === 0 ? (
            <li>
              <Link href="/start" className="flex min-h-14 items-center gap-3 px-4 hover:bg-cool">
                <Icon name="plus" size={18} className="text-primary" />
                <span className="flex-1 font-semibold">List a home</span>
                <Icon name="arrowRight" size={18} className="text-primary" />
              </Link>
            </li>
          ) : null}
        </ul>
      </section>
      <UpdateChannels />
      <EmailSettings categories={emailCategories} off={settings?.email_off ?? []} emailOn={emailConfigured()} />
      <section aria-labelledby="device" className="flex flex-col gap-2">
        <h2 id="device" className="flex items-center gap-2 text-[0.9375rem] font-semibold text-muted">
          <Icon name="phone" size={16} /> This device
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <ClearDeviceData userId={user.id} />
          <SignOutForm userId={user.id}>
            <button type="submit" className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border-[1.5px] border-ink px-3.5 text-[0.875rem] font-semibold hover:bg-ink hover:text-white">
              <Icon name="logout" size={18} /> Sign out
            </button>
          </SignOutForm>
        </div>
      </section>
    </div>
  );
}
