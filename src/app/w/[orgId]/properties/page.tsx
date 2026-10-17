import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, EmptyState, PageTitle } from "@/components/ui/primitives";
import { isOrgAdmin, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Properties" };

export default async function PropertiesPage({ params, searchParams }: PageProps<"/w/[orgId]/properties">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/properties`);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const supabase = await createClient();
  let query = supabase.from("properties").select("id, name, area, road, units(id, occupancy), listings(id, status)").eq("org_id", orgId).is("archived_at", null).order("name");
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,area.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data: properties, error } = await query;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageTitle>Your properties</PageTitle>
          <p className="mt-1 text-[14.5px] text-muted">Buildings and their units. Listings and rent records use the same units.</p>
        </div>
        <div className="flex gap-2">
          {isOrgAdmin(ws) ? <ButtonLink href={`/w/${orgId}/properties/new`} variant="secondary" icon="plus">Add property</ButtonLink> : null}
          {ws.can_manage_listings ? <ButtonLink href={`/w/${orgId}/listings/new`} icon="plus">List a home</ButtonLink> : null}
        </div>
      </div>
      <form role="search" className="flex min-h-[50px] items-center gap-2 rounded-[12px] border border-input bg-surface px-3 focus-within:ring-2 focus-within:ring-deep/40">
        <Icon name="search" className="text-muted" />
        <label htmlFor="q" className="sr-only">Search property or area</label>
        <input id="q" name="q" defaultValue={q} placeholder="Search property or area" className="min-w-0 flex-1 bg-transparent text-[16px] focus:outline-none" />
      </form>
      {error ? (
        <p role="alert" className="text-error">We couldn&apos;t load your properties. Reload to try again.</p>
      ) : !properties?.length ? (
        <EmptyState title={q ? "No properties match" : "No properties yet"} icon="building" action={isOrgAdmin(ws) && !q ? <ButtonLink href={`/w/${orgId}/properties/new`}>Add a property</ButtonLink> : undefined}>
          {q ? "Try another name or area." : "Add a building with its units, or use List a home for a single house."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {properties.map((p) => {
            const units = (p.units as unknown as Array<{ occupancy: string }>) ?? [];
            const listings = (p.listings as unknown as Array<{ status: string }>) ?? [];
            const vacant = units.filter((u) => u.occupancy === "vacant").length;
            const published = listings.filter((l) => l.status === "published").length;
            return (
              <li key={p.id}>
                <Link href={`/w/${orgId}/properties/${p.id}`} className="flex flex-col gap-1.5 rounded-[18px] border border-line bg-surface p-4 hover:border-ink">
                  <span className="flex items-center justify-between font-display text-[19px] font-bold">
                    {p.name} <Icon name="chevronRight" className="text-muted" />
                  </span>
                  <span className="text-[13.5px] text-muted">{[p.area, p.road].filter(Boolean).join(", ")}</span>
                  <span className="text-[14px]">
                    {units.length} unit{units.length === 1 ? "" : "s"} · {vacant} vacant · {published} published
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
