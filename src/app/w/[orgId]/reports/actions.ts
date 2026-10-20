"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type Commentary = { changes: string; issues: string; next_actions: string };

export async function finalizeReport(orgId: string, propertyId: string, period: string, commentary: Commentary, changeNote: string): Promise<ActionResult<{ version: number }>> {
  await requireUser(`/w/${orgId}/reports`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finalize_report", {
    p_property: propertyId,
    p_period: period,
    p_notes: "",
    p_change_note: changeNote || undefined,
    p_commentary: commentary,
  });
  if (error) return fail(error);
  revalidatePath(`/w/${orgId}/reports`);
  return { ok: true, data: { version: (data as unknown as { version: number }).version } };
}
