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
  const [{ data: properties }, { data: earlier }] = await Promise.all([
    supabase.from("properties").select("id, name, area, units(id, label, occupancy)").eq("org_id", orgId).is("archived_at", null).order("name"),
    // Earlier listings per building, latest first: a new listing can start from one of them.
    supabase.from("listings").select("id, ref, property_id, status, wizard_step, updated_at, units(label, layout, bedrooms)").eq("org_id", orgId).order("updated_at", { ascending: false }).limit(200),
  ]);
  // Same order start_listing picks by default: past draft first, then furthest along, then latest.
  const ranked = [...(earlier ?? [])].sort((a, b) => Number(b.status !== "draft") - Number(a.status !== "draft") || b.wizard_step - a.wizard_step || b.updated_at.localeCompare(a.updated_at));
  return (
    <div className="mx-auto flex max-w-reading flex-col gap-5">
      <BackLink href={`/w/${orgId}`}>Home</BackLink>
      <PageHeader icon="plus" title="List a home" />
      <p className="text-body text-muted">Listing is free for one vacancy. It takes about 10 minutes and saves as you go.</p>
      <StartListingForm
        orgId={orgId}
        canCreateProperty={isOrgAdmin(ws)}
        presetUnit={typeof sp.unit === "string" ? sp.unit : undefined}
        properties={(properties ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          area: p.area,
          units: ((p.units as unknown as Array<{ id: string; label: string; occupancy: string }>) ?? []).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
          listings: ranked
            .filter((l) => l.property_id === p.id)
            .map((l) => {
              const u = l.units as unknown as { label: string; layout: string; bedrooms: number | null } | null;
              return { id: l.id, ref: l.ref, status: l.status, unitLabel: u?.label ?? "", layout: u?.layout ?? "", bedrooms: u?.bedrooms ?? null };
            }),
        }))}
      />
    </div>
  );
}
