"use server";

import { requireUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { kickDelivery } from "@/lib/delivery";
import { createClient } from "@/lib/supabase/server";

export async function createWorkspace(name: string, kind: "landlord" | "agency", advertiserRole: string, phone: string): Promise<ActionResult<{ orgId: string }>> {
  await requireUser("/start");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: name,
    p_kind: kind,
    p_advertiser_role: advertiserRole,
    p_phone: phone,
  });
  if (error) return fail(error);
  await kickDelivery();
  return { ok: true, data: { orgId: data as unknown as string } };
}
