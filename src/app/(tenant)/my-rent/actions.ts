"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

// The tenant's own side of their tenancy. Each call goes through a SECURITY DEFINER function
// that checks the tenancy belongs to the signed-in person.

const uuid = z.string().uuid();

const reportSchema = z.object({
  client_request_id: uuid,
  tenancy_id: uuid,
  amount: z.number().positive().multipleOf(0.01).max(99_999_999),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(["mpesa", "bank", "cash", "other"]).optional(),
  reference: z.string().max(80).optional(),
  note: z.string().max(1000).optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

/** "I paid, but it isn't on my statement." A request to check; it never changes the balance. */
export async function reportMissingPayment(input: ReportInput): Promise<ActionResult<{ id: string }>> {
  await requireUser(`/my-rent/${input.tenancy_id}`);
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "form");
      fieldErrors[k] ??= k === "amount" ? "Enter the amount you paid in KSh." : k === "paid_on" ? "Enter the date you paid." : k === "reference" ? "Keep the reference to 80 characters." : "Check this field.";
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_missing_payment", {
    p: { ...p, reference: p.reference?.trim() || null, note: p.note?.trim() || null },
  });
  if (error) return fail(error);
  revalidatePath(`/my-rent/${p.tenancy_id}`);
  return { ok: true, data: { id: data as unknown as string } };
}

export async function withdrawPaymentReport(tenancyId: string, reportId: string): Promise<ActionResult> {
  await requireUser(`/my-rent/${tenancyId}`);
  if (!uuid.safeParse(reportId).success) return { ok: false, message: "This report wasn't found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_payment_report", { p_id: reportId });
  if (error) return fail(error);
  revalidatePath(`/my-rent/${tenancyId}`);
  return { ok: true };
}
