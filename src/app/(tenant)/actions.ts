"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function toggleSaved(ref: string, save: boolean): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to save homes across your devices.", code: "not_signed_in" };
  const supabase = await createClient();
  const { data: listing } = await supabase.rpc("get_listing", { p_ref: ref });
  const id = (listing as { id?: string } | null)?.id;
  if (!id) return { ok: false, message: "This home is no longer available." };
  const res = save
    ? await supabase.from("saved_listings").upsert({ user_id: user.id, listing_id: id }, { ignoreDuplicates: true })
    : await supabase.from("saved_listings").delete().eq("user_id", user.id).eq("listing_id", id);
  if (res.error) return fail(res.error);
  revalidatePath("/saved");
  return { ok: true };
}

export async function saveSearch(label: string, query: string, frequency: "instant" | "daily" | "off"): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to get alerts for this search.", code: "not_signed_in" };
  const supabase = await createClient();
  const params = Object.fromEntries(new URLSearchParams(query).entries());
  const { error } = await supabase
    .from("saved_searches")
    .insert({ user_id: user.id, label: label.slice(0, 120), params: { query, ...params }, alert_frequency: frequency });
  if (error) return fail(error);
  revalidatePath("/saved");
  return { ok: true };
}

export async function deleteSavedSearch(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("saved_searches").delete().eq("id", id);
  if (error) return fail(error);
  revalidatePath("/saved");
  return { ok: true };
}

export async function logContact(ref: string, channel: "call" | "whatsapp") {
  const supabase = await createClient();
  await supabase.rpc("log_contact", { p_ref: ref, p_channel: channel });
}

export async function reportListing(
  ref: string,
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const reason = String(form.get("reason") ?? "");
  if (!reason) return { ok: false, message: "Choose what's wrong with this listing.", fieldErrors: { reason: "Choose what's wrong with this listing." } };
  const { error } = await supabase.rpc("report_listing", {
    p_ref: ref,
    p_reason: reason,
    p_details: String(form.get("details") ?? ""),
  });
  if (error) return fail(error);
  return { ok: true };
}
