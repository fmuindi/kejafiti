"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { Avatar, cx } from "@/components/ui/primitives";

/** `avatar`: the signed-in person's name, shown as their initials instead of the icon. */
export type NavItem = { href: string; label: string; icon: IconName; badge?: number; exact?: boolean; avatar?: string };

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

/** Mobile bottom tabs: icon + visible text label, current tab in red. */
export function BottomTabs({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:hidden"
    >
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-[58px] flex-col items-center justify-center gap-1 text-[11.5px] font-semibold",
                  active ? "text-primary" : "text-muted",
                )}
              >
                <span className="relative">
                  {item.avatar ? (
                    <Avatar name={item.avatar} size={24} className={cx("ring-2 ring-offset-1", active ? "ring-primary" : "ring-transparent")} />
                  ) : (
                    <Icon name={item.icon} size={22} />
                  )}
                  {item.badge ? (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[18px] rounded-full bg-primary px-1 text-center text-[10.5px] leading-[18px] text-white">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span>
                  {item.label}
                  {item.badge ? <span className="sr-only"> ({item.badge} waiting)</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop sidebar link list. */
export function SidebarLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-11 items-center gap-2.5 rounded-[12px] px-3 text-[15px] transition-colors",
                active ? "bg-pink font-semibold text-primary-hover" : "text-[#3d4750] hover:bg-surface",
              )}
            >
              <Icon name={item.icon} size={18} className={active ? "text-primary" : "text-muted"} />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="min-w-6 rounded-full bg-primary px-1.5 text-center text-[12px] leading-6 font-bold text-white">
                  {item.badge > 99 ? "99+" : item.badge}
                  <span className="sr-only"> waiting</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Desktop header link: icon and label (label from lg; icon only between md and lg, with the
 * label as its accessible name), a count badge, and a tinted pill on the current page.
 */
export function HeaderLink({ href, children, icon, badge, exact }: { href: string; children: string; icon: IconName; badge?: number; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={badge ? `${children}, ${badge} new` : undefined}
      title={children}
      className={cx(
        "relative inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold transition-colors",
        active ? "bg-pink text-primary-hover" : "text-ink hover:bg-cool",
      )}
    >
      <Icon name={icon} size={18} />
      <span className="sr-only lg:not-sr-only">{children}</span>
      {badge ? (
        <span aria-hidden="true" className="min-w-5 rounded-full bg-primary px-1 text-center text-[11px] leading-5 font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

/** Desktop header: the signed-in person's avatar and "Account", highlighted on account pages. */
export function AccountLink({ href, name }: { href: string; name: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "ml-2 inline-flex min-h-11 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-[15px] font-semibold transition-colors",
        active ? "border-primary text-primary" : "border-line bg-surface text-ink hover:border-ink",
      )}
    >
      <Avatar name={name} size={32} />
      Account
    </Link>
  );
}
