import { cx } from "./primitives";
import { appointmentParts } from "@/lib/dates";

/** A calendar-leaf date ("OCT / 24") for appointments; the time sits beside it. */
export function DateTile({ at, tone = "neutral" }: { at: string; tone?: "neutral" | "success" | "waiting" }) {
  const p = appointmentParts(at);
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex w-14 shrink-0 flex-col overflow-hidden rounded-[12px] border text-center",
        tone === "success" ? "border-success/40" : tone === "waiting" ? "border-waiting-dot" : "border-line",
      )}
    >
      <span className={cx("py-0.5 text-[11px] font-bold tracking-[0.6px] uppercase", tone === "success" ? "bg-success text-white" : tone === "waiting" ? "bg-waiting-dot text-ink" : "bg-ink text-white")}>
        {p.month}
      </span>
      <span className="bg-surface py-1 font-display text-[22px] leading-none font-bold">{p.day}</span>
    </span>
  );
}
