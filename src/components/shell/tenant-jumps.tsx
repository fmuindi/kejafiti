import { JumpLinks, type Jump } from "./jump-links";
import { getTenantCounts } from "@/lib/tenant-counts";

/**
 * The tenant's main places, minus the page they're on, with live counts. Anything waiting on
 * them (unread messages, a viewing time to answer) is highlighted and comes first.
 */
export async function TenantJumps({ current }: { current: "/messages" | "/viewings" | "/saved" | "/account" | "/updates" | "/help" | "/my-rent" }) {
  const c = await getTenantCounts();
  const all: Jump[] = [
    { href: "/messages", label: "Messages", icon: "message", count: c.unread, attention: c.unread > 0 },
    {
      href: "/viewings",
      label: c.viewingsNeedYou ? "Viewings · reply needed" : "Viewings",
      icon: "calendar",
      count: c.viewingsNeedYou || c.viewingsUpcoming,
      attention: c.viewingsNeedYou > 0,
    },
    ...(c.tenancies ? [{ href: "/my-rent", label: "My rent", icon: "wallet" as const }] : []),
    { href: "/saved", label: "Saved", icon: "heart", count: c.saved },
    { href: "/search", label: "Find homes", icon: "search" },
  ];
  const items = all.filter((j) => j.href !== current).sort((a, b) => Number(!!b.attention) - Number(!!a.attention));
  return <JumpLinks items={items} />;
}
