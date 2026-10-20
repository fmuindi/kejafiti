import { Eyebrow } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/dates";
import { CATEGORIES, type Update } from "@/lib/updates";
import { MarkAllRead } from "./mark-all-read";

// Updates grouped by area (IMP-08). Each one opens through /updates/open/<id>, which marks
// it read and checks access at that moment. Opening the page alone changes nothing.
export function ActivityList({ items, orgId }: { items: Update[]; orgId?: string }) {
  if (items.length === 0) return <p className="rounded-[14px] border border-dashed border-line bg-surface p-4 text-[14px] text-muted">No updates yet.</p>;
  const unread = items.filter((i) => !i.read_at).length;
  const groups = CATEGORIES.map((c) => ({ ...c, items: items.filter((i) => i.category === c.key) })).filter((g) => g.items.length);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px]" aria-live="polite">{unread ? <><strong>{unread} unread</strong>. Opening an update marks it read.</> : "All caught up."}</p>
        {unread ? <MarkAllRead orgId={orgId} /> : null}
      </div>
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`upd-${g.key}`}>
          <Eyebrow><span id={`upd-${g.key}`}>{g.label}</span></Eyebrow>
          <ul className="mt-2 flex flex-col divide-y divide-divider overflow-hidden rounded-[16px] border border-line bg-surface">
            {g.items.map((n) => {
              const inner = (
                <>
                  <span className="flex justify-between gap-3">
                    <span className={n.read_at ? "font-semibold" : "font-bold"}>
                      {!n.read_at ? <><span className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle" aria-hidden="true" /><span className="sr-only">Unread: </span></> : null}
                      {n.title}
                    </span>
                    <span className="shrink-0 text-[12.5px] text-muted">{timeAgo(n.created_at)}</span>
                  </span>
                  {n.body ? <span className="text-[13.5px] text-muted">{n.body}</span> : null}
                  {n.restricted ? <span className="text-[13px] text-muted">Details are hidden because you no longer have access.</span> : null}
                </>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <a href={`/updates/open/${n.id}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-cool">{inner}</a>
                  ) : (
                    <div className="flex flex-col gap-0.5 px-4 py-3">{inner}</div>
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
