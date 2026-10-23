import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState, cx } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/dates";
import { CATEGORIES, type CategoryKey, type Update } from "@/lib/updates";

const ICON: Record<CategoryKey, IconName> = {
  rent: "wallet",
  enquiries: "message",
  team: "team",
  listings: "home",
  reports: "file",
  support: "info",
  admin: "lock",
  other: "bell",
};

// Updates grouped by area (IMP-08). Each one opens through /updates/open/<id>, which marks
// it read and checks access at that moment. Opening the page alone changes nothing.
export function ActivityList({ items }: { items: Update[] }) {
  if (items.length === 0) return <EmptyState title="Nothing new" icon="bell" />;
  const groups = CATEGORIES.map((c) => ({ ...c, items: items.filter((i) => i.category === c.key) })).filter((g) => g.items.length);
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`upd-${g.key}`} className="flex flex-col gap-2">
          <h2 id={`upd-${g.key}`} className="text-[0.8125rem] font-semibold tracking-[0.4px] text-muted uppercase">{g.label}</h2>
          <ul className="flex flex-col divide-y divide-divider overflow-hidden rounded-[16px] border border-line bg-surface">
            {g.items.map((n) => {
              const icon = n.kind.startsWith("viewing") ? "calendar" : ICON[n.category];
              const inner = (
                <>
                  <span aria-hidden="true" className={cx("grid size-10 shrink-0 place-items-center rounded-[12px]", n.read_at ? "bg-cool text-muted" : "bg-primary text-white")}>
                    <Icon name={icon} size={18} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={n.read_at ? "font-semibold" : "font-bold"}>
                      {!n.read_at ? <span className="sr-only">Unread: </span> : null}
                      {n.title}
                    </span>
                    {n.body ? <span className="line-clamp-2 text-[0.84375rem] text-muted">{n.body}</span> : null}
                    {n.restricted ? <span className="text-[0.8125rem] text-muted">Hidden: you no longer have access.</span> : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-2 self-stretch">
                    <span className="text-[0.75rem] text-muted">{timeAgo(n.created_at)}</span>
                    {n.link ? <Icon name="chevronRight" size={16} className="mt-auto text-muted" /> : null}
                  </span>
                </>
              );
              const row = cx("flex gap-3 px-4 py-3", !n.read_at && "bg-pink/40");
              return (
                <li key={n.id}>
                  {n.link ? (
                    <a href={`/updates/open/${n.id}`} className={cx(row, "hover:bg-cool")}>
                      {inner}
                    </a>
                  ) : (
                    <div className={row}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
