import { redirect } from "next/navigation";
import { getProfile, getWorkspaces, requireUser } from "@/lib/auth";

// Opens the last-used workspace (or the first one), or starts onboarding.
export default async function WorkspaceEntry() {
  await requireUser("/w");
  const [workspaces, profile] = await Promise.all([getWorkspaces(), getProfile()]);
  if (workspaces.length === 0) redirect("/start");
  const last = workspaces.find((w) => w.org_id === profile?.last_org_id);
  redirect(`/w/${(last ?? workspaces[0]).org_id}`);
}
