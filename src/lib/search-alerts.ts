import "server-only";
import { parseSearch, toRpcParams } from "@/lib/listing/search";
import { createAdminClient } from "@/lib/supabase/admin";

// Saved-search alerts. The database hands over searches that are due (instant: every couple of
// minutes; daily: once after 07:00 Nairobi time); each one is re-run with the same parser and
// search function the search page uses, and homes published since its last alert are recorded.
// The database then writes the in-app update and, if the person wants it, the email.

type Due = { id: string; user_id: string; query: string; since: string; checked_at: string };
export type AlertHome = { ref: string; title: string | null; area: string; rent_amount: number; price_period: string };
type Row = AlertHome & { published_at: string | null };

/** Homes published after `since` and up to `through`, newest first. */
export function newMatches(rows: Row[], since: string, through: string): AlertHome[] {
  const from = Date.parse(since);
  const to = Date.parse(through);
  return rows
    .filter((r) => r.published_at && Date.parse(r.published_at) > from && Date.parse(r.published_at) <= to)
    .sort((a, b) => Date.parse(b.published_at!) - Date.parse(a.published_at!))
    .map(({ ref, title, area, rent_amount, price_period }) => ({ ref, title, area, rent_amount, price_period }));
}

export function alertSearchParams(query: string) {
  const u = new URLSearchParams(query);
  const raw: Record<string, string[]> = {};
  for (const k of new Set(u.keys())) raw[k] = u.getAll(k);
  // Newest first and one full page: a search rarely gains 60 homes between checks.
  return toRpcParams({ ...parseSearch(raw), sort: "newest" }, { limit: 60, offset: 0 });
}

export async function processSearchAlerts(limit = 100): Promise<{ checked: number; alerted: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_saved_search_checks", { p_limit: limit });
  if (error) throw new Error(error.message);
  let alerted = 0;
  for (const s of (data ?? []) as Due[]) {
    const { data: rows, error: searchError } = await admin.rpc("search_listings", { params: alertSearchParams(s.query) });
    // Leave last_alerted_at alone on failure: the next check covers the same window.
    if (searchError) continue;
    const homes = newMatches((rows ?? []) as Row[], s.since, s.checked_at);
    const { error: recordError } = await admin.rpc("record_saved_search_alert", { p_search: s.id, p_through: s.checked_at, p_homes: homes });
    if (!recordError && homes.length) alerted++;
  }
  return { checked: data?.length ?? 0, alerted };
}
