import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Data access layer for identity. Every page and action re-reads the session on the server;
// the database still makes the final authorization decision on every query and RPC.

export type SessionUser = { id: string; email: string | null };

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: (claims.email as string | undefined) ?? null };
});

export async function requireUser(next: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return user;
}

export const getProfile = cache(async () => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, last_role, last_org_id")
    .eq("id", user.id)
    .maybeSingle();
  return data;
});

export type Workspace = {
  org_id: string;
  org_name: string;
  kind: string;
  role: "owner" | "agency_admin" | "manager" | "caretaker" | "viewer";
  all_properties: boolean;
  can_manage_tenancies: boolean;
  can_enter_payments: boolean;
  can_confirm: boolean;
  can_correct: boolean;
  can_export: boolean;
  can_view_attachments: boolean;
  can_manage_listings: boolean;
  property_ids: string[];
};

export const getWorkspaces = cache(async (): Promise<Workspace[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_workspaces");
  return (data ?? []) as Workspace[];
});

/** The signed-in user's active membership in this workspace, or 404. */
export async function requireWorkspace(orgId: string, next: string): Promise<Workspace> {
  await requireUser(next);
  const ws = (await getWorkspaces()).find((w) => w.org_id === orgId);
  if (!ws) notFound();
  return ws;
}

export const isOrgAdmin = (ws: Workspace) => ws.role === "owner" || ws.role === "agency_admin";

export const getIsPlatformAdmin = cache(async (): Promise<boolean> => {
  const user = await getSessionUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return !!data;
});

export async function requirePlatformAdmin(next: string) {
  await requireUser(next);
  if (!(await getIsPlatformAdmin())) notFound();
}
