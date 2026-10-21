import "server-only";
import { completeJsonClaude } from "./anthropic";
import { AI } from "./config";
import { AiProviderError, completeJson, type JsonResult } from "./openai";

// Provider chain for typed and transcribed requests: OpenAI first, then Claude, then the
// caller falls back to ordinary filters. Only configured providers take part.

export type Provider = "openai" | "anthropic";

// A provider that just failed for an account or availability reason is skipped for a while,
// so each search doesn't wait for it to fail again. Per server instance; resets on restart.
const COOL_DOWN_MS = { quota: 10 * 60_000, unavailable: 2 * 60_000, rate_limited: 60_000, timeout: 60_000, bad_response: 0 } as const;
const skipUntil = new Map<Provider, number>();

export function providerOrder(): Provider[] {
  const configured = (p: Provider) => (p === "openai" ? !!process.env.OPENAI_API_KEY : !!process.env.ANTHROPIC_API_KEY);
  const wanted = (process.env.AI_INTENT_PROVIDERS || "openai,anthropic").split(",").map((s) => s.trim()) as Provider[];
  return wanted.filter((p) => (p === "openai" || p === "anthropic") && configured(p));
}

/** Any structured task (search, drafts, help) goes through the same chain and validation. */
export async function completeIntentJson<T>(opts: { system: string; user: string; schemaName: string; schema: object }): Promise<JsonResult<T> & { provider: Provider; skipped: Provider[] }> {
  const order = providerOrder();
  const now = Date.now();
  // If every provider is cooling down, try them anyway rather than refuse outright.
  const ready = order.filter((p) => (skipUntil.get(p) ?? 0) <= now);
  const attempt = ready.length ? ready : order;
  const skipped = order.filter((p) => !attempt.includes(p));
  let last: unknown = new AiProviderError({ kind: "unavailable" });
  for (const provider of attempt) {
    try {
      const result =
        provider === "openai"
          ? await completeJson<T>({ model: AI.intentModel(), system: opts.system, user: opts.user, schemaName: opts.schemaName, schema: opts.schema, timeoutMs: AI.intentTimeoutMs })
          : await completeJsonClaude<T>({ model: AI.claudeIntentModel(), system: opts.system, user: opts.user, schema: opts.schema, timeoutMs: AI.intentTimeoutMs });
      skipUntil.delete(provider);
      return { ...result, provider, skipped };
    } catch (e) {
      last = e;
      const kind = e instanceof AiProviderError ? e.detail.kind : "unavailable";
      if (COOL_DOWN_MS[kind]) skipUntil.set(provider, Date.now() + COOL_DOWN_MS[kind]);
      console.warn("[ai.provider] failed, trying next", JSON.stringify({ provider, kind }));
    }
  }
  throw last;
}
