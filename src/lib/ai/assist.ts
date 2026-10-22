import "server-only";
import { createHash } from "node:crypto";
import { AI, type AiFeature } from "./config";
import { AiProviderError } from "./openai";
import { completeIntentJson } from "./providers";
import { recordUsage, takeQuota } from "./usage";

// One runner for every assistance feature (AIS-09): switch, caps, provider chain (OpenAI,
// then Claude), usage and redacted logs. Callers validate meaning afterwards; nothing here
// writes, sends or finalizes anything.

export type AssistResult<T> = { ok: true; value: T; provider: string } | { ok: false; message: string };

/** Per-person cap key for signed-in features (salted hash of the user id). */
export function userKey(userId: string) {
  const salt = process.env.AI_CLIENT_SALT ?? process.env.CRON_SECRET ?? "nyumbani-local";
  return createHash("sha256").update(`${salt}:user:${userId}`).digest("hex").slice(0, 40);
}

export async function runAssist<T>(feature: Exclude<AiFeature, "search_intent" | "transcribe">, client: string, task: { system: string; user: string; schema: object }): Promise<AssistResult<T>> {
  if (!AI.assistEnabled(feature)) return { ok: false, message: "This isn't available at the moment. Please try again later." };
  const limited = await takeQuota(feature, client);
  if (limited) return { ok: false, message: "This isn't available at the moment. Please try again later." };
  const started = Date.now();
  try {
    const r = await completeIntentJson<T>({ system: task.system, user: task.user, schemaName: feature, schema: task.schema });
    await recordUsage(feature, { input: r.inputTokens, output: r.outputTokens });
    console.info(`[ai.${feature}]`, JSON.stringify({ provider: r.provider, model: r.model, ms: Date.now() - started, in: r.inputTokens, out: r.outputTokens }));
    return { ok: true, value: r.value, provider: r.provider };
  } catch (e) {
    await recordUsage(feature, { failed: true });
    console.warn(`[ai.${feature}] failed`, JSON.stringify({ kind: e instanceof AiProviderError ? e.detail.kind : "unavailable", ms: Date.now() - started }));
    return { ok: false, message: "This isn't available at the moment. Please try again later." };
  }
}
