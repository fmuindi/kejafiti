// All dates are shown in East Africa Time (Africa/Nairobi, UTC+3, no DST).
export const TZ = "Africa/Nairobi";

export function todayEAT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** First day of the month containing an ISO date, as YYYY-MM-01. */
export function periodOf(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function currentPeriod(): string {
  return periodOf(todayEAT());
}

export function addMonths(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 10);
}

export function isPeriod(value: string | undefined | null): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value);
}

/** "2026-10" from a URL → "2026-10-01" */
export function parsePeriodParam(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return `${v}-01`;
  if (isPeriod(v)) return v;
  return currentPeriod();
}

export function periodParam(period: string): string {
  return period.slice(0, 7);
}

export function formatPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("en-KE", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export function formatPeriodShort(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("en-KE", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** "15 Oct 2026" for a plain date (no timezone shift). */
export function formatDate(iso: string | null | undefined, opts: { year?: boolean } = {}): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(opts.year === false ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Wed 15 Oct" */
export function formatDayDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Timestamp in EAT: "16 Oct 2026, 14:05 EAT" */
export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  const s = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(new Date(ts));
  return `${s} EAT`;
}

/** "Thu 23 Oct, 10:30 AM" in EAT */
export function formatAppointment(ts: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TZ,
  })
    .format(new Date(ts))
    .replace(" am", " AM")
    .replace(" pm", " PM");
}

export function formatTime(ts: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(
    new Date(ts),
  );
}

/** "2 h ago", "5 min ago", "3 days ago" */
export function timeAgo(ts: string | null | undefined, now: Date = new Date()): string {
  if (!ts) return "never";
  const diff = Math.max(0, now.getTime() - new Date(ts).getTime());
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** Days between a past timestamp and now (for stale availability confirmations). */
export function daysSince(ts: string | null | undefined, now: Date = new Date()): number | null {
  if (!ts) return null;
  return Math.floor((now.getTime() - new Date(ts).getTime()) / 86400000);
}

/** ISO timestamp for `hours` hours before now. */
export function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

/** Convert an EAT local "YYYY-MM-DDTHH:mm" (from <input type=datetime-local>) to ISO UTC. */
export function eatLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  return new Date(`${local}:00+03:00`).toISOString();
}

/** Pieces of an appointment for a calendar-style tile: { month: "Oct", day: "24", weekday: "Sat", time: "3:00 PM" } in EAT. */
export function appointmentParts(ts: string): { month: string; day: string; weekday: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ }).formatToParts(new Date(ts));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { month: get("month"), day: get("day"), weekday: get("weekday"), time: `${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}` };
}
