import "server-only";
import { CATEGORIES, FACTS, HOME_TYPES } from "@/lib/listing/catalog";
import { toQuery, type SearchParams } from "@/lib/listing/search";
import { todayEAT } from "@/lib/dates";
import { PLACES_ENABLED, autocomplete, placeDetails } from "@/lib/places";
import { AI, INTENT_PROMPT_VERSION } from "./config";
import { INTENT_SCHEMA, appearsIn, applyPatch, checkBudget, checkMoveIn, describeChanges, type IntentPatch, type ResolvedPlace } from "./intent-rules";
import { completeJson } from "./openai";

// AI-01: a sentence (typed or transcribed) becomes a change to the canonical search state.
// The model never chooses homes; the existing search query does, exactly as for manual filters.

const SYSTEM = `You turn a tenant's request for a rental home in Kenya into a change to their search filters.
Requests may be English, Kiswahili or a mix. Return only the JSON described by the schema.

Rules:
- mode "new" for a fresh request; "refine" when the text adjusts the current search (e.g. "make it 18k", "try Ruiru instead", "parking would be nice", "no, I said Ruaka"). With "refine", use op "keep" for anything the text does not change.
- Never invent anything. If the text does not state something, use op "keep" (refine) or leave it unset (new: op "keep", value null).
- layout values: ${HOME_TYPES.map((t) => `${t.value} (${t.label})`).join(", ")}. "Self-contained" or "bedsitter" -> bedsitter_studio. "One bedroom"/"1br" -> 1_bedroom.
- category values (only when no single layout fits): ${CATEGORIES.map((c) => `${c.value} (${c.label})`).join(", ")}. SQ, DSQ, servant quarter -> sq.
- location.text: the place exactly as the person wrote it (estate, road, town or landmark). Do not add county names, coordinates or places they did not say. Vague places like "tao", "town" or "near the stage" without a named place: leave unset and ask in clarify (field "location").
- budget: amounts in KSh. "15k" = 15000. basis "fixed" when they say the amount includes service charge or other monthly charges; "movein" when it is what they can pay upfront/to move in; "rent" when they say rent only; otherwise "unspecified". "under"/"up to"/"max"/"below" set max; "from"/"at least" set min. evidence: copy the exact words that state the amount.
- Features (keys): ${FACTS.map((f) => `${f.key} (${f.label})`).join(", ")}. Needs, "must", negated shared items ("choo isiwe shared", "no shared bathroom", "choo ndani") -> add_required. Wishes ("would be nice", "ideally", "prefer") -> add_preferred. "Don't need X" or removing X -> remove_features.
- Words that are not checkable facts ("safe", "executive", "family friendly", "quiet", "own entrance", commute times) go in unsupported, verbatim. Never turn them into features.
- move_in_by: a date YYYY-MM-DD only if they give a deadline ("next month" = the first day of next month). evidence: their exact words.
- not_a_search: true when the text is not a request about finding a home (silence, music, unrelated talk).
- clarify: at most one short question, only when a needed value cannot be safely read (an amount that could be 15,000 or 50,000, an ambiguous place). Give up to 3 short options. Otherwise field "none".`;

export type IntentOutcome =
  | { outcome: "success"; query: string; changes: string[]; defaults: string[]; notes: string[]; placeLabel?: string }
  | { outcome: "clarification_required"; question: string; choices: Array<{ label: string; query: string }>; partialQuery: string; notes: string[] }
  | { outcome: "unsupported_input"; message: string };

function summarize(p: SearchParams) {
  return JSON.stringify({
    area: p.q ?? null,
    layout: p.types[0] ?? null,
    category: p.category ?? null,
    budget: p.max || p.min ? { max: p.max ?? null, min: p.min ?? null, basis: p.basis } : null,
    required: p.must,
    preferred: p.prefer,
    furnishing: p.furnishing ?? null,
    move_in_by: p.movein ?? null,
  });
}

async function resolvePlace(text: string): Promise<ResolvedPlace> {
  // Without Places (or no match) the name is still searched as text, as manual search does.
  if (!PLACES_ENABLED) return { name: text };
  try {
    const session = crypto.randomUUID();
    const [top] = await autocomplete(text, session);
    if (!top) return { name: text };
    const d = await placeDetails(top.id, session);
    return { name: top.main, lat: d.latitude ?? undefined, lng: d.longitude ?? undefined };
  } catch {
    return { name: text };
  }
}

export async function interpret(text: string, current: SearchParams): Promise<{ result: IntentOutcome; usage: { input: number; output: number; model: string } }> {
  const today = todayEAT();
  const res = await completeJson<IntentPatch>({
    model: AI.intentModel(),
    system: SYSTEM,
    user: `Today is ${today} (Africa/Nairobi).\nCurrent search: ${summarize(current)}\nRequest: ${text}`,
    schemaName: "search_intent",
    schema: INTENT_SCHEMA,
    timeoutMs: AI.intentTimeoutMs,
  });
  const p = res.value;
  const usage = { input: res.inputTokens, output: res.outputTokens, model: `${res.model}/${INTENT_PROMPT_VERSION}` };

  if (p.not_a_search) return { result: { outcome: "unsupported_input", message: "That didn't sound like a home search. Try something like \"bedsitter in Ruaka under 15k\"." }, usage };
  const notes = p.unsupported.length ? [`We can't search by ${p.unsupported.map((u) => `"${u}"`).join(", ")}. Try specific features instead.`] : [];

  // The place must be words the person used; otherwise it is ignored rather than guessed.
  if (p.location.op === "set" && !appearsIn(p.location.text, text)) p.location = { op: "keep", text: null };
  const place = p.location.op === "set" && p.location.text ? await resolvePlace(p.location.text) : null;

  const budget = checkBudget(p.budget, text);
  const movein = checkMoveIn(p.move_in_by, text, today);
  const modelAsks = p.clarify.field !== "none" && p.clarify.question ? p.clarify : null;

  if (!budget.ok || modelAsks?.field === "amount") {
    // Search the parts that are clear; the amount waits for the person's choice.
    const withoutAmount = applyPatch(current, { ...p, budget: { ...p.budget, op: "keep" }, move_in_by: movein.ok ? p.move_in_by : { ...p.move_in_by, op: "keep" } }, place).next;
    const options = !budget.ok ? budget.options : modelAsks!.options.flatMap((o) => (Number.isFinite(Number(o.replace(/[^\d.]/g, ""))) ? [Number(o.replace(/[^\d.]/g, ""))] : []));
    const basis = p.budget.basis === "unspecified" ? withoutAmount.basis : p.budget.basis;
    return {
      result: {
        outcome: "clarification_required",
        question: !budget.ok ? budget.question : (modelAsks!.question as string),
        choices: options.filter((v) => v >= 500).map((v) => ({ label: `KSh ${v.toLocaleString("en-KE")}`, query: toQuery({ ...withoutAmount, max: v, basis }) })),
        partialQuery: toQuery(withoutAmount),
        notes,
      },
      usage,
    };
  }
  if (modelAsks?.field === "location") {
    const without = applyPatch(current, { ...p, location: { op: "keep", text: null } }, null).next;
    const choices = await Promise.all(
      modelAsks.options.slice(0, 3).map(async (o) => {
        const pl = await resolvePlace(o);
        return { label: pl.name, query: toQuery({ ...without, q: pl.name, lat: pl.lat, lng: pl.lng }) };
      }),
    );
    return { result: { outcome: "clarification_required", question: modelAsks.question as string, choices, partialQuery: toQuery(without), notes }, usage };
  }

  const safe: IntentPatch = { ...p, move_in_by: movein.ok ? p.move_in_by : { ...p.move_in_by, op: "keep" } };
  const { next, defaults } = applyPatch(current, safe, place);
  if (!movein.ok) notes.push("We couldn't read a move-in date, so it isn't applied.");
  return { result: { outcome: "success", query: toQuery(next), changes: describeChanges(current, next), defaults, notes, placeLabel: place?.name }, usage };
}
