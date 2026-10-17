"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { cx } from "@/components/ui/primitives";

export type NavItem = { href: string; label: string; icon: IconName; badge?: number; exact?: boolean };

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
                  <Icon name={item.icon} size={22} />
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
                "flex min-h-11 items-center justify-between gap-2 rounded-[12px] px-3 text-[15px]",
                active ? "border border-line bg-surface font-semibold text-ink" : "text-[#3d4750] hover:bg-surface/70",
              )}
            >
              <span>{item.label}</span>
              {item.badge ? (
                <span className="font-mono text-[12.5px] font-medium text-waiting">
                  {item.badge}
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

export function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx("rounded-[10px] px-2.5 py-2 text-[15px] font-semibold", active ? "text-primary" : "text-ink hover:bg-cool")}
    >
      {children}
    </Link>
  );
}
