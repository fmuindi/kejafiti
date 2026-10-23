import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StartListingForm } from "@/components/listing/start-form";
import { isOrgAdmin, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/shell/back-link";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "List a home" };

export default async function NewListingPage({ params, searchParams }: PageProps<"/w/[orgId]/listings/new">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/listings/new`);
  if (!ws.can_manage_listings) notFound();
  const supabase = await createClient();
  const { data: properties } = await supabase.from("properties").select("id, name, area, units(id, label, occupancy)").eq("org_id", orgId).is("archived_at", null).order("name");
  return (
    <div className="mx-auto flex max-w-[600px] flex-col gap-4">
      <BackLink href={`/w/${orgId}`}>Overview</BackLink>
      <PageHeader icon="plus" title="List a home" />
      <p className="text-[15px] text-muted">Listing is free for one vacancy. It takes about 10 minutes and saves as you go.</p>
      <StartListingForm
        orgId={orgId}
        canCreateProperty={isOrgAdmin(ws)}
        presetUnit={typeof sp.unit === "string" ? sp.unit : undefined}
        properties={(properties ?? []).map((p) => ({ id: p.id, name: p.name, area: p.area, units: ((p.units as unknown as Array<{ id: string; label: string; occupancy: string }>) ?? []).sort((a, b) => a.label.localeCompare(b.label)) }))}
      />
    </div>
  );
}
