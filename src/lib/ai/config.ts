import "server-only";

// AI search configuration (AIS-07). Everything is switchable without a code change, and
// ordinary search keeps working whenever AI is off, over its cap or failing.

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const flag = (v: string | undefined, d: boolean) => (v === undefined || v === "" ? d : v === "true" || v === "1");

// Typed search needs any text provider; voice needs OpenAI (Claude has no speech-to-text).
const hasTextProvider = () => !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY;
const hasSpeechProvider = () => !!process.env.OPENAI_API_KEY;

export type AiFeature = "search_intent" | "transcribe" | "listing_draft" | "report_commentary" | "help_answer";

export const AI = {
  /** Natural-language search (AI-01). On by default when a key is configured. */
  searchEnabled: () => hasTextProvider() && flag(process.env.AI_SEARCH_ENABLED, true),
  /** Voice-to-search (AI-02). */
  voiceEnabled: () => hasSpeechProvider() && flag(process.env.AI_VOICE_ENABLED, true),
  intentModel: () => process.env.OPENAI_INTENT_MODEL || "gpt-5.4-mini",
  /** Backup parser when OpenAI is unavailable or out of credit. */
  claudeIntentModel: () => process.env.ANTHROPIC_INTENT_MODEL || "claude-opus-5-5",
  transcribeModel: () => process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
  /** Daily caps: all visitors together, and per visitor (salted hash of the address). */
  dailyCap: (feature: AiFeature) =>
    ({ search_intent: num(process.env.AI_DAILY_SEARCH_CAP, 2000), transcribe: num(process.env.AI_DAILY_VOICE_CAP, 300), listing_draft: num(process.env.AI_DAILY_ASSIST_CAP, 500), report_commentary: num(process.env.AI_DAILY_ASSIST_CAP, 500), help_answer: num(process.env.AI_DAILY_HELP_CAP, 1000) })[feature],
  clientCap: (feature: AiFeature) =>
    ({ search_intent: num(process.env.AI_CLIENT_DAILY_SEARCH_CAP, 60), transcribe: num(process.env.AI_CLIENT_DAILY_VOICE_CAP, 20), listing_draft: 20, report_commentary: 20, help_answer: 30 })[feature],
  /** Assistance features (milestone D), each switchable on its own. */
  assistEnabled: (feature: "listing_draft" | "report_commentary" | "help_answer") =>
    hasTextProvider() && flag(process.env.AI_ASSIST_ENABLED, true) && flag(process.env[`AI_${feature.toUpperCase()}_ENABLED`], true),
  /** Proposed starting limits from the blueprint (page 12); adjust to the provider and devices. */
  maxClipSeconds: 30,
  maxClipBytes: 8 * 1024 * 1024,
  intentTimeoutMs: num(process.env.AI_INTENT_TIMEOUT_MS, 10000),
  transcribeTimeoutMs: num(process.env.AI_TRANSCRIBE_TIMEOUT_MS, 20000),
};

/** Bumped whenever the prompt or output schema changes, so results can be compared. */
export const INTENT_PROMPT_VERSION = "intent-v1";
