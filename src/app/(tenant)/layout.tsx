import Link from "next/link";
import { BottomTabs, HeaderLink, type NavItem } from "@/components/shell/nav-link";
import { Logo } from "@/components/ui/icon";
import { UpdatesBell } from "@/components/shell/updates-bell";
import { buttonClass } from "@/components/ui/primitives";
import { getIsPlatformAdmin, getSessionUser, getWorkspaces } from "@/lib/auth";
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
  const [workspaces, isAdmin, unread] = user ? await Promise.all([getWorkspaces(), getIsPlatformAdmin(), getUnreadCount()]) : [[], false, 0];
  // /w opens the remembered workspace or asks which one (IMP-06).
  const listHref = workspaces.length ? "/w" : "/start";

  return (
    <div className="min-h-dvh pb-[76px] md:pb-0">
      <header className="no-print sticky top-0 z-30 hidden border-b border-line bg-cream/95 backdrop-blur md:block">
        <div className="mx-auto flex h-[68px] max-w-[1360px] items-center gap-6 px-6">
          <Link href="/" aria-label="nyumbani home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="ml-auto flex items-center gap-1">
            <HeaderLink href="/search">Search</HeaderLink>
            <HeaderLink href="/saved">Saved</HeaderLink>
            <HeaderLink href="/messages">Messages</HeaderLink>
            <HeaderLink href="/viewings">Viewings</HeaderLink>
            <HeaderLink href={listHref}>{workspaces.length ? "My workspace" : "List your home"}</HeaderLink>
            {isAdmin ? <HeaderLink href="/admin">Admin centre</HeaderLink> : null}
            <HeaderLink href="/help">Help</HeaderLink>
            {user ? <UpdatesBell count={unread} /> : null}
            {user ? (
              <Link href="/account" className={buttonClass("secondary", "sm", "ml-2")}>
                Account
              </Link>
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
      <BottomTabs items={TABS} label="Tenant" />
    </div>
  );
}
