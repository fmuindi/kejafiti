import "server-only";
import { getIsPlatformAdmin, getProfile, getWorkspaces } from "@/lib/auth";

/**
 * Where a signed-in person lands when no task was interrupted (IMP-06). Decided on the
 * server from current memberships, so a removed membership simply falls through.
 *   1. The last workspace they used, if they're still an active member.
 *   2. Their only workspace, or the chooser when they have several.
 *   3. The admin centre for platform admins without a workspace.
 *   4. The home search for everyone else (tenants are never sent into staff tools).
 */
export async function roleHome(): Promise<string> {
  const [workspaces, profile, isAdmin] = await Promise.all([getWorkspaces(), getProfile(), getIsPlatformAdmin()]);
  const last = workspaces.find((w) => w.org_id === profile?.last_org_id);
  if (last) return `/w/${last.org_id}`;
  if (workspaces.length === 1) return `/w/${workspaces[0].org_id}`;
  if (workspaces.length > 1) return "/w";
  if (isAdmin) return "/admin";
  return "/";
}
