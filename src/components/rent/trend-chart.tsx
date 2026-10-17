"use client";

import { useState } from "react";
import { formatPeriodShort, formatPeriod } from "@/lib/dates";
import { formatAmount, formatCompact } from "@/lib/money";
import { formatRate } from "@/lib/rent/status";

type Point = { period_start: string; billed: number; settled: number; collection_rate: number | null };

// Billed rent is a neutral reference track; confirmed allocations are the teal bar inside
// it. Every bar is focusable and shows its values on hover/focus; a table view holds the
// same numbers without hovering.
export function TrendChart({ points, onOpen }: { points: Point[]; onOpen?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...points.map((p) => Number(p.billed)));
  const H = 200;

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption className="font-display text-[18px] font-bold">Billed vs confirmed, by rent period</figcaption>
        <div className="flex items-center gap-4 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-[3px] border border-line bg-divider" aria-hidden="true" />Rent billed</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-[3px] bg-success" aria-hidden="true" />Confirmed</span>
          <button type="button" className="font-semibold text-primary underline" onClick={() => setTable(!table)} aria-pressed={table}>
            {table ? "View as chart" : "View as table"}
          </button>
        </div>
      </div>
      {table ? (
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[12px] text-muted">
              <th scope="col" className="py-2 font-medium">Period</th>
              <th scope="col" className="py-2 text-right font-medium">Billed</th>
              <th scope="col" className="py-2 text-right font-medium">Confirmed</th>
              <th scope="col" className="py-2 text-right font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.period_start} className="border-b border-divider">
                <td className="py-2">{formatPeriod(p.period_start)}</td>
                <td className="py-2 text-right font-mono">{formatAmount(Number(p.billed))}</td>
                <td className="py-2 text-right font-mono">{formatAmount(Number(p.settled))}</td>
                <td className="py-2 text-right font-mono">{formatRate(p.collection_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <div className="flex items-end gap-3 border-b border-line pt-6" style={{ height: H + 24 }} role="list" aria-label="Rent billed and confirmed per period">
            {points.map((p, i) => {
              const billedH = (Number(p.billed) / max) * H;
              const settledH = (Number(p.settled) / max) * H;
              const last = i === points.length - 1;
              return (
                <div
                  key={p.period_start}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${formatPeriod(p.period_start)}: KSh ${formatAmount(Number(p.billed))} billed, KSh ${formatAmount(Number(p.settled))} confirmed, ${formatRate(p.collection_rate)}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="relative flex h-full flex-1 flex-col justify-end rounded-t-[6px] outline-offset-2"
                >
                  <span className="absolute -top-1 left-1/2 -translate-x-1/2 font-mono text-[11.5px] whitespace-nowrap text-muted">
                    {Number(p.billed) === 0 ? (
                      "—"
                    ) : last ? (
                      <>
                        <span className="hidden sm:inline">{`${formatCompact(Number(p.settled))} of ${formatCompact(Number(p.billed))}`}</span>
                        <span className="sm:hidden">{formatRate(p.collection_rate)}</span>
                      </>
                    ) : (
                      formatRate(p.collection_rate)
                    )}
                  </span>
                  <div className="relative mx-auto w-full max-w-[56px] rounded-t-[4px] border border-b-0 border-line bg-divider" style={{ height: Math.max(billedH, 2) }}>
                    <div
                      className={`absolute inset-x-0 bottom-0 rounded-t-[4px] bg-success transition-opacity ${active !== null && active !== i ? "opacity-60" : ""}`}
                      style={{ height: billedH ? `${(settledH / billedH) * 100}%` : 0 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-3">
            {points.map((p, i) => (
              <span key={p.period_start} className={`flex-1 text-center text-[13px] ${i === points.length - 1 ? "font-bold" : "text-muted"}`}>{formatPeriodShort(p.period_start)}</span>
            ))}
          </div>
          {active !== null ? (
            <div role="status" className="pointer-events-none absolute top-0 right-0 rounded-[12px] border border-line bg-surface px-3 py-2 text-[13px] shadow-[0_6px_18px_rgba(0,0,0,0.08)]">
              <p className="font-semibold">{formatPeriod(points[active].period_start)}</p>
              <p><strong className="font-mono">{formatAmount(Number(points[active].settled))}</strong> <span className="text-muted">confirmed</span></p>
              <p><strong className="font-mono">{formatAmount(Number(points[active].billed))}</strong> <span className="text-muted">billed</span></p>
              <p className="text-muted">{formatRate(points[active].collection_rate)}</p>
            </div>
          ) : null}
        </div>
      )}
      {onOpen ? <p className="text-[12.5px] text-muted">Select a unit below, or open the register, to see the underlying records.</p> : null}
    </figure>
  );
}
