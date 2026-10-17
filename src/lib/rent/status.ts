// Display rules for the three independent dimensions: occupancy, rent status (computed
// from charges and confirmed allocations in public.rent_register) and entry status.

export type RentStatus =
  | "not_yet_due" | "unpaid" | "partial" | "paid" | "credit" | "vacant" | "unavailable" | "no_charge";
export type EntryStatus = "draft" | "awaiting_confirmation" | "returned" | "not_accepted" | "confirmed" | "reversed";
export type Occupancy = "occupied" | "notice_given" | "vacant" | "reserved" | "unavailable";

export type Tone = "success" | "waiting" | "error" | "neutral" | "info";

export const RENT_STATUS: Record<RentStatus, { label: string; tone: Tone }> = {
  paid: { label: "Paid", tone: "success" },
  credit: { label: "Paid · credit", tone: "success" },
  partial: { label: "Partial", tone: "waiting" },
  unpaid: { label: "Unpaid", tone: "error" },
  not_yet_due: { label: "Not yet due", tone: "neutral" },
  vacant: { label: "Vacant", tone: "neutral" },
  unavailable: { label: "Unavailable", tone: "neutral" },
  no_charge: { label: "No charge yet", tone: "neutral" },
};

export const ENTRY_STATUS: Record<EntryStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  awaiting_confirmation: { label: "Awaiting confirmation", tone: "waiting" },
  returned: { label: "Returned", tone: "waiting" },
  not_accepted: { label: "Not accepted", tone: "error" },
  confirmed: { label: "Confirmed", tone: "success" },
  reversed: { label: "Corrected · original kept", tone: "neutral" },
};

export const OCCUPANCY: Record<Occupancy, string> = {
  occupied: "Occupied",
  notice_given: "Notice given",
  vacant: "Vacant",
  reserved: "Let / reserved",
  unavailable: "Unavailable",
};

export const METHOD_LABEL: Record<string, string> = { mpesa: "M-PESA", bank: "Bank", cash: "Cash", other: "Other" };

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  agency_admin: "Agency admin",
  manager: "Property manager",
  caretaker: "Caretaker",
  viewer: "Accountant, view only",
};

/** Collection rate as shown on the dashboard: one decimal, N/A when nothing was billed. */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "N/A";
  return `${rate.toFixed(1).replace(/\.0$/, "")}%`;
}

export function collectionRate(settled: number, billed: number): number | null {
  if (!billed) return null;
  return Math.round((settled / billed) * 1000) / 10;
}
