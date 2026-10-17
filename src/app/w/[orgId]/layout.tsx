import Link from "next/link";
import { BottomTabs, SidebarLinks, type NavItem } from "@/components/shell/nav-link";
import { Icon, Logo } from "@/components/ui/icon";
import { getWorkspaces, isOrgAdmin, requireWorkspace } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/rent/status";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[orgId]">) {
  const { orgId } = await params;
  const ws = await requireWorkspace(orgId, `/w/${orgId}`);
  const all = await getWorkspaces();
  const supabase = await createClient();
  const base = `/w/${orgId}`;
  const admin = isOrgAdmin(ws);
  const listings = ws.can_manage_listings;

  const [{ count: pending }, { data: convs }] = await Promise.all([
    ws.can_confirm
      ? supabase.from("payment_entries").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "awaiting_confirmation")
      : Promise.resolve({ count: 0 }),
    listings
      ? supabase.from("conversations").select("id, last_tenant_message_at, last_advertiser_message_at, follow_up").eq("org_id", orgId).neq("follow_up", "closed").limit(200)
      : Promise.resolve({ data: [] }),
  ]);
  const unanswered = (convs ?? []).filter(
    (c) => c.last_tenant_message_at && (!c.last_advertiser_message_at || c.last_advertiser_message_at < c.last_tenant_message_at),
  ).length;

  const sidebar: NavItem[] = [
    { href: base, label: "Overview", icon: "home", exact: true },
    ...(listings || admin ? [{ href: `${base}/properties`, label: "Properties & units", icon: "building" as const }] : []),
    { href: `${base}/rent`, label: "Rent records", icon: "wallet", badge: pending ?? 0 },
    ...(listings ? [{ href: `${base}/enquiries`, label: "Enquiries & viewings", icon: "message" as const, badge: unanswered }] : []),
    ...(admin ? [{ href: `${base}/team`, label: "Team", icon: "team" as const }] : []),
    { href: `${base}/reports`, label: "Reports", icon: "chart" },
    { href: `${base}/activity`, label: "Activity", icon: "bell" },
  ];

  const ownerTabs: NavItem[] = [
    { href: base, label: "Overview", icon: "home", exact: true },
    { href: `${base}/properties`, label: "Properties", icon: "building" },
    { href: `${base}/enquiries`, label: "Enquiries", icon: "message", badge: unanswered },
    { href: `${base}/viewings`, label: "Viewings", icon: "calendar" },
    { href: `${base}/account`, label: "Account", icon: "user" },
  ];
  const staffTabs: NavItem[] = [
    { href: `${base}/rent`, label: "Rent", icon: "wallet" },
    ...(ws.can_confirm ? [{ href: `${base}/rent/inbox`, label: "Inbox", icon: "inbox" as const, badge: pending ?? 0 }] : []),
    ...(listings ? [{ href: `${base}/enquiries`, label: "Enquiries", icon: "message" as const, badge: unanswered }] : []),
    { href: `${base}/reports`, label: "Reports", icon: "chart" },
    { href: `${base}/account`, label: "Account", icon: "user" },
  ];
  const tabs = admin ? ownerTabs : staffTabs;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      <aside className="no-print hidden border-r border-line bg-cream md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:px-4 md:py-5">
        <Link href={base} aria-label="Workspace overview" className="px-2">
          <Logo />
        </Link>
        <div className="mt-5 rounded-[14px] border border-line bg-surface px-3 py-2.5">
          <p className="truncate text-[14px] font-semibold">{ws.org_name}</p>
          <p className="text-[12.5px] text-muted">{ROLE_LABEL[ws.role]}</p>
        </div>
        <nav aria-label="Workspace" className="mt-4">
          <SidebarLinks items={sidebar} />
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3 text-[14px]">
          {all.length > 1 ? (
            <details className="rounded-[12px] px-3 py-2">
              <summary className="cursor-pointer font-semibold">Switch workspace</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {all.filter((w) => w.org_id !== orgId).map((w) => (
                  <li key={w.org_id}>
                    <Link href={`/w/${w.org_id}`} className="block rounded-[8px] px-2 py-1.5 hover:bg-surface">
                      {w.org_name}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <Link href="/" className="flex min-h-11 items-center gap-2 rounded-[12px] px-3 hover:bg-surface">
            <Icon name="swap" size={18} /> Switch to tenant
          </Link>
          <form action="/auth/sign-out" method="post">
            <button type="submit" className="flex min-h-11 w-full items-center gap-2 rounded-[12px] px-3 hover:bg-surface">
              <Icon name="logout" size={18} /> Sign out
            </button>
          </form>
          <p className="px-3 pt-2 text-[12px] leading-snug text-muted">
            Tenants pay through each property&apos;s own arrangements. Figures here are records your staff entered and confirmed.
          </p>
        </div>
      </aside>
      <div className="min-w-0 pb-[76px] md:pb-0">
        <header className="no-print flex items-center justify-between gap-3 border-b border-line bg-cream px-4 py-2.5 md:hidden">
          <Link href={base} className="flex min-w-0 items-center gap-2">
            <Logo withWord={false} />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold">{ws.org_name}</span>
              <span className="block text-[12px] text-muted">{ROLE_LABEL[ws.role]}</span>
            </span>
          </Link>
          <Link href={`${base}/activity`} aria-label="Activity" className="grid size-11 place-items-center rounded-full border border-line bg-surface">
            <Icon name="bell" />
          </Link>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1200px] px-4 py-5 md:px-8 md:py-8">
          {children}
        </main>
      </div>
      <BottomTabs items={tabs} label="Workspace" />
    </div>
  );
}
