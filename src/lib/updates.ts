import "server-only";
import { cache } from "react";
import { getSessionUser, getWorkspaces } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// In-app updates (IMP-08). Each notification row is one event for one recipient; delivery
// jobs (email etc.) are separate. Read state is per recipient and changes only when the
// person opens an update or chooses "Mark all as read", never just by scrolling past it.

export const CATEGORIES = [
  { key: "rent", label: "Rent records" },
  { key: "enquiries", label: "Enquiries and viewings" },
  { key: "team", label: "Team" },
  { key: "listings", label: "Listings" },
  { key: "reports", label: "Reports" },
  { key: "admin", label: "Platform admin" },
  { key: "other", label: "Other" },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export function categoryOf(kind: string): CategoryKey {
  if (/^(entry|charge|correction|payment|tenancy)/.test(kind)) return "rent";
  if (/^(message|viewing|enquiry)/.test(kind)) return "enquiries";
  if (/^(invite|access|membership|staff)/.test(kind)) return "team";
  if (/^listing/.test(kind)) return "listings";
  if (/^report/.test(kind)) return "reports";
  if (/^(registration|onboarding)/.test(kind)) return "admin";
  return "other";
}

export type Update = { id: string; kind: string; category: CategoryKey; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string; restricted: boolean };

/** Updates for the signed-in user; `orgId` narrows to one workspace plus personal ones. */
export async function getUpdates(opts: { orgId?: string; limit?: number } = {}): Promise<Update[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  let q = supabase.from("notifications").select("id, org_id, kind, title, body, link, read_at, created_at").eq("user_id", user.id);
  if (opts.orgId) q = q.or(`org_id.eq.${opts.orgId},org_id.is.null`);
  const [{ data }, workspaces] = await Promise.all([q.order("created_at", { ascending: false }).limit(opts.limit ?? 100), getWorkspaces()]);
  const active = new Set(workspaces.map((w) => w.org_id));
  return (data ?? []).map((n) => {
    // After someone leaves a workspace, its message and rent previews stay hidden from them.
    const restricted = !!n.org_id && !active.has(n.org_id);
    return { id: n.id, kind: n.kind, category: categoryOf(n.kind), title: restricted ? "Update from a workspace you no longer belong to" : n.title, body: restricted ? null : n.body, link: restricted ? null : n.link, read_at: n.read_at, created_at: n.created_at, restricted };
  });
}

/** Unread count for the app shell badge. One cheap count query, cached per request. */
export const getUnreadCount = cache(async (orgId?: string): Promise<number> => {
  const user = await getSessionUser();
  if (!user) return 0;
  const supabase = await createClient();
  let q = supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null);
  if (orgId) q = q.or(`org_id.eq.${orgId},org_id.is.null`);
  const { count } = await q;
  return count ?? 0;
});

/** Internal paths only; anything else is dropped rather than followed. */
export function safeInternalLink(link: string | null): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//") || link.startsWith("/\\")) return null;
  return link;
}
