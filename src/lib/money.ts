// Exact money handling. Amounts travel as numbers with at most 2 decimals; arithmetic is
// done in integer cents so 0.1 + 0.2 style errors cannot creep into previews.

export type Currency = "KES" | "KSh";

export const toCents = (amount: number) => Math.round(amount * 100);
export const fromCents = (cents: number) => cents / 100;

export function sumAmounts(values: number[]): number {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), 0));
}

export function subtract(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

const formatter = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** "15,000" or "15,000.50" */
export function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return formatter.format(amount);
}

/** Marketplace uses "KES", the rent module uses "KSh" (per the design handoff). */
export function formatMoney(amount: number | null | undefined, currency: Currency = "KSh"): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return `${currency} ${formatAmount(amount)}`;
}

/** Compact map-pin style: 14k, 18.5k */
export function formatCompact(amount: number): string {
  if (amount >= 1000) {
    const k = Math.round(amount / 100) / 10;
    return `${k}k`;
  }
  return String(amount);
}

/**
 * Parses a typed amount ("15,000", "15000.5", " 15 000 ") into a number with at most two
 * decimals. Returns null for empty input and NaN for invalid input.
 */
export function parseAmount(input: FormDataEntryValue | string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).replace(/[\s,]/g, "").replace(/^(KES|KSh)/i, "");
  if (raw === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return Number.NaN;
  return Number(raw);
}
