import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PropertyForm } from "@/components/workspace/property-form";
import { isOrgAdmin, requireWorkspace } from "@/lib/auth";
import { BackLink } from "@/components/shell/back-link";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Add property" };

export default async function NewPropertyPage({ params }: PageProps<"/w/[orgId]/properties/new">) {
  const { orgId } = await params;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/properties/new`);
  if (!isOrgAdmin(ws)) notFound();
  return (
    <div className="mx-auto flex max-w-[600px] flex-col gap-4">
      <BackLink href={`/w/${orgId}/properties`}>Properties</BackLink>
      <PageHeader icon="building" title="Add a property" />
      <p className="text-[15px] text-muted">A building or compound. You&apos;ll add its units next.</p>
      <PropertyForm orgId={orgId} />
    </div>
  );
}
