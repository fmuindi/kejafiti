import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon, Logo } from "@/components/ui/icon";
import { getProfile, getWorkspaces, requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/rent/status";

export const metadata: Metadata = { title: "Choose a workspace" };

// Opens the remembered workspace when it is still yours; with several and none remembered,
// asks. No workspace starts onboarding. The chooser never loops: every link is a membership.
export default async function WorkspaceEntry() {
  await requireUser("/w");
  const [workspaces, profile] = await Promise.all([getWorkspaces(), getProfile()]);
  if (workspaces.length === 0) redirect("/start");
  const last = workspaces.find((w) => w.org_id === profile?.last_org_id);
  if (last) redirect(`/w/${last.org_id}`);
  if (workspaces.length === 1) redirect(`/w/${workspaces[0].org_id}`);
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-narrow flex-col gap-5 px-4 pt-5 pb-10">
      <Link href="/" aria-label="nyumbani home" className="self-start"><Logo /></Link>
      <h1 className="heading-page">Choose a workspace</h1>
      <p className="-mt-2 text-body text-muted">You belong to {workspaces.length} workspaces. We&apos;ll remember your choice.</p>
      <ul className="surface-list">
        {workspaces.map((w) => (
          <li key={w.org_id}>
            <Link href={`/w/${w.org_id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-cool">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{w.org_name}</span>
                <span className="text-caption text-muted">{ROLE_LABEL[w.role]}</span>
              </span>
              <Icon name="chevronRight" className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/" className="link-action text-center text-body">Browse homes instead</Link>
    </main>
  );
}
