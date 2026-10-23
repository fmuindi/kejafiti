import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { ActivityList } from "@/components/workspace/activity-list";
import { MarkAllRead } from "@/components/workspace/mark-all-read";
import { UpdateChannels } from "@/components/workspace/update-channels";
import { requireWorkspace } from "@/lib/auth";
import { getUpdates } from "@/lib/updates";

export const metadata: Metadata = { title: "Updates" };

// This workspace's updates plus personal ones, grouped by area (IMP-08).
export default async function ActivityPage({ params }: PageProps<"/w/[orgId]/activity">) {
  const { orgId } = await params;
  await requireWorkspace(orgId, `/w/${orgId}/activity`);
  const items = await getUpdates({ orgId });
  const unread = items.filter((i) => !i.read_at).length;
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5">
      <PageHeader icon="bell" title="Updates" meta={unread ? `${unread} new` : "Caught up"} action={unread ? <MarkAllRead orgId={orgId} /> : null} />
      <ActivityList items={items} />
      <UpdateChannels />
    </div>
  );
}
