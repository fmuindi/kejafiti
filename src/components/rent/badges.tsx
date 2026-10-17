import { StatusBadge } from "@/components/ui/primitives";
import { ENTRY_STATUS, RENT_STATUS, type EntryStatus, type RentStatus } from "@/lib/rent/status";

export function RentStatusBadge({ status, overdue }: { status: RentStatus; overdue?: boolean }) {
  const s = RENT_STATUS[status] ?? RENT_STATUS.no_charge;
  return (
    <StatusBadge tone={s.tone}>
      {s.label}
      {overdue ? " · overdue" : ""}
    </StatusBadge>
  );
}

export function EntryStatusBadge({ status }: { status: string }) {
  const s = ENTRY_STATUS[status as EntryStatus] ?? { label: status, tone: "neutral" as const };
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}
