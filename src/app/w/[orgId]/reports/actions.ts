"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function finalizeReport(orgId: string, propertyId: string, period: string, notes: string, changeNote: string): Promise<ActionResult<{ version: number }>> {
  await requireUser(`/w/${orgId}/reports`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finalize_report", { p_property: propertyId, p_period: period, p_notes: notes, p_change_note: changeNote || undefined });
  if (error) return fail(error);
  revalidatePath(`/w/${orgId}/reports`);
  return { ok: true, data: { version: (data as unknown as { version: number }).version } };
}
