import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI } from "./config";

// Usage caps and accounting (AIS-07). Visitors are identified only by a salted hash of their
// address, kept per day; the raw address is never stored.

export type Feature = "search_intent" | "transcribe" | "listing_draft" | "report_commentary" | "help_answer";

export function clientKey(headers: Headers): string {
  const ip = (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
  const salt = process.env.AI_CLIENT_SALT ?? process.env.CRON_SECRET ?? "nyumbani-local";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 40);
}

/** Reserve one request under today's caps. Returns null when allowed, or why it isn't. */
export async function takeQuota(feature: Feature, client: string): Promise<null | "client_limit" | "global_limit" | "unavailable"> {
  try {
    const { data, error } = await createAdminClient().rpc("ai_take", { p_feature: feature, p_client: client, p_client_cap: AI.clientCap(feature), p_global_cap: AI.dailyCap(feature) });
    if (error) return "unavailable";
    return data === "ok" ? null : (data as "client_limit" | "global_limit");
  } catch {
    return "unavailable";
  }
}

export async function recordUsage(feature: Feature, u: { input?: number; output?: number; audioSeconds?: number; failed?: boolean }) {
  try {
    await createAdminClient().rpc("ai_record", { p_feature: feature, p_input: u.input ?? 0, p_output: u.output ?? 0, p_audio: u.audioSeconds ?? 0, p_failed: !!u.failed });
  } catch {
    // Accounting must never break a search.
  }
}
