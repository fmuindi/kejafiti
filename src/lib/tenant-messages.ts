import type { Tone } from "@/lib/rent/status";

// Invoices, reminders and messages staff email to tenants (public.send_tenant_messages).
// Each is kept with its figures as sent; the same record drives the email, the staff history
// and what the tenant sees in My rent.

export type MessageKind = "invoice" | "reminder" | "message";

export type InvoiceDetails = {
  period_label: string;
  lines: Array<{ label: string; amount: number; due_date: string }>;
  period_total: number;
  earlier_balance: number;
  amount_due: number;
  credit: number;
  due_date: string;
};

export type ReminderDetails = {
  balance: number;
  as_of: string;
  lines: Array<{ label: string; outstanding: number; due_date: string; overdue: boolean }>;
};

export type TenantMessage = {
  id: string;
  tenancy_id: string;
  property_id: string;
  kind: MessageKind;
  ref: string | null;
  subject: string;
  body: string | null;
  period_start: string | null;
  details: Partial<InvoiceDetails & ReminderDetails>;
  email: string;
  delivery_status: "queued" | "sending" | "accepted" | "delivered" | "failed" | "cancelled";
  delivery_error: string | null;
  created_at: string;
  sent_by: string | null;
};

export const MESSAGE_COLUMNS =
  "id, tenancy_id, property_id, kind, ref, subject, body, period_start, details, email, delivery_status, delivery_error, created_at, sent_by";

export const KIND_LABEL: Record<MessageKind, string> = { invoice: "Invoice", reminder: "Reminder", message: "Message" };

/** Whether the email went, in words. "Queued" while email is switched off says so. */
export function deliveryLabel(status: TenantMessage["delivery_status"], emailOn: boolean): { label: string; tone: Tone } {
  switch (status) {
    case "queued":
      return emailOn ? { label: "Sending soon", tone: "waiting" } : { label: "Waiting: email is off", tone: "waiting" };
    case "sending":
      return { label: "Sending", tone: "waiting" };
    case "accepted":
      return { label: "Emailed", tone: "success" };
    case "delivered":
      return { label: "Delivered", tone: "success" };
    case "failed":
      return { label: "Not sent", tone: "error" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
  }
}

/** Why a tenant was left out of a send. */
export const SKIP_REASON: Record<string, string> = {
  no_email: "no email address on file",
  no_charges: "no charges for that month yet",
  nothing_owed: "nothing owed",
  reminded_recently: "already reminded in the last day",
  linked: "already has online access",
  invited: "a link is already waiting for them",
  refused: "couldn't be invited",
};

export type SendResult = {
  sent: Array<{ tenancy_id: string; id: string; ref: string | null }>;
  skipped: Array<{ tenancy_id: string; name: string; unit_label: string; reason: string }>;
};

/** "Sent to 3 tenants." plus who was skipped and why, for the result notice. */
export function summarizeSend(kind: MessageKind, r: SendResult): { title: string; skipped: string[] } {
  const noun = kind === "invoice" ? "invoice" : kind === "reminder" ? "reminder" : "message";
  const n = r.sent.length;
  const title = n === 0 ? `No ${noun}s sent.` : n === 1 ? `1 ${noun} sent.` : `${n} ${noun}s sent.`;
  return { title, skipped: r.skipped.map((s) => `${s.name} (unit ${s.unit_label}): ${SKIP_REASON[s.reason] ?? "skipped"}`) };
}
