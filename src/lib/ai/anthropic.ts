import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AiProviderError, type JsonResult } from "./openai";

// Claude adapter: the backup intent parser when OpenAI is unavailable or out of credit.
// Claude has no speech-to-text API, so voice transcription stays with OpenAI.

let client: Anthropic | null = null;
function getClient() {
  // No SDK retries: if Claude is busy, the request falls through to ordinary filters quickly.
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  return client;
}

function toProviderError(e: unknown): AiProviderError {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new AiProviderError({ kind: "timeout" });
  if (e instanceof Anthropic.RateLimitError) return new AiProviderError({ kind: "rate_limited", status: 429 });
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiProviderError({ kind: "unavailable", status: e.status });
  // A 400 here is account-level (e.g. no credit balance) or a request the model won't take.
  if (e instanceof Anthropic.BadRequestError) return new AiProviderError({ kind: "quota", status: 400 });
  if (e instanceof Anthropic.APIError) return new AiProviderError({ kind: "unavailable", status: e.status ?? undefined });
  return new AiProviderError({ kind: "unavailable" });
}

/** One structured-output request; the schema constrains shape, callers still validate meaning. */
export async function completeJsonClaude<T>(opts: { model: string; system: string; user: string; schema: object; timeoutMs: number }): Promise<JsonResult<T>> {
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await getClient().beta.messages.create(
      {
        model: opts.model,
        max_tokens: 4000,
        // A safety decline is re-run server-side on Anthropic's recommended model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // Short extraction task: low effort keeps it fast.
        output_config: { effort: "low", format: { type: "json_schema", schema: opts.schema as Record<string, unknown> } },
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      },
      { timeout: opts.timeoutMs },
    );
  } catch (e) {
    throw toProviderError(e);
  }
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") throw new AiProviderError({ kind: "bad_response" });
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
  if (!text) throw new AiProviderError({ kind: "bad_response" });
  try {
    return { value: JSON.parse(text) as T, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, model: response.model };
  } catch {
    throw new AiProviderError({ kind: "bad_response" });
  }
}
