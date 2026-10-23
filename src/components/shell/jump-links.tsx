import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import { cx } from "@/components/ui/primitives";

/** `attention`: highlighted in red because something there is waiting for the person. */
export type Jump = { href: string; label: string; icon: IconName; count?: number; attention?: boolean };

/**
 * The related places one tap away from a page ("Viewings 1", "Saved 3", "Find homes"), so
 * nobody has to go looking. Scrolls sideways on a phone instead of wrapping.
 */
export function JumpLinks({ items, label = "Related" }: { items: Jump[]; label?: string }) {
  return (
    <nav aria-label={label} className="no-print -mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <ul className="flex w-max gap-2 pb-0.5">
        {items.map((j) => (
          <li key={j.href + j.label}>
            <Link
              href={j.href}
              className={cx(
                "group inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] py-1.5 pr-3 pl-2 text-[0.90625rem] font-semibold whitespace-nowrap transition-colors",
                j.attention ? "border-primary bg-pink text-primary-hover hover:bg-primary hover:text-white" : "border-line bg-surface text-ink hover:border-ink",
              )}
            >
              <span aria-hidden="true" className={cx("grid size-7 place-items-center rounded-full", j.attention ? "bg-primary text-white group-hover:bg-white group-hover:text-primary" : "bg-cool text-deep")}>
                <Icon name={j.icon} size={16} />
              </span>
              {j.label}
              {j.count ? (
                <span className={cx("min-w-6 rounded-full px-1.5 text-center text-[0.78125rem] leading-6 font-bold", j.attention ? "bg-primary text-white group-hover:bg-white group-hover:text-primary" : "bg-cool text-ink")}>
                  {j.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
