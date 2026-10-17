"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/env";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { kickDelivery } from "@/lib/delivery";

const accessSchema = z.object({
  role: z.enum(["agency_admin", "manager", "caretaker", "viewer"]),
  all_properties: z.boolean(),
  property_ids: z.array(z.string().uuid()),
  can_manage_tenancies: z.boolean(),
  can_enter_payments: z.boolean(),
  can_confirm: z.boolean(),
  can_correct: z.boolean(),
  can_export: z.boolean(),
  can_view_attachments: z.boolean(),
  can_manage_listings: z.boolean(),
});

const inviteSchema = accessSchema.extend({
  display_name: z.string().trim().min(2, "Enter the person's full name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter an email address for the invitation, like name@example.co.ke."),
  phone: z.string().trim().max(30).optional(),
});

export type InviteInput = z.input<typeof inviteSchema>;
export type AccessInput = z.input<typeof accessSchema>;

function issues(err: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const i of err.issues) fieldErrors[String(i.path[0])] ??= i.message;
  return fieldErrors;
}

export async function inviteMember(orgId: string, input: InviteInput): Promise<ActionResult<{ link: string; expiresAt: string; emailQueued: boolean }>> {
  await requireUser(`/w/${orgId}/team`);
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: issues(parsed.error) };
  if (!parsed.data.all_properties && parsed.data.property_ids.length === 0 && parsed.data.role !== "agency_admin") {
    return { ok: false, message: "Assign at least one property.", fieldErrors: { property_ids: "Assign at least one property." } };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_member", { p_org: orgId, p: parsed.data });
  if (error) return fail(error);
  const r = data as unknown as { token: string; expires_at: string };
  await kickDelivery();
  revalidatePath(`/w/${orgId}/team`);
  return { ok: true, data: { link: `${SITE_URL}/invite/${r.token}`, expiresAt: r.expires_at, emailQueued: true } };
}

export async function resendInvitation(orgId: string, membershipId: string): Promise<ActionResult<{ link: string }>> {
  await requireUser(`/w/${orgId}/team`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resend_invitation", { p_membership: membershipId });
  if (error) return fail(error);
  await kickDelivery();
  revalidatePath(`/w/${orgId}/team`);
  return { ok: true, data: { link: `${SITE_URL}/invite/${(data as unknown as { token: string }).token}` } };
}

export async function cancelInvitation(orgId: string, membershipId: string): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/team`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_invitation", { p_membership: membershipId });
  if (error) return fail(error);
  revalidatePath(`/w/${orgId}/team`);
  return { ok: true };
}

export async function setMemberStatus(orgId: string, membershipId: string, status: "active" | "suspended" | "removed", reassignTo?: string): Promise<ActionResult<{ moved: number }>> {
  await requireUser(`/w/${orgId}/team`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_member_status", { p_membership: membershipId, p_status: status, p_reassign_to: reassignTo || undefined });
  if (error) return fail(error);
  revalidatePath(`/w/${orgId}/team`);
  return { ok: true, data: { moved: (data as unknown as { moved: number }).moved } };
}

export async function updateMemberAccess(orgId: string, membershipId: string, input: AccessInput): Promise<ActionResult> {
  await requireUser(`/w/${orgId}/team`);
  const parsed = accessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: issues(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member_access", { p_membership: membershipId, p: parsed.data });
  if (error) return fail(error);
  revalidatePath(`/w/${orgId}/team`, "layout");
  return { ok: true };
}
