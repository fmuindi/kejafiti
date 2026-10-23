import "server-only";
import { cache } from "react";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * What the tenant's navigation shows at a glance: unread messages, viewings waiting on them
 * (a new time to accept, or a time that passed), confirmed viewings coming up, saved homes, and
 * tenancies their landlord has shared with them (My rent).
 * Cached per request, so the layout and the page share one lookup.
 */
export type TenantCounts = { unread: number; viewingsNeedYou: number; viewingsUpcoming: number; saved: number; tenancies: number };

const NONE: TenantCounts = { unread: 0, viewingsNeedYou: 0, viewingsUpcoming: 0, saved: 0, tenancies: 0 };

export const getTenantCounts = cache(async (): Promise<TenantCounts> => {
  const user = await getSessionUser();
  if (!user) return NONE;
  const supabase = await createClient();
  const [{ data: convs }, { data: views }, { count: saved }, { data: tenancies }] = await Promise.all([
    supabase.rpc("my_conversations", {}),
    supabase.rpc("my_viewings"),
    supabase.from("saved_listings").select("listing_id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.rpc("my_tenancies"),
  ]);
  return {
    unread: (convs ?? []).reduce((n, c) => n + (c.unread ?? 0), 0),
    viewingsNeedYou: (views ?? []).filter((v) => v.state === "new_time_proposed" || v.state === "expired").length,
    viewingsUpcoming: (views ?? []).filter((v) => v.state === "confirmed").length,
    saved: saved ?? 0,
    tenancies: (tenancies ?? []).length,
  };
});
