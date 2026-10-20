import type { Metadata } from "next";
import { PageTitle } from "@/components/ui/primitives";
import { ActivityList } from "@/components/workspace/activity-list";
import { UpdateChannels } from "@/components/workspace/update-channels";
import { requireWorkspace } from "@/lib/auth";
import { getUpdates } from "@/lib/updates";

export const metadata: Metadata = { title: "Updates" };

// This workspace's updates plus personal ones, grouped by area (IMP-08).
export default async function ActivityPage({ params }: PageProps<"/w/[orgId]/activity">) {
  const { orgId } = await params;
  await requireWorkspace(orgId, `/w/${orgId}/activity`);
  const items = await getUpdates({ orgId });
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5">
      <PageTitle>Updates</PageTitle>
      <ActivityList items={items} orgId={orgId} />
      <UpdateChannels />
    </div>
  );
}
