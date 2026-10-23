import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/components/ui/primitives";

/**
 * The one way back from a page to the page above it: an arrow in a circle and the name of
 * where it goes ("Messages", "Rent register"), so people know where they'll land. A plain link,
 * not history.back(), so it works the same after a refresh or from a shared link.
 */
export function BackLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cx("no-print group inline-flex min-h-11 items-center gap-2 self-start rounded-full pr-2 text-[0.9375rem] font-semibold text-ink hover:text-primary", className)}
    >
      <span aria-hidden="true" className="grid size-9 place-items-center rounded-full border border-line bg-surface transition-colors group-hover:border-primary">
        <Icon name="chevronLeft" size={18} />
      </span>
      <span>
        <span className="sr-only">Back to </span>
        {children}
      </span>
    </Link>
  );
}
