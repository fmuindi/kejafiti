"use server";

import { requireUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function acceptTenantAccess(token: string): Promise<ActionResult<{ tenantId: string }>> {
  await requireUser(`/tenant-invite/${token}`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_tenant_access", { p_token: token });
  if (error) return fail(error);
  return { ok: true, data: { tenantId: data as unknown as string } };
}
