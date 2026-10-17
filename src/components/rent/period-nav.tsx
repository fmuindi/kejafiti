import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { addMonths, currentPeriod, formatPeriod, periodParam } from "@/lib/dates";

export function PeriodNav({ period, hrefFor, note }: { period: string; hrefFor: (period: string) => string; note?: string }) {
  const next = addMonths(period, 1);
  const canNext = next <= addMonths(currentPeriod(), 1);
  return (
    <div className="flex items-center justify-between gap-2 rounded-[14px] border border-line bg-surface px-1.5 py-1">
      <Link href={hrefFor(addMonths(period, -1))} aria-label={`Previous period, ${formatPeriod(addMonths(period, -1))}`} className="grid size-11 place-items-center rounded-full hover:bg-cool">
        <Icon name="chevronLeft" />
      </Link>
      <div className="text-center">
        <p className="font-semibold">
          <span className="sr-only">Rent period: </span>
          {formatPeriod(period)} rent
        </p>
        {note ? <p className="text-[12.5px] text-muted">{note}</p> : null}
      </div>
      {canNext ? (
        <Link href={hrefFor(next)} aria-label={`Next period, ${formatPeriod(next)}`} className="grid size-11 place-items-center rounded-full hover:bg-cool">
          <Icon name="chevronRight" />
        </Link>
      ) : (
        <span className="size-11" aria-hidden="true" />
      )}
    </div>
  );
}

export const periodHref = (base: string, extra: Record<string, string | undefined> = {}) => (period: string) => {
  const u = new URLSearchParams({ period: periodParam(period) });
  for (const [k, v] of Object.entries(extra)) if (v) u.set(k, v);
  return `${base}?${u.toString()}`;
};
