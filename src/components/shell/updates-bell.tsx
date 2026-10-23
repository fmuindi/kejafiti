import Link from "next/link";
import { Icon } from "@/components/ui/icon";

/** Updates entry with unread count for every app shell (IMP-08). */
export function UpdatesBell({ count, href = "/updates" }: { count: number; href?: string }) {
  const label = count ? `Updates, ${count} unread` : "Updates";
  return (
    <Link href={href} aria-label={label} className="relative grid size-11 place-items-center rounded-full border border-line bg-surface hover:border-ink">
      <Icon name="bell" />
      {count ? (
        <span aria-hidden="true" className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 font-mono text-[0.6875rem] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
