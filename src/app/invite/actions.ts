"use server";

import { requireUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function acceptInvitation(token: string): Promise<ActionResult<{ orgId: string }>> {
  await requireUser(`/invite/${token}`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return fail(error);
  return { ok: true, data: { orgId: data as unknown as string } };
}
