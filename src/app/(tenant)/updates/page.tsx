import type { Metadata } from "next";
import { Notice, PageTitle } from "@/components/ui/primitives";
import { ActivityList } from "@/components/workspace/activity-list";
import { UpdateChannels } from "@/components/workspace/update-channels";
import { requireUser } from "@/lib/auth";
import { getUpdates } from "@/lib/updates";

export const metadata: Metadata = { title: "Updates" };

const GONE: Record<string, string> = {
  access: "You no longer have access to that item, so it can't be opened. The update is kept here.",
  missing: "That update no longer exists.",
};

// Every update for this person across workspaces, plus personal ones (IMP-08).
export default async function UpdatesPage({ searchParams }: PageProps<"/updates">) {
  await requireUser("/updates");
  const gone = (await searchParams).gone;
  const items = await getUpdates();
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-5 pb-10">
      <PageTitle>Updates</PageTitle>
      {typeof gone === "string" && GONE[gone] ? <Notice tone="info" role="status">{GONE[gone]}</Notice> : null}
      <ActivityList items={items} />
      <UpdateChannels />
    </div>
  );
}
