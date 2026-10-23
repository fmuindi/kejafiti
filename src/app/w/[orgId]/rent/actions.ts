"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { emailConfigured, kickDelivery } from "@/lib/delivery";
import { SITE_URL } from "@/lib/env";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

// Every action re-reads the session and calls a SECURITY DEFINER function that checks
// membership, property assignment and the specific permission again. The browser never
// decides who may confirm.

const uuid = z.string().uuid();
const money = z.number().positive().multipleOf(0.01).max(99_999_999);

const entrySchema = z.object({
  client_request_id: uuid,
  entry_id: uuid.optional(),
  expected_version: z.number().int().positive().optional(),
  tenancy_id: uuid,
  amount: money,
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(["mpesa", "bank", "cash", "other"]).optional(),
  reference: z.string().max(80).optional(),
  notes: z.string().max(1000).optional(),
  allocations: z.array(z.object({ charge_id: uuid, amount: z.number().nonnegative().multipleOf(0.01) })).max(24),
  action: z.enum(["draft", "submit", "confirm"]),
  acknowledged: z.boolean().optional(),
});

export type EntryInput = z.infer<typeof entrySchema>;
export type EntryResult = { id: string; ref: string; status: string; version: number; replayed: boolean };

function revalidateRent(orgId: string, propertyId?: string) {
  revalidatePath(`/w/${orgId}/rent`, "layout");
  revalidatePath(`/w/${orgId}`, "layout");
  if (propertyId) revalidatePath(`/w/${orgId}/rent/${propertyId}`, "layout");
}

export async function savePaymentEntry(orgId: string, propertyId: string, input: EntryInput): Promise<ActionResult<EntryResult>> {
  await requireUser(`/w/${orgId}/rent/${propertyId}`);
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "form");
      fieldErrors[k] ??= k === "amount" ? "Enter the amount paid in KSh." : k === "paid_on" ? "Enter the date the tenant paid." : "Check this field.";
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_payment_entry", {
    p: {
      ...p,
      allocations: p.allocations.filter((a) => a.amount > 0),
      reference: p.reference?.trim() || null,
      notes: p.notes?.trim() || null,
    },
  });
  if (error) return fail(error);
  revalidateRent(orgId, propertyId);
  return { ok: true, data: data as unknown as EntryResult };
}

export async function findDuplicates(input: { tenancyId: string; amount: number; paidOn: string; reference?: string; excludeId?: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("possible_duplicates", {
    p_tenancy: input.tenancyId,
    p_amount: input.amount,
    p_paid_on: input.paidOn,
    p_reference: input.reference ?? "",
    p_exclude: input.excludeId,
  });
  return (data ?? []) as Array<{ id: string; ref: string; amount: number; paid_on: string; reference: string | null; status: string; reason: string }>;
}

export async function decideEntry(
  orgId: string,
  input: { entryId: string; decision: "confirm" | "return" | "not_accept"; reason?: string; acknowledged?: boolean; version?: number },
): Promise<ActionResult<{ status: string }>> {
  await requireUser(`/w/${orgId}/rent/inbox`);
  if (!uuid.safeParse(input.entryId).success) return { ok: false, message: "Entry not found." };
  if (input.decision !== "confirm" && (input.reason ?? "").trim().length < 3) {
    return { ok: false, message: "Explain what needs to change.", fieldErrors: { reason: "Explain what needs to change, so the person who entered it can fix it." } };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_entry", {
    p_entry: input.entryId,
    p_decision: input.decision,
    p_reason: input.reason ?? undefined,
    p_acknowledged: input.acknowledged ?? false,
    p_expected_version: input.version,
  });
  if (error) return fail(error);
  revalidateRent(orgId);
  return { ok: true, data: { status: (data as { status: string }).status } };
}

export async function confirmEntries(orgId: string, ids: string[], acknowledged: boolean) {
  await requireUser(`/w/${orgId}/rent/inbox`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_entries", { p_entries: ids, p_acknowledged: acknowledged });
  if (error) return fail(error);
  revalidateRent(orgId);
  return { ok: true as const, data: data as unknown as Array<{ id: string; ok: boolean; ref?: string; error?: string; replayed?: boolean }> };
}

export async function reverseEntry(orgId: string, propertyId: string, entryId: string, reason: string): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/rent/${propertyId}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_entry", { p_entry: entryId, p_reason: reason });
  if (error) return fail(error);
  revalidateRent(orgId, propertyId);
  return { ok: true };
}

export async function correctEntry(orgId: string, propertyId: string, entryId: string, reason: string, input: EntryInput): Promise<ActionResult<EntryResult>> {
  await requireUser(`/w/${orgId}/rent/${propertyId}`);
  if (reason.trim().length < 3) return { ok: false, message: "Give a reason for the correction.", fieldErrors: { reason: "Give a reason for the correction." } };
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the corrected amount, date and periods." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("correct_entry", {
    p_entry: entryId,
    p_reason: reason,
    p: { ...parsed.data, allocations: parsed.data.allocations.filter((a) => a.amount > 0) },
  });
  if (error) return fail(error);
  revalidateRent(orgId, propertyId);
  return { ok: true, data: data as unknown as EntryResult };
}

export async function applyCredit(orgId: string, propertyId: string, entryId: string, allocations: Array<{ charge_id: string; amount: number }>): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/rent/${propertyId}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_credit", { p_entry: entryId, p_allocations: allocations.filter((a) => a.amount > 0) });
  if (error) return fail(error);
  revalidateRent(orgId, propertyId);
  return { ok: true };
}

export async function registerAttachment(input: { entryId: string; path: string; fileName: string; mimeType: string; size: number }): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_attachment", {
    p: { entry_id: input.entryId, storage_path: input.path, file_name: input.fileName, mime_type: input.mimeType, size_bytes: input.size },
  });
  if (error) return fail(error);
  return { ok: true, data: { id: data as unknown as string } };
}

export async function removeAttachment(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_attachment", { p_attachment: id });
  if (error) return fail(error);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tenancies and charges
// ---------------------------------------------------------------------------

const tenancySchema = z.object({
  unit_id: uuid,
  tenant_name: z.string().trim().min(1, "Enter the tenant's name.").max(120),
  tenant_phone: z.string().trim().max(30).optional(),
  tenant_email: z.union([z.literal(""), z.string().trim().email("Enter a valid email, or leave it blank.")]).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the tenancy start date."),
  rent_amount: z.number({ message: "Enter the monthly rent in KSh." }).positive("Enter the monthly rent in KSh."),
  due_day: z.number().int().min(1).max(28),
  deposit_held: z.number().nonnegative().optional(),
  opening_balance: z.number().optional(),
  opening_balance_date: z.string().optional(),
  opening_balance_note: z.string().max(300).optional(),
});

export async function createTenancy(orgId: string, propertyId: string, input: z.input<typeof tenancySchema>): Promise<ActionResult<{ id: string }>> {
  await requireUser(`/w/${orgId}/rent/${propertyId}`);
  const parsed = tenancySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_tenancy", { p: parsed.data });
  if (error) return fail(error);
  revalidateRent(orgId, propertyId);
  return { ok: true, data: { id: data as unknown as string } };
}

export async function endTenancy(orgId: string, propertyId: string, tenancyId: string, endDate: string, reason: string, occupancy: string): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/rent/${propertyId}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_tenancy", { p_tenancy: tenancyId, p_end_date: endDate, p_reason: reason, p_unit_occupancy: occupancy });
  if (error) return fail(error);
  revalidateRent(orgId, propertyId);
  return { ok: true };
}

export async function changeRent(orgId: string, propertyId: string, tenancyId: string, effectiveFrom: string, amount: number, note: string): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/rent/${propertyId}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_rent", { p_tenancy: tenancyId, p_effective_from: effectiveFrom, p_amount: amount, p_note: note });
  if (error) return fail(error);
  revalidateRent(orgId, propertyId);
  return { ok: true };
}

export async function generateCharges(orgId: string, propertyId: string, period: string): Promise<ActionResult<{ created: number }>> {
  await requireUser(`/w/${orgId}/rent/${propertyId}`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_rent_charges", { p_property: propertyId, p_period: period });
  if (error) return fail(error);
  revalidateRent(orgId, propertyId);
  return { ok: true, data: { created: data as unknown as number } };
}

export async function adjustCharge(orgId: string, propertyId: string, chargeId: string, reduceBy: number, reason: string): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/rent/${propertyId}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_charge", { p_charge: chargeId, p_reduce_by: reduceBy, p_reason: reason });
  if (error) return fail(error);
  revalidateRent(orgId, propertyId);
  return { ok: true };
}

export async function setAutoCharges(orgId: string, propertyId: string, enabled: boolean): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/rent/${propertyId}`);
  const supabase = await createClient();
  const { error } = await supabase.from("properties").update({ auto_charges: enabled }).eq("id", propertyId);
  if (error) return fail(error);
  revalidateRent(orgId, propertyId);
  return { ok: true };
}

// Tenant self-view. The invitation link is returned once so staff can also share it directly
// (e.g. by WhatsApp) when email is off; only its hash is stored.
export async function inviteTenantAccess(orgId: string, propertyId: string, tenantId: string, email: string): Promise<ActionResult<{ link: string; expiresAt: string; emailQueued: boolean }>> {
  await requireUser(`/w/${orgId}/rent/${propertyId}`);
  if (!uuid.safeParse(tenantId).success) return { ok: false, message: "This tenant record wasn't found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_tenant_access", { p_tenant: tenantId, p_email: email });
  if (error) return fail(error);
  const r = data as unknown as { token: string; expires_at: string };
  await kickDelivery();
  revalidateRent(orgId, propertyId);
  return { ok: true, data: { link: `${SITE_URL}/tenant-invite/${r.token}`, expiresAt: r.expires_at, emailQueued: emailConfigured() } };
}

export async function revokeTenantAccess(orgId: string, propertyId: string, tenantId: string): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/rent/${propertyId}`);
  if (!uuid.safeParse(tenantId).success) return { ok: false, message: "This tenant record wasn't found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_tenant_access", { p_tenant: tenantId });
  if (error) return fail(error);
  revalidateRent(orgId, propertyId);
  return { ok: true };
}
