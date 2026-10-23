import type { Metadata } from "next";
import Link from "next/link";
import { StartWorkspaceForm } from "@/components/workspace/start-form";
import { Icon, Logo } from "@/components/ui/icon";
import { getWorkspaces, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "List your home" };

export default async function StartPage() {
  await requireUser("/start");
  const workspaces = await getWorkspaces();
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-narrow flex-col gap-5 px-4 pt-5 pb-10">
      <Link href="/" aria-label="nyumbani home" className="self-start">
        <Logo />
      </Link>
      <div>
        <h1 className="heading-page">Set up your landlord or agent workspace</h1>
        <p className="mt-2 text-body text-muted">
          Listing is free for one vacancy. You can also keep rent records with your team. Tenants keep paying the way they already do;
          nyumbani never collects rent.
        </p>
      </div>
      {workspaces.length ? (
        <section aria-labelledby="existing" className="flex flex-col gap-2">
          <h2 id="existing" className="text-label font-semibold text-muted">Your workspaces</h2>
          {workspaces.map((w) => (
            <Link key={w.org_id} href={`/w/${w.org_id}`} className="surface flex min-h-row items-center justify-between px-4 font-semibold hover:border-ink">
              {w.org_name}
              <Icon name="chevronRight" className="text-muted" />
            </Link>
          ))}
        </section>
      ) : null}
      <StartWorkspaceForm />
      <p className="text-caption text-muted">
        Our team reviews new landlord and agent accounts before listings go live. Creating a workspace doesn&apos;t publish anything.
      </p>
    </main>
  );
}
