"use client";

import { useState } from "react";
import { formatPeriod, formatPeriodShort } from "@/lib/dates";
import { formatAmount, formatCompact } from "@/lib/money";
import { formatRate } from "@/lib/rent/status";

type Point = { period_start: string; billed: number; settled: number; collection_rate: number | null };

/** Clean round ticks from 0 up to at least `max` (0 / 50K / 100K / 150K). */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/**
 * Months before the first charge have no history; later months with nothing billed are a
 * real zero. The two are drawn and described differently (IMP-17).
 */
export function historyState(points: Point[]): Array<"none" | "zero" | "data"> {
  const first = points.findIndex((p) => Number(p.billed) > 0 || Number(p.settled) > 0);
  return points.map((p, i) => (first === -1 || i < first ? "none" : Number(p.billed) > 0 || Number(p.settled) > 0 ? "data" : "zero"));
}

// Billed rent is a neutral reference track; confirmed allocations are the bar inside it.
// One y-axis with round ticks carries the values; only the latest period is labelled, in
// the caption, so nothing collides. Every month is focusable with a tooltip, and the
// table view holds the same numbers.
export function TrendChart({ points, onOpen }: { points: Point[]; onOpen?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const ticks = niceTicks(Math.max(0, ...points.map((p) => Number(p.billed))));
  const top = ticks[ticks.length - 1] || 1;
  const states = historyState(points);
  const latest = points[points.length - 1];
  const H = 200;
  const describe = (p: Point, i: number) =>
    states[i] === "none"
      ? `${formatPeriod(p.period_start)}: no records yet`
      : states[i] === "zero"
        ? `${formatPeriod(p.period_start)}: no rent billed`
        : `${formatPeriod(p.period_start)}: KSh ${formatAmount(Number(p.settled))} confirmed of KSh ${formatAmount(Number(p.billed))} billed, ${formatRate(p.collection_rate)}`;

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption>
          <span className="block font-display text-lead font-bold">Billed vs confirmed, by rent period</span>
          {latest && states[states.length - 1] === "data" ? (
            <span className="block text-caption text-muted">
              {formatPeriod(latest.period_start)}: KSh {formatAmount(Number(latest.settled))} of {formatAmount(Number(latest.billed))} confirmed ({formatRate(latest.collection_rate)})
            </span>
          ) : null}
        </figcaption>
        <div className="flex items-center gap-4 text-caption text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-chip border border-line bg-divider" aria-hidden="true" />Rent billed</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-chip bg-success" aria-hidden="true" />Confirmed</span>
          <button type="button" className="link-action inline-flex min-h-11 items-center" onClick={() => setTable(!table)} aria-pressed={table}>
            {table ? "View as chart" : "View as table"}
          </button>
        </div>
      </div>
      {table ? (
        <table className="w-full text-label">
          <thead>
            <tr className="border-b border-line text-left font-mono text-micro text-muted">
              <th scope="col" className="py-2 font-medium">Period</th>
              <th scope="col" className="py-2 text-right font-medium">Billed</th>
              <th scope="col" className="py-2 text-right font-medium">Confirmed</th>
              <th scope="col" className="py-2 text-right font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={p.period_start} className="border-b border-divider">
                <td className="py-2">{formatPeriod(p.period_start)}</td>
                {states[i] === "none" ? (
                  <td colSpan={3} className="py-2 text-right text-muted">No records yet</td>
                ) : (
                  <>
                    <td className="py-2 text-right tabular-nums">{formatAmount(Number(p.billed))}</td>
                    <td className="py-2 text-right tabular-nums">{formatAmount(Number(p.settled))}</td>
                    <td className="py-2 text-right tabular-nums">{states[i] === "zero" ? "No rent billed" : formatRate(p.collection_rate)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <div className="grid grid-cols-[auto_1fr] gap-2">
            {/* Y-axis: round ticks in KSh, recessive. */}
            <div className="relative w-9 font-mono text-micro text-muted" style={{ height: H }} aria-hidden="true">
              {ticks.map((t) => (
                <span key={t} className="absolute right-0 whitespace-nowrap" style={{ bottom: `${(t / top) * H}px`, transform: "translateY(50%)" }}>
                  {t === 0 ? "0" : formatCompact(t)}
                </span>
              ))}
            </div>
            <div className="relative" style={{ height: H }}>
              {ticks.map((t) => (
                <div key={t} aria-hidden="true" className="absolute inset-x-0 border-t border-divider" style={{ bottom: `${(t / top) * H}px` }} />
              ))}
              <div className="absolute inset-0 flex items-end gap-3" role="list" aria-label="Rent billed and confirmed per period, in KSh">
                {points.map((p, i) => {
                  const billedH = (Number(p.billed) / top) * H;
                  const settledH = (Number(p.settled) / top) * H;
                  return (
                    <div
                      key={p.period_start}
                      role="listitem"
                      tabIndex={0}
                      aria-label={describe(p, i)}
                      onPointerEnter={() => setActive(i)}
                      onPointerLeave={() => setActive(null)}
                      onFocus={() => setActive(i)}
                      onBlur={() => setActive(null)}
                      className="relative flex h-full flex-1 flex-col justify-end rounded-t-chip outline-offset-2"
                    >
                      {states[i] === "none" ? (
                        <div className="mx-auto h-full w-full max-w-narrow rounded-t-chip border border-dashed border-line" />
                      ) : (
                        <div className="relative mx-auto w-full max-w-narrow rounded-t-chip border border-b-0 border-line bg-divider" style={{ height: Math.max(billedH, 2) }}>
                          <div
                            className={`absolute inset-x-0 bottom-0 rounded-t-chip bg-success transition-opacity ${active !== null && active !== i ? "opacity-60" : ""}`}
                            style={{ height: billedH ? `${Math.min(100, (settledH / billedH) * 100)}%` : 0 }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <span aria-hidden="true" />
            <div className="flex gap-3" aria-hidden="true">
              {points.map((p, i) => (
                <span key={p.period_start} className={`flex-1 text-center text-caption ${i === points.length - 1 ? "font-bold" : "text-muted"}`}>
                  {formatPeriodShort(p.period_start)}
                </span>
              ))}
            </div>
          </div>
          {active !== null ? (
            <div role="status" className="pointer-events-none absolute top-0 right-0 rounded-control border border-line bg-surface px-3 py-2 text-caption shadow-raised">
              <p className="font-semibold">{formatPeriod(points[active].period_start)}</p>
              {states[active] === "none" ? (
                <p className="text-muted">No records yet</p>
              ) : states[active] === "zero" ? (
                <p className="text-muted">No rent billed</p>
              ) : (
                <>
                  <p><strong className="tabular-nums">{formatAmount(Number(points[active].settled))}</strong> <span className="text-muted">confirmed</span></p>
                  <p><strong className="tabular-nums">{formatAmount(Number(points[active].billed))}</strong> <span className="text-muted">billed</span></p>
                  <p className="text-muted">{formatRate(points[active].collection_rate)}</p>
                </>
              )}
            </div>
          ) : null}
          {states.includes("none") ? <p className="mt-2 text-caption text-muted">Dashed outline: no records for that month yet (not the same as zero).</p> : null}
        </div>
      )}
      <p className="text-caption text-muted">
        By rent period: confirmed payments allocated to each month&apos;s rent, whenever they were paid. Payments waiting for confirmation are not included.
        {onOpen ? " Select a unit below, or open the register, to see the records." : ""}
      </p>
    </figure>
  );
}
