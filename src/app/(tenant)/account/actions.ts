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
