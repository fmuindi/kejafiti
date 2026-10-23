import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { TenantJumps } from "@/components/shell/tenant-jumps";
import { Notice } from "@/components/ui/primitives";
import { ActivityList } from "@/components/workspace/activity-list";
import { MarkAllRead } from "@/components/workspace/mark-all-read";
import { requireUser } from "@/lib/auth";
import { getUpdates } from "@/lib/updates";

export const metadata: Metadata = { title: "Updates" };

const GONE: Record<string, string> = {
  access: "You no longer have access to that item.",
  missing: "That update no longer exists.",
};

// Every update for this person across workspaces, plus personal ones (IMP-08).
export default async function UpdatesPage({ searchParams }: PageProps<"/updates">) {
  await requireUser("/updates");
  const gone = (await searchParams).gone;
  const items = await getUpdates();
  const unread = items.filter((i) => !i.read_at).length;
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-5 pb-10">
      <PageHeader icon="bell" title="Updates" meta={unread ? `${unread} new` : "Caught up"} action={unread ? <MarkAllRead /> : null} />
      <TenantJumps current="/updates" />
      {typeof gone === "string" && GONE[gone] ? <Notice tone="info" role="status">{GONE[gone]}</Notice> : null}
      <ActivityList items={items} />
    </div>
  );
}
