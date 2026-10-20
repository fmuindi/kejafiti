// Viewing states as both sides see them. "state" comes from the database (viewing_states
// view or my_viewings), which turns a request whose time has passed into "expired".

export type ViewingState = "requested" | "new_time_proposed" | "confirmed" | "expired" | "declined" | "cancelled" | "attended" | "not_attended" | "unknown";

/** Still in play: shown with upcoming items and counted as open. */
export const OPEN_STATES: readonly string[] = ["requested", "new_time_proposed", "confirmed"];
/** Needs the advertiser to act: a new request, or one whose time passed without a reply. */
export const STAFF_ACTION_STATES: readonly string[] = ["requested", "expired"];

type Tone = "success" | "waiting" | "error" | "neutral";

export const TENANT_LABEL: Record<string, { label: string; tone: Tone }> = {
  requested: { label: "Requested · awaiting advertiser", tone: "waiting" },
  new_time_proposed: { label: "New time proposed", tone: "waiting" },
  confirmed: { label: "Confirmed", tone: "success" },
  expired: { label: "Time passed · not confirmed", tone: "neutral" },
  declined: { label: "Declined", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  attended: { label: "Attended", tone: "neutral" },
  not_attended: { label: "Not attended", tone: "neutral" },
  unknown: { label: "Outcome not recorded", tone: "neutral" },
};

export const STAFF_LABEL: Record<string, { label: string; tone: Tone }> = {
  requested: { label: "Requested · reply needed", tone: "waiting" },
  new_time_proposed: { label: "Waiting for tenant", tone: "waiting" },
  confirmed: { label: "Confirmed", tone: "success" },
  expired: { label: "Time passed · suggest another", tone: "error" },
};

type Core = { id: string; status: string; state: string; requested_start: string };
type FromView = { [K in keyof Core]?: string | null };
type Narrowed<T> = Omit<T, keyof Core> & Pick<Core, Extract<keyof T, keyof Core>>;

/** Generated types mark every view column nullable; these four never are in viewing_states. */
export function viewingRows<T extends FromView>(rows: T[] | null | undefined): Narrowed<T>[] {
  return (rows ?? []) as Narrowed<T>[];
}
export function viewingRow<T extends FromView>(row: T | null | undefined): Narrowed<T> | null {
  return (row ?? null) as Narrowed<T> | null;
}
