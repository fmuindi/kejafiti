import { NextResponse, type NextRequest } from "next/server";
import { AI } from "@/lib/ai/config";
import { interpret } from "@/lib/ai/intent";
import { AiProviderError } from "@/lib/ai/openai";
import { recordUsage, takeQuota, visitorKey } from "@/lib/ai/usage";
import { parseSearch } from "@/lib/listing/search";

// POST /api/ai/search-intent (AI-01). Input: the person's words and their current search.
// Output: a typed outcome; on success, the canonical search query the results page runs
// through the same search as manual filters. Public: no account needed, but capped.

type Body = { text?: unknown; source?: unknown; current?: unknown; request_id?: unknown };

const reply = (requestId: string, payload: Record<string, unknown>, status = 200) =>
  NextResponse.json({ request_id: requestId, ...payload }, { status, headers: { "Cache-Control": "no-store" } });

const UNAVAILABLE = "Voice search isn't available at the moment. Please use the filters.";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const requestId = typeof body.request_id === "string" && /^[\w-]{8,64}$/.test(body.request_id) ? body.request_id : crypto.randomUUID();
  if (!AI.searchEnabled()) return reply(requestId, { outcome: "unavailable", message: UNAVAILABLE });

  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  if (text.length < 2 || text.length > 500) return reply(requestId, { outcome: "unsupported_input", message: "Describe the home in a sentence, up to 500 characters." }, 400);
  // The current search is validated through the same parser as any search URL.
  const current = parseSearch(Object.fromEntries([...new URLSearchParams(typeof body.current === "string" ? body.current : "").keys()].map((k) => [k, new URLSearchParams(body.current as string).getAll(k)])));

  const limited = await takeQuota("search_intent", await visitorKey());
  // Caps are a cost guard, not something to explain to the person: same calm message either way.
  if (limited) return reply(requestId, { outcome: limited === "client_limit" ? "rate_limited" : "unavailable", message: UNAVAILABLE }, limited === "client_limit" ? 429 : 503);

  const started = Date.now();
  try {
    const { result, usage } = await interpret(text, current);
    await recordUsage("search_intent", { input: usage.input, output: usage.output });
    console.info("[ai.search_intent]", JSON.stringify({ request_id: requestId, source: body.source === "voice" ? "voice" : "text", model: usage.model, ms: Date.now() - started, outcome: result.outcome, in: usage.input, out: usage.output }));
    return reply(requestId, result);
  } catch (e) {
    await recordUsage("search_intent", { failed: true });
    const kind = e instanceof AiProviderError ? e.detail.kind : "unavailable";
    console.warn("[ai.search_intent] failed", JSON.stringify({ request_id: requestId, kind, ms: Date.now() - started }));
    if (kind === "timeout") return reply(requestId, { outcome: "provider_timeout", message: "That took a little too long. Please try again, or use the filters." }, 504);
    return reply(requestId, { outcome: "unavailable", message: UNAVAILABLE }, 503);
  }
}
