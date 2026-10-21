import "server-only";

// Thin OpenAI adapter (no SDK, like the other provider calls in this app). The rest of the
// app depends only on these two functions, so a provider change touches this file.

const API = "https://api.openai.com/v1";

export type ProviderError = { kind: "timeout" | "quota" | "rate_limited" | "unavailable" | "bad_response"; status?: number };

export class AiProviderError extends Error {
  constructor(public detail: ProviderError) {
    super(`AI provider error: ${detail.kind}${detail.status ? ` (${detail.status})` : ""}`);
  }
}

function classify(status: number, code?: string): ProviderError {
  if (code === "insufficient_quota" || code === "credit_balance_exhausted") return { kind: "quota", status };
  if (status === 429) return { kind: "rate_limited", status };
  return { kind: "unavailable", status };
}

async function call(path: string, init: RequestInit, timeoutMs: number) {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (e) {
    throw new AiProviderError({ kind: (e as Error).name === "TimeoutError" ? "timeout" : "unavailable" });
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const err = (body?.error ?? {}) as { code?: string; type?: string };
    throw new AiProviderError(classify(res.status, err.code ?? err.type));
  }
  return body ?? {};
}

export type JsonResult<T> = { value: T; inputTokens: number; outputTokens: number; model: string };

/** One structured-output completion. The schema constrains the shape; callers still validate meaning. */
export async function completeJson<T>(opts: { model: string; system: string; user: string; schemaName: string; schema: object; timeoutMs: number }): Promise<JsonResult<T>> {
  const reasoning = /^(gpt-5|o\d)/.test(opts.model);
  const body = await call(
    "/chat/completions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: { type: "json_schema", json_schema: { name: opts.schemaName, strict: true, schema: opts.schema } },
        // Reasoning models: least reasoning, for latency. Others: deterministic sampling.
        ...(reasoning ? { reasoning_effort: "none" } : { temperature: 0 }),
        max_completion_tokens: 900,
      }),
    },
    opts.timeoutMs,
  );
  const choice = (body.choices as Array<{ message?: { content?: string; refusal?: string } }> | undefined)?.[0];
  const usage = (body.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
  if (!choice?.message?.content) throw new AiProviderError({ kind: "bad_response" });
  try {
    return { value: JSON.parse(choice.message.content) as T, inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0, model: String(body.model ?? opts.model) };
  } catch {
    throw new AiProviderError({ kind: "bad_response" });
  }
}

/** Speech to text for one short clip. The clip is sent once and not stored by nyumbani. */
export async function transcribe(opts: { model: string; audio: Blob; fileName: string; prompt: string; language?: string; timeoutMs: number }): Promise<{ text: string; language?: string }> {
  const form = new FormData();
  form.append("file", opts.audio, opts.fileName);
  form.append("model", opts.model);
  form.append("response_format", "json");
  form.append("prompt", opts.prompt);
  if (opts.language) form.append("language", opts.language);
  const body = await call("/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form }, opts.timeoutMs);
  return { text: typeof body.text === "string" ? body.text : "", language: typeof body.language === "string" ? body.language : undefined };
}
