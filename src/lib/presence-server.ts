import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { isRecentlyActive } from "@/lib/presence";

/** Ids of the conversations whose other side is online now. Empty on any error; lists still render. */
export async function onlineConversations(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data } = await supabase.rpc("conversation_activity", { p_ids: ids });
  const now = Date.now();
  return new Set((data ?? []).filter((r) => isRecentlyActive(r.last_active_at, now)).map((r) => r.conversation_id));
}
