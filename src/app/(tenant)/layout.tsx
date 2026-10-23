import Link from "next/link";
import { ActivityPing } from "@/components/shell/activity-ping";
import { LiveUpdates } from "@/components/shell/live-updates";
import { AccountLink, BottomTabs, HeaderLink, type NavItem } from "@/components/shell/nav-link";
import { SiteFooter } from "@/components/shell/site-footer";
import { Logo } from "@/components/ui/icon";
import { UpdatesBell } from "@/components/shell/updates-bell";
import { buttonClass } from "@/components/ui/primitives";
import { getIsPlatformAdmin, getProfile, getSessionUser, getWorkspaces } from "@/lib/auth";
import { getTenantCounts } from "@/lib/tenant-counts";
import { getUnreadCount } from "@/lib/updates";

const TABS: NavItem[] = [
  { href: "/", label: "Explore", icon: "search", exact: true },
  { href: "/saved", label: "Saved", icon: "heart" },
  { href: "/messages", label: "Messages", icon: "message" },
  { href: "/viewings", label: "Viewings", icon: "calendar" },
  { href: "/account", label: "Account", icon: "user" },
];

export default async function TenantLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  const [workspaces, isAdmin, unread, profile, counts] = await Promise.all([
    user ? getWorkspaces() : [],
    user ? getIsPlatformAdmin() : false,
    user ? getUnreadCount() : 0,
    user ? getProfile() : null,
    getTenantCounts(),
  ]);
  // Initials for the avatar: the name if they gave one, else their email.
  const me = user ? profile?.full_name?.trim() || profile?.email || user.email || "Me" : null;
  // Badges: unread messages, and viewings waiting on the tenant.
  const badges: Record<string, number> = { "/messages": counts.unread, "/viewings": counts.viewingsNeedYou };
  const tabs = TABS.map((t) => ({ ...t, badge: badges[t.href], ...(me && t.href === "/account" ? { avatar: me } : {}) }));
  // /w opens the remembered workspace or asks which one (IMP-06).
  const listHref = workspaces.length ? "/w" : "/start";

  return (
    <div className="min-h-dvh pb-[76px] md:pb-0">
      <header className="no-print sticky top-0 z-30 hidden border-b border-line bg-cream/95 backdrop-blur md:block">
        <div className="mx-auto flex h-[68px] max-w-[1360px] items-center gap-4 px-6">
          <Link href="/" aria-label="nyumbani home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="ml-auto flex items-center gap-1">
            <HeaderLink href="/search" icon="search">Search</HeaderLink>
            <HeaderLink href="/saved" icon="heart">Saved</HeaderLink>
            <HeaderLink href="/messages" icon="message" badge={counts.unread}>Messages</HeaderLink>
            <HeaderLink href="/viewings" icon="calendar" badge={counts.viewingsNeedYou}>Viewings</HeaderLink>
            <HeaderLink href={listHref} icon="building">{workspaces.length ? "My workspace" : "List your home"}</HeaderLink>
            {isAdmin ? <HeaderLink href="/admin" icon="lock">Admin</HeaderLink> : null}
            <HeaderLink href="/help" icon="info">Help</HeaderLink>
            {user ? <UpdatesBell count={unread} /> : null}
            {me ? (
              <AccountLink href="/account" name={me} />
            ) : (
              <Link href="/sign-in" className={buttonClass("secondary", "sm", "ml-2")}>
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <div className="no-print flex items-center justify-between px-4 pt-3 md:hidden">
        <Link href="/" aria-label="nyumbani home"><Logo /></Link>
        {user ? <UpdatesBell count={unread} /> : <Link href="/sign-in" className={buttonClass("secondary", "sm")}>Sign in</Link>}
      </div>
      <main id="main">{children}</main>
      <SiteFooter listHref={listHref} listLabel={workspaces.length ? "My workspace" : "List your home"} signedIn={!!user} />
      <BottomTabs items={tabs} label="Tenant" />
      {user ? <ActivityPing /> : null}
      {user ? <LiveUpdates userId={user.id} /> : null}
    </div>
  );
}
