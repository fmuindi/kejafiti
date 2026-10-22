import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI } from "./config";

// Usage caps and accounting (AIS-07). Visitors are identified only by a salted hash, kept per
// day; no raw id or address is stored.

export type Feature = "search_intent" | "transcribe" | "listing_draft" | "report_commentary" | "help_answer";

const VISITOR_COOKIE = "nyu_vid";
const hash = (v: string) => createHash("sha256").update(`${process.env.AI_CLIENT_SALT ?? process.env.CRON_SECRET ?? "nyumbani-local"}:${v}`).digest("hex").slice(0, 40);

/**
 * Who a cap applies to: the signed-in person, else this browser (a random first-party cookie),
 * else the network address. Many phones in Kenya share one address behind the carrier, so the
 * address is only the last resort. Call from a Route Handler or Server Function (it may set the
 * cookie).
 */
export async function visitorKey(): Promise<string> {
  const user = await getSessionUser();
  if (user) return hash(`user:${user.id}`);
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return hash(`browser:${existing}`);
  jar.set(VISITOR_COOKIE, randomUUID(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return hash(`ip:${ip}`);
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
