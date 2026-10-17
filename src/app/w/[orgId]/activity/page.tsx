import type { Metadata } from "next";
import { ActivityList } from "@/components/workspace/activity-list";
import { PageTitle } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ params }: PageProps<"/w/[orgId]/activity">) {
  const { orgId } = await params;
  await requireWorkspace(orgId, `/w/${orgId}/activity`);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at").eq("user_id", claims?.claims?.sub ?? "").or(`org_id.eq.${orgId},org_id.is.null`).order("created_at", { ascending: false }).limit(50);
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4">
      <PageTitle>Activity</PageTitle>
      <p className="text-[14px] text-muted">Every alert is kept here. Email and other channels are optional extras and are not the record.</p>
      <ActivityList items={data ?? []} />
    </div>
  );
}
