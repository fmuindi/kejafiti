// Grounding checks for drafted text (AIS-09). A draft may only state numbers that appear in
// the facts it was given; sentences that introduce a new figure are removed and reported, so
// prose can never become a second (wrong) source of rent, totals or dates.

/** Every number a text states, normalised: "15,000" -> 15000, "15k" -> 15000, "88.9%" -> 88.9. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(/(\d+(?:\.\d+)?)\s*(k\b)?/g)) {
    out.push(Number(m[1]) * (m[2] ? 1000 : 1));
  }
  return out;
}

/** Numbers that may appear in a draft: everything in the supplied facts, plus small counts. */
export function allowedNumbers(facts: unknown): Set<number> {
  const set = new Set<number>();
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) {
      set.add(v);
      set.add(Math.round(v * 10) / 10);
    } else if (typeof v === "string") numbersIn(v).forEach((n) => set.add(n));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(facts);
  // Ordinals and small counts ("one bedroom", "2 units") are not new facts on their own.
  for (let i = 0; i <= 12; i++) set.add(i);
  return set;
}

// A full stop between digits ("88.9%") is a decimal point, not the end of a sentence.
const SENTENCE = /(?:[^.!?\n]|\.(?=\d))+[.!?]?(?:\s+|$)|\n+/g;

/** Keep only sentences whose numbers are all supported. Returns what was removed. */
export function keepGrounded(text: string, allowed: Set<number>): { text: string; removed: string[] } {
  const removed: string[] = [];
  const kept = (text.match(SENTENCE) ?? []).filter((s) => {
    const bad = numbersIn(s).some((n) => !allowed.has(n) && !allowed.has(Math.round(n * 10) / 10));
    if (bad) removed.push(s.trim());
    return !bad;
  });
  return { text: kept.join("").replace(/\n{3,}/g, "\n\n").trim(), removed };
}
