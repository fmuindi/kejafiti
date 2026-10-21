// Runs the AI-01 gold text cases against a running app and reports correctness and latency.
//   node scripts/ai-eval.mjs                 (app at http://localhost:3200)
//   BASE=https://… node scripts/ai-eval.mjs
// Costs real model calls (about 20). Raise AI_CLIENT_DAILY_SEARCH_CAP locally if you rerun often.

import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3200";
const { cases } = JSON.parse(fs.readFileSync(new URL("../tests/ai/gold-text.json", import.meta.url), "utf8"));

const nairobiToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
const [y, m] = nairobiToday.split("-").map(Number);
const firstOfNextMonth = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
const special = (v) => (v === "@first_of_next_month" ? firstOfNextMonth : v);

function check(c, out) {
  const e = c.expect;
  const fails = [];
  if (e.outcome !== "any" && out.outcome !== e.outcome) fails.push(`outcome ${out.outcome} (wanted ${e.outcome})`);
  const query = out.outcome === "success" ? out.query : out.outcome === "clarification_required" ? out.partialQuery : "";
  const q = new URLSearchParams(query ?? "");
  const want = { ...(e.params ?? {}), ...(out.outcome === "success" ? (e.params_if_success ?? {}) : {}) };
  if (out.outcome === "success" || e.outcome === "success") {
    for (const [k, v] of Object.entries(want)) {
      const got = Array.isArray(v) ? q.getAll(k) : q.get(k);
      if (JSON.stringify(got) !== JSON.stringify(Array.isArray(v) ? v : special(v))) fails.push(`${k}=${JSON.stringify(got)} (wanted ${JSON.stringify(v)})`);
    }
  }
  for (const k of e.absent ?? []) if (q.has(k)) fails.push(`${k} should be absent, got ${q.getAll(k)}`);
  // Places resolve to their official names (e.g. Rongai -> Ongata Rongai); accept known forms.
  if (e.q_any && !e.q_any.includes(q.get("q") ?? "")) fails.push(`q=${q.get("q")} (wanted one of ${e.q_any.join(", ")})`);
  for (const [k, vs] of Object.entries(e.has ?? {})) for (const v of vs) if (!q.getAll(k).includes(v)) fails.push(`${k} missing ${v}`);
  for (const [k, vs] of Object.entries(e.lacks ?? {})) for (const v of vs) if (q.getAll(k).includes(v)) fails.push(`${k} must not include ${v}`);
  if (e.defaults && !(out.defaults ?? []).length) fails.push("expected a visible default note");
  if (e.notes && !(out.notes ?? []).length) fails.push("expected an unsupported-words note");
  if (e.notes_or_question && !(out.notes ?? []).length && out.outcome !== "clarification_required") fails.push("expected a note or a question");
  return { fails, query };
}

const rows = [];
for (const c of cases) {
  const t = Date.now();
  let out;
  try {
    const res = await fetch(`${BASE}/api/ai/search-intent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: c.input, current: c.current ?? "", source: "text" }) });
    out = await res.json();
  } catch (err) {
    out = { outcome: "network_error", message: String(err) };
  }
  const ms = Date.now() - t;
  const { fails, query } = check(c, out);
  rows.push({ id: c.id, ok: fails.length === 0, ms, outcome: out.outcome, fails, query, message: out.message });
  console.log(`${fails.length ? "FAIL" : "pass"} ${c.id} ${String(ms).padStart(5)}ms ${out.outcome}${fails.length ? `  ${fails.join("; ")}` : ""}${out.message && fails.length ? `  (${out.message})` : ""}`);
}
const ok = rows.filter((r) => r.ok).length;
const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
const p = (x) => sorted[Math.min(sorted.length - 1, Math.floor(x * sorted.length))];
console.log(`\n${ok}/${rows.length} passed · latency p50 ${p(0.5)}ms · p95 ${p(0.95)}ms`);
process.exitCode = ok === rows.length ? 0 : 1;
