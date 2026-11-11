import { SignOutForm } from "@/components/auth/sign-out-form";
import Link from "next/link";
import { ActivityPing } from "@/components/shell/activity-ping";
import { LiveUpdates } from "@/components/shell/live-updates";
import { BottomTabs, SidebarLinks, type NavItem } from "@/components/shell/nav-link";
import { HelpLink } from "@/components/shell/help-link";
import { UpdatesBell } from "@/components/shell/updates-bell";
import { Icon, Logo } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/primitives";
import { getProfile, getWorkspaces, isOrgAdmin, requireUser, requireWorkspace } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/rent/status";
import { createClient } from "@/lib/supabase/server";
import { getUnreadCount } from "@/lib/updates";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[orgId]">) {
  const { orgId } = await params;
  const ws = await requireWorkspace(orgId, `/w/${orgId}`);
  const signedInUserId = (await requireUser(`/w/${orgId}`)).id;
  const [all, profile, unreadUpdates] = await Promise.all([getWorkspaces(), getProfile(), getUnreadCount(orgId)]);
  const supabase = await createClient();
  // Remember this workspace for the next sign-in (IMP-06). Written only when it changes.
  if (profile && (profile.last_org_id !== orgId || profile.last_role !== "workspace")) {
    await supabase.from("profiles").update({ last_role: "workspace", last_org_id: orgId }).eq("id", signedInUserId);
  }
  const base = `/w/${orgId}`;
  const me = profile?.full_name?.trim() || profile?.email || "Me";
  const admin = isOrgAdmin(ws);
  const listings = ws.can_manage_listings;

  const enterOnly = ws.can_enter_payments && !ws.can_confirm && !admin;
  const [{ count: pending }, { data: convs }, { data: work }] = await Promise.all([
    ws.can_confirm
      ? supabase.from("payment_entries").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "awaiting_confirmation")
      : Promise.resolve({ count: 0 }),
    listings
      ? supabase.from("conversations").select("id, last_tenant_message_at, last_advertiser_message_at, follow_up").eq("org_id", orgId).neq("follow_up", "closed").limit(200)
      : Promise.resolve({ data: [] }),
    enterOnly ? supabase.rpc("my_rent_work", { p_org: orgId }) : Promise.resolve({ data: [] }),
  ]);
  const myOpenWork = ((work ?? []) as Array<{ grp: string }>).filter((w) => w.grp !== "submitted").length;
  const unanswered = (convs ?? []).filter(
    (c) => c.last_tenant_message_at && (!c.last_advertiser_message_at || c.last_advertiser_message_at < c.last_tenant_message_at),
  ).length;

  const sidebar: NavItem[] = [
    { href: base, label: "Home", icon: "home", exact: true },
    ...(listings || admin ? [{ href: `${base}/properties`, label: "Properties", icon: "building" as const }] : []),
    { href: `${base}/rent`, label: "Rent records", icon: "wallet", badge: pending ?? 0 },
    ...(enterOnly ? [{ href: `${base}/rent/mine`, label: "My entries", icon: "inbox" as const, badge: myOpenWork }] : []),
    // IMP-07: the financial dashboard, one click from anywhere.
    { href: `${base}/dashboard`, label: "Performance", icon: "chart" },
    ...(listings ? [{ href: `${base}/enquiries`, label: "Enquiries", icon: "message" as const, badge: unanswered }] : []),
    ...(admin ? [{ href: `${base}/team`, label: "Team", icon: "team" as const }] : []),
    { href: `${base}/reports`, label: "Reports", icon: "file" },
    { href: `${base}/activity`, label: "Updates", icon: "bell", badge: unreadUpdates },
  ];

  // Phone tabs hold five items. Viewings stay one tap away inside Enquiries; Performance is one
  // tap from Home.
  const ownerTabs: NavItem[] = [
    { href: base, label: "Home", icon: "home", exact: true },
    { href: `${base}/rent`, label: "Rent", icon: "wallet", badge: pending ?? 0 },
    { href: `${base}/dashboard`, label: "Performance", icon: "chart" },
    { href: `${base}/enquiries`, label: "Enquiries", icon: "message", badge: unanswered },
    { href: `${base}/account`, label: "Account", icon: "user", avatar: me },
  ];
  // Staff start from their work queue (Home); at most five tabs.
  const staffTabs: NavItem[] = [
    { href: base, label: "Home", icon: "home", exact: true },
    { href: `${base}/rent`, label: "Rent", icon: "wallet" },
    ...(ws.can_confirm ? [{ href: `${base}/rent/inbox`, label: "Inbox", icon: "inbox" as const, badge: pending ?? 0 }] : []),
    ...(enterOnly ? [{ href: `${base}/rent/mine`, label: "My entries", icon: "inbox" as const, badge: myOpenWork }] : []),
    ...(listings ? [{ href: `${base}/enquiries`, label: "Enquiries", icon: "message" as const, badge: unanswered }] : []),
    ...(!ws.can_confirm && !enterOnly && !listings ? [{ href: `${base}/dashboard`, label: "Performance", icon: "chart" as const }] : []),
    { href: `${base}/account`, label: "Account", icon: "user", avatar: me },
  ].slice(0, 5);
  const tabs = admin ? ownerTabs : staffTabs;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      <aside className="no-print hidden border-r border-line bg-cream md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:px-4 md:py-5">
        <Link href={base} aria-label="Workspace home" className="px-2">
          <Logo />
        </Link>
        <div className="surface mt-5 px-3 py-2.5">
          <p className="truncate text-label font-semibold">{ws.org_name}</p>
          <p className="text-caption text-muted">{ROLE_LABEL[ws.role]}</p>
        </div>
        <nav aria-label="Workspace" className="mt-4">
          <SidebarLinks items={sidebar} />
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3 text-label">
          {all.length > 1 ? (
            <details className="rounded-control px-3 py-2">
              <summary className="cursor-pointer font-semibold">Switch workspace</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {all.filter((w) => w.org_id !== orgId).map((w) => (
                  <li key={w.org_id}>
                    <Link href={`/w/${w.org_id}`} className="block rounded-chip px-2 py-1.5 hover:bg-surface">
                      {w.org_name}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <Link href={`${base}/account`} className="flex min-h-12 items-center gap-2.5 rounded-control px-2 py-1.5 hover:bg-surface">
            <Avatar name={me} size={32} />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{me}</span>
              <span className="block text-micro text-muted">Your account</span>
            </span>
          </Link>
          <HelpLink className="flex min-h-11 items-center gap-2 rounded-control px-3 hover:bg-surface">
            <Icon name="info" size={18} /> Help and support
          </HelpLink>
          <Link href="/" className="flex min-h-11 items-center gap-2 rounded-control px-3 hover:bg-surface">
            <Icon name="search" size={18} /> Browse homes
          </Link>
          <SignOutForm userId={signedInUserId}>
            <button type="submit" className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 hover:bg-surface">
              <Icon name="logout" size={18} /> Sign out
            </button>
          </SignOutForm>
        </div>
      </aside>
      <div className="min-w-0 pb-[76px] md:pb-0">
        <header className="no-print flex items-center justify-between gap-3 border-b border-line bg-cream px-4 py-2.5 md:hidden">
          <Link href={base} className="flex min-w-0 items-center gap-2">
            <Logo withWord={false} />
            <span className="min-w-0">
              <span className="block truncate text-label font-semibold">{ws.org_name}</span>
              <span className="block text-micro text-muted">{ROLE_LABEL[ws.role]}</span>
            </span>
          </Link>
          <UpdatesBell count={unreadUpdates} href={`${base}/activity`} />
        </header>
        <main id="main" className="mx-auto w-full max-w-wide px-4 py-5 md:px-8 md:py-8">
          {children}
        </main>
      </div>
      <BottomTabs items={tabs} label="Workspace" />
      <ActivityPing />
      <LiveUpdates userId={signedInUserId} />
    </div>
  );
}
