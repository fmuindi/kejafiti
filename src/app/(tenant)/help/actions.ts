"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser, requirePlatformAdmin } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { safeInternalLink } from "@/lib/updates";
import { createClient } from "@/lib/supabase/server";

const ticketSchema = z.object({
  category: z.enum(["account", "listing", "rent_records", "team", "viewing_or_message", "other"]),
  subject: z.string().trim().min(3, "Add a short subject.").max(140),
  description: z.string().trim().min(10, "Describe what happened in a sentence or two.").max(4000),
  context_link: z.string().optional(),
  client_ref: z.string().uuid(),
});

export async function createTicket(input: z.input<typeof ticketSchema>): Promise<ActionResult<{ id: string; ref: string }>> {
  if (!(await getSessionUser())) return { ok: false, message: "Sign in to contact support.", code: "not_signed_in" };
  const parsed = ticketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_support_ticket", { p: { ...parsed.data, context_link: safeInternalLink(parsed.data.context_link ?? null) } });
  if (error) return fail(error);
  revalidatePath("/help");
  return { ok: true, data: data as unknown as { id: string; ref: string } };
}

export async function registerTicketFile(ticketId: string, file: { path: string; name: string; mime: string; size: number }): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_support_file", { p_ticket: ticketId, p_path: file.path, p_name: file.name, p_mime: file.mime, p_size: file.size });
  if (error) return fail(error);
  revalidatePath(`/help/tickets/${ticketId}`);
  return { ok: true };
}

export async function replyTicket(ticketId: string, body: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_support_ticket", { p_ticket: ticketId, p_body: body });
  if (error) return fail(error);
  revalidatePath(`/help/tickets/${ticketId}`);
  revalidatePath(`/admin/support/${ticketId}`);
  return { ok: true };
}

export async function adminUpdateTicket(ticketId: string, change: { status?: string; priority?: string; assign_to_me?: boolean }): Promise<ActionResult> {
  await requirePlatformAdmin("/admin/support");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_ticket", { p_ticket: ticketId, p: change });
  if (error) return fail(error);
  revalidatePath("/admin", "layout");
  return { ok: true };
}
