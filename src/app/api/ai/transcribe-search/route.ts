import { NextResponse, type NextRequest } from "next/server";
import { AI } from "@/lib/ai/config";
import { AiProviderError, transcribe } from "@/lib/ai/openai";
import { recordUsage, takeQuota, visitorKey } from "@/lib/ai/usage";

// POST /api/ai/transcribe-search (AI-02). One short clip in, its transcript out. The clip is
// checked (real audio, size, length), sent once to the speech provider and never stored by
// nyumbani. The transcript then goes through the same parser as typed text.

// Hints for place names and housing words (blueprint p.9). They help spelling; they never
// force a place.
const VOCABULARY = "Kenyan rental home search. Places: Ruaka, Ruiru, Kilimani, Kileleshwa, Lavington, Westlands, Kasarani, Juja, Syokimau, Rongai, Embakasi, Ngong Road, Thika Road, Kitengela, Utawala. Words: bedsitter, self-contained, SQ, DSQ, one bedroom, choo, service charge, deposit, elfu, natafuta, own meter.";

const reply = (requestId: string, payload: Record<string, unknown>, status = 200) =>
  NextResponse.json({ request_id: requestId, ...payload }, { status, headers: { "Cache-Control": "no-store" } });

/** Identify the container from its first bytes instead of trusting the browser's label. */
function sniff(b: Uint8Array): { ext: string; type: string } | null {
  const ascii = (o: number, s: string) => [...s].every((c, i) => b[o + i] === c.charCodeAt(0));
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: "webm", type: "audio/webm" };
  if (ascii(0, "OggS")) return { ext: "ogg", type: "audio/ogg" };
  if (ascii(4, "ftyp")) return { ext: "mp4", type: "audio/mp4" };
  if (ascii(0, "RIFF") && ascii(8, "WAVE")) return { ext: "wav", type: "audio/wav" };
  if (ascii(0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: "mp3", type: "audio/mpeg" };
  return null;
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const rid = form?.get("request_id");
  const requestId = typeof rid === "string" && /^[\w-]{8,64}$/.test(rid) ? rid : crypto.randomUUID();
  if (!AI.voiceEnabled()) return reply(requestId, { outcome: "unavailable", message: "Voice search isn't available at the moment. Please use the filters." });

  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size < 1024) return reply(requestId, { outcome: "invalid_audio", message: "We didn't get any sound. Please try again." }, 400);
  if (audio.size > AI.maxClipBytes) return reply(requestId, { outcome: "invalid_audio", message: "That recording is too long. Keep it under 30 seconds." }, 413);
  const durationMs = Number(form?.get("duration_ms"));
  if (Number.isFinite(durationMs) && durationMs > (AI.maxClipSeconds + 2) * 1000) return reply(requestId, { outcome: "invalid_audio", message: "That recording is too long. Keep it under 30 seconds." }, 413);
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const kind = sniff(bytes.subarray(0, 16));
  if (!kind) return reply(requestId, { outcome: "invalid_audio", message: "This recording format isn't supported. Please use the filters." }, 415);
  const lang = form?.get("language");
  const language = lang === "en" || lang === "sw" ? lang : undefined;

  const limited = await takeQuota("transcribe", await visitorKey());
  if (limited) return reply(requestId, { outcome: limited === "client_limit" ? "rate_limited" : "unavailable", message: "Voice search isn't available at the moment. Please use the filters." }, limited === "client_limit" ? 429 : 503);

  const started = Date.now();
  const seconds = Number.isFinite(durationMs) ? Math.min(durationMs / 1000, AI.maxClipSeconds) : 0;
  try {
    const { text, language: detected } = await transcribe({ model: AI.transcribeModel(), audio: new Blob([bytes], { type: kind.type }), fileName: `clip.${kind.ext}`, prompt: VOCABULARY, language, timeoutMs: AI.transcribeTimeoutMs });
    await recordUsage("transcribe", { audioSeconds: seconds });
    const transcript = text.trim();
    console.info("[ai.transcribe]", JSON.stringify({ request_id: requestId, model: AI.transcribeModel(), ms: Date.now() - started, seconds, chars: transcript.length, format: kind.ext }));
    if (transcript.replace(/[^\p{L}\p{N}]/gu, "").length < 3) return reply(requestId, { outcome: "invalid_audio", message: "We couldn't hear a request. Try again closer to the phone, or use the filters." });
    return reply(requestId, { outcome: "success", transcript, language: detected ?? null, duration_seconds: seconds });
  } catch (e) {
    await recordUsage("transcribe", { failed: true });
    const k = e instanceof AiProviderError ? e.detail.kind : "unavailable";
    console.warn("[ai.transcribe] failed", JSON.stringify({ request_id: requestId, kind: k, ms: Date.now() - started }));
    if (k === "timeout") return reply(requestId, { outcome: "provider_timeout", message: "That took a little too long. Please try again." }, 504);
    return reply(requestId, { outcome: "unavailable", message: "Voice search isn't available at the moment. Please use the filters." }, 503);
  }
}
