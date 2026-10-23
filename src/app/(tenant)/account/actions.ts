"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function updateProfileName(name: string): Promise<ActionResult> {
  const user = await requireUser("/account");
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 120) return { ok: false, message: "Enter your name." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: trimmed }).eq("id", user.id);
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

const EMAIL_CATEGORIES = new Set(["rent", "enquiries", "team", "listings", "reports", "support", "alerts", "other"]);

/** Saves which update categories should NOT be emailed (the rest are). */
export async function updateEmailSettings(off: string[]): Promise<ActionResult> {
  const user = await requireUser("/account");
  const emailOff = [...new Set(off)].filter((c) => EMAIL_CATEGORIES.has(c));
  const supabase = await createClient();
  const { error } = await supabase.from("notification_settings").upsert({ user_id: user.id, email_off: emailOff });
  if (error) return fail(error);
  return { ok: true };
}
