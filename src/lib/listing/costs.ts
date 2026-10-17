import { formatAmount, sumAmounts } from "@/lib/money";

// Mirrors app.recompute_listing_totals in the database (which is what search and sorting
// use). Kept in TypeScript for the live "Tenants will see" preview in the listing wizard;
// tests check both agree on the same fixtures.

export type ChargeKind =
  | "service_charge" | "water" | "electricity" | "garbage" | "security" | "internet" | "parking"
  | "utility_deposit" | "other_deposit" | "agency_fee" | "viewing_fee" | "other";

export type ListingCharge = {
  kind: ChargeKind;
  label?: string | null;
  amount: number | null;
  frequency: "monthly" | "one_off";
  billing: "fixed" | "metered" | "included" | "unknown";
  compulsory: boolean;
};

export const CHARGE_LABEL: Record<ChargeKind, string> = {
  service_charge: "Service charge",
  water: "Water",
  electricity: "Electricity",
  garbage: "Garbage",
  security: "Security",
  internet: "Internet",
  parking: "Parking",
  utility_deposit: "Utility deposit",
  other_deposit: "Other deposit",
  agency_fee: "Agency fee",
  viewing_fee: "Viewing fee",
  other: "Other charge",
};

export const chargeName = (c: Pick<ListingCharge, "kind" | "label">) => c.label?.trim() || CHARGE_LABEL[c.kind];

export type CostSummary = {
  rent: number | null;
  fixedMonthly: number | null;
  deposit: number;
  oneOff: number;
  moveIn: number | null;
  complete: boolean;
  monthlyLines: Array<{ label: string; amount: number | null }>;
  oneOffLines: Array<{ label: string; amount: number | null }>;
  billedSeparately: string[];
  included: string[];
  unconfirmed: string[];
};

export function computeCosts(input: {
  rent: number | null;
  depositAmount?: number | null;
  depositMonths?: number | null;
  charges: ListingCharge[];
}): CostSummary {
  const { rent, charges } = input;
  const fixedCompulsory = charges.filter((c) => c.billing === "fixed" && c.compulsory);
  const monthly = fixedCompulsory.filter((c) => c.frequency === "monthly");
  const oneOff = fixedCompulsory.filter((c) => c.frequency === "one_off");
  const monthlyTotal = sumAmounts(monthly.map((c) => c.amount ?? 0));
  const oneOffTotal = sumAmounts(oneOff.map((c) => c.amount ?? 0));
  const hasDepositAmount = input.depositAmount !== null && input.depositAmount !== undefined;
  const hasDepositMonths = input.depositMonths !== null && input.depositMonths !== undefined;
  const deposit = hasDepositAmount
    ? (input.depositAmount as number)
    : hasDepositMonths && rent !== null
      ? Math.round((input.depositMonths as number) * rent * 100) / 100
      : 0;
  const anyUnknown = fixedCompulsory.some((c) => c.amount === null);

  return {
    rent,
    fixedMonthly: rent === null ? null : sumAmounts([rent, monthlyTotal]),
    deposit,
    oneOff: oneOffTotal,
    moveIn: rent === null ? null : sumAmounts([rent, monthlyTotal, deposit, oneOffTotal]),
    complete: rent !== null && !anyUnknown && (hasDepositAmount || hasDepositMonths),
    monthlyLines: monthly.map((c) => ({ label: chargeName(c), amount: c.amount })),
    oneOffLines: oneOff.map((c) => ({ label: chargeName(c), amount: c.amount })),
    billedSeparately: charges.filter((c) => c.billing === "metered").map((c) => `${chargeName(c).toLowerCase()} (metered)`),
    included: charges.filter((c) => c.billing === "included").map((c) => chargeName(c).toLowerCase()),
    unconfirmed: charges
      .filter((c) => c.billing === "unknown" || (c.billing === "fixed" && c.amount === null))
      .map((c) => chargeName(c)),
  };
}

/** Result-card line under the price: "+ KES 1,000 service charge · water metered". */
export function chargeSummaryLine(charges: ListingCharge[]): string {
  const parts: string[] = [];
  for (const c of charges) {
    if (!c.compulsory) continue;
    const name = chargeName(c).toLowerCase();
    if (c.frequency === "monthly" && c.billing === "fixed") {
      parts.push(c.amount === null ? `${chargeName(c)} not confirmed` : `+ KES ${formatAmount(c.amount)} ${name}`);
    } else if (c.billing === "metered") {
      parts.push(`${name} metered`);
    } else if (c.billing === "included" && c.kind === "service_charge") {
      parts.push("Service included");
    } else if (c.billing === "unknown") {
      parts.push(`${name} not confirmed`);
    }
  }
  return parts.slice(0, 3).join(" · ");
}
