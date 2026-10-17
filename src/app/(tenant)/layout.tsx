import Link from "next/link";
import { BottomTabs, HeaderLink, type NavItem } from "@/components/shell/nav-link";
import { Logo } from "@/components/ui/icon";
import { buttonClass } from "@/components/ui/primitives";
import { getSessionUser, getWorkspaces } from "@/lib/auth";

const TABS: NavItem[] = [
  { href: "/", label: "Explore", icon: "search", exact: true },
  { href: "/saved", label: "Saved", icon: "heart" },
  { href: "/messages", label: "Messages", icon: "message" },
  { href: "/viewings", label: "Viewings", icon: "calendar" },
  { href: "/account", label: "Account", icon: "user" },
];

export default async function TenantLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  const workspaces = user ? await getWorkspaces() : [];
  const listHref = workspaces[0] ? `/w/${workspaces[0].org_id}` : "/start";

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
            <HeaderLink href={listHref}>{workspaces[0] ? "Landlord workspace" : "List your home"}</HeaderLink>
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
      <main id="main">{children}</main>
      <BottomTabs items={TABS} label="Tenant" />
    </div>
  );
}
