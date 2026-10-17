"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { kickDelivery } from "@/lib/delivery";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function reviewListing(listingId: string, decision: "publish" | "needs_correction", note: string): Promise<ActionResult> {
  await requirePlatformAdmin("/admin");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_listing", { p_listing: listingId, p_decision: decision, p_note: note });
  if (error) return fail(error);
  revalidatePath("/admin", "layout");
  revalidatePath("/search");
  return { ok: true };
}

export async function updateOnboarding(orgId: string, input: { status?: string; note?: string; assignToMe?: boolean; identityChecked?: string; authorityChecked?: string }): Promise<ActionResult> {
  await requirePlatformAdmin("/admin/onboarding");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_onboarding", {
    p_org: orgId,
    p_status: input.status,
    p_note: input.note,
    p_assign_to_me: input.assignToMe ?? false,
    p_identity_checked: input.identityChecked,
    p_authority_checked: input.authorityChecked,
  });
  if (error) return fail(error);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function resolveReport(reportId: string, status: "reviewing" | "resolved" | "dismissed", note: string): Promise<ActionResult> {
  await requirePlatformAdmin("/admin/reports");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_resolve_report", { p_report: reportId, p_status: status, p_note: note });
  if (error) return fail(error);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function retryDelivery(taskId: string): Promise<ActionResult> {
  await requirePlatformAdmin("/admin/deliveries");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_retry_delivery", { p_task: taskId });
  if (error) return fail(error);
  await kickDelivery();
  revalidatePath("/admin", "layout");
  return { ok: true };
}
