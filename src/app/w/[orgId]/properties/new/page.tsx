import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PropertyForm } from "@/components/workspace/property-form";
import { PageTitle } from "@/components/ui/primitives";
import { isOrgAdmin, requireWorkspace } from "@/lib/auth";

export const metadata: Metadata = { title: "Add property" };

export default async function NewPropertyPage({ params }: PageProps<"/w/[orgId]/properties/new">) {
  const { orgId } = await params;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/properties/new`);
  if (!isOrgAdmin(ws)) notFound();
  return (
    <div className="mx-auto flex max-w-[600px] flex-col gap-4">
      <PageTitle>Add a property</PageTitle>
      <p className="text-[15px] text-muted">A building or compound. You&apos;ll add its units next.</p>
      <PropertyForm orgId={orgId} />
    </div>
  );
}
