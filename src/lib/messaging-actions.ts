"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { eatLocalToIso } from "@/lib/dates";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

// Messages carry a client reference so a retry after a lost connection never posts twice.

async function signedIn(): Promise<ActionResult | null> {
  return (await getSessionUser()) ? null : { ok: false, message: "Your session has expired. Sign in again; your message is kept.", code: "not_signed_in" };
}

export async function startConversation(ref: string, body: string, clientRef: string): Promise<ActionResult<{ conversationId: string }>> {
  const no = await signedIn();
  if (no) return no as ActionResult<{ conversationId: string }>;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_conversation", { p_ref: ref, p_body: body, p_client_ref: clientRef });
  if (error) return fail(error);
  revalidatePath("/messages");
  return { ok: true, data: { conversationId: data as unknown as string } };
}

export async function sendMessage(conversationId: string, body: string, clientRef: string): Promise<ActionResult<{ id: string }>> {
  const no = await signedIn();
  if (no) return no as ActionResult<{ id: string }>;
  if (!body.trim()) return { ok: false, message: "Write a message." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_message", { p_conversation: conversationId, p_body: body, p_client_ref: clientRef });
  if (error) return fail(error);
  revalidatePath("/messages", "layout");
  revalidatePath("/w", "layout");
  return { ok: true, data: { id: data as unknown as string } };
}

export async function markRead(conversationId: string) {
  const supabase = await createClient();
  await supabase.rpc("mark_conversation_read", { p_conversation: conversationId });
}

export async function requestViewing(ref: string, localTime: string, note: string, clientRef: string): Promise<ActionResult<{ id: string }>> {
  const no = await signedIn();
  if (no) return no as ActionResult<{ id: string }>;
  const iso = eatLocalToIso(localTime);
  if (!iso) return { ok: false, message: "Choose a day and time.", fieldErrors: { time: "Choose a day and time." } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_viewing", { p_ref: ref, p_start: iso, p_note: note, p_client_ref: clientRef });
  if (error) return fail(error);
  revalidatePath("/viewings");
  return { ok: true, data: { id: data as unknown as string } };
}

export async function respondViewing(viewingId: string, action: "accept" | "propose" | "decline" | "cancel" | "attended" | "not_attended" | "unknown", opts: { localTime?: string; reason?: string; instructions?: string; ignoreConflict?: boolean } = {}): Promise<ActionResult<{ conflict?: string }>> {
  const supabase = await createClient();
  const time = opts.localTime ? eatLocalToIso(opts.localTime) : null;
  if (action === "propose" && !time) return { ok: false, message: "Choose the new day and time." };
  const { data, error } = await supabase.rpc("respond_viewing", {
    p_viewing: viewingId,
    p_action: action,
    p_time: time ?? undefined,
    p_reason: opts.reason,
    p_instructions: opts.instructions,
    p_ignore_conflict: opts.ignoreConflict ?? false,
  });
  if (error) return fail(error);
  const r = data as unknown as { ok: boolean; conflict?: boolean; message?: string };
  revalidatePath("/w", "layout");
  if (!r.ok && r.conflict) return { ok: true, data: { conflict: r.message } };
  return { ok: true, data: {} };
}

export async function tenantViewingAction(viewingId: string, action: "accept_proposed" | "change" | "cancel", opts: { localTime?: string; reason?: string } = {}): Promise<ActionResult> {
  const supabase = await createClient();
  const time = opts.localTime ? eatLocalToIso(opts.localTime) : null;
  if (action === "change" && !time) return { ok: false, message: "Choose the new day and time." };
  const { error } = await supabase.rpc("tenant_viewing_action", { p_viewing: viewingId, p_action: action, p_time: time ?? undefined, p_reason: opts.reason });
  if (error) return fail(error);
  revalidatePath("/viewings");
  return { ok: true };
}

export async function setFollowUp(conversationId: string, stage: "new" | "contacted" | "viewing_planned" | "closed" | null, assignMembership?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_conversation_follow_up", {
    p_conversation: conversationId,
    p_stage: stage ?? undefined,
    p_assign_membership: assignMembership ?? undefined,
    p_unassign: assignMembership === null,
  });
  if (error) return fail(error);
  revalidatePath("/w", "layout");
  return { ok: true };
}

export async function markNotificationsRead(ids: string[]) {
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids).is("read_at", null);
  revalidatePath("/", "layout");
}
