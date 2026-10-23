import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddUnitsForm } from "@/components/workspace/add-units";
import { UnitsTable, type UnitRow } from "@/components/workspace/units-table";
import { PropertyForm } from "@/components/workspace/property-form";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, Eyebrow } from "@/components/ui/primitives";
import { isOrgAdmin, requireWorkspace } from "@/lib/auth";
import { STYLE_LABEL } from "@/lib/listing/catalog";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/shell/back-link";

export const metadata: Metadata = { title: "Property" };

export default async function PropertyPage({ params }: PageProps<"/w/[orgId]/properties/[propertyId]">) {
  const { orgId, propertyId } = await params;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/properties/${propertyId}`);
  const supabase = await createClient();
  const { data: p } = await supabase.from("properties").select("*").eq("id", propertyId).eq("org_id", orgId).maybeSingle();
  if (!p) notFound();
  const [{ data: units }, { data: listings }, { data: convs }] = await Promise.all([
    supabase.from("units").select("id, label, layout, bedrooms, default_rent, occupancy, occupancy_date").eq("property_id", propertyId).order("label"),
    supabase.from("listings").select("id, unit_id, status, rent_amount, availability_confirmed_at, ref").eq("property_id", propertyId).not("status", "in", "(let,withdrawn)"),
    ws.can_manage_listings ? supabase.from("conversations").select("id, listing_id, last_tenant_message_at, last_advertiser_message_at").eq("property_id", propertyId).neq("follow_up", "closed") : Promise.resolve({ data: [] }),
  ]);
  const byUnit = new Map((listings ?? []).map((l) => [l.unit_id, l]));
  const enquiryCount = new Map<string, number>();
  for (const c of convs ?? []) enquiryCount.set(c.listing_id, (enquiryCount.get(c.listing_id) ?? 0) + 1);

  const rows: UnitRow[] = (units ?? []).map((u) => {
    const l = byUnit.get(u.id);
    return {
      id: u.id,
      label: u.label,
      layout: u.layout,
      bedrooms: u.bedrooms,
      rent: l?.rent_amount ? Number(l.rent_amount) : u.default_rent ? Number(u.default_rent) : null,
      occupancy: u.occupancy,
      occupancyDate: u.occupancy_date,
      listing: l ? { id: l.id, status: l.status, confirmedAt: l.availability_confirmed_at, ref: l.ref, enquiries: enquiryCount.get(l.id) ?? 0 } : null,
    };
  });
  const vacant = rows.filter((r) => r.occupancy === "vacant").length;
  const published = rows.filter((r) => r.listing?.status === "published").length;
  const open = (convs ?? []).filter((c) => c.last_tenant_message_at && (!c.last_advertiser_message_at || c.last_advertiser_message_at < c.last_tenant_message_at)).length;
  const admin = isOrgAdmin(ws);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`/w/${orgId}/properties`}>Properties</BackLink>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{STYLE_LABEL[p.building_style ?? ""] ?? "Property"}</Eyebrow>
          <h1 className="mt-1 font-display text-[1.875rem] leading-none font-bold tracking-[-1px] md:text-[2.5rem]">{p.name}</h1>
          <p className="mt-2 text-[0.90625rem] text-muted">{[p.road, p.area, p.town].filter(Boolean).join(", ")}</p>
        </div>
        <dl className="flex gap-6">
          {[["Units", rows.length], ["Vacant", vacant], ["Published", published], ["Open enquiries", open]].map(([k, v]) => (
            <div key={k as string}>
              <dd className={`font-display text-[1.625rem] font-bold ${k === "Open enquiries" && Number(v) > 0 ? "text-waiting" : ""}`}>{v}</dd>
              <dt className="text-[0.78125rem] text-muted">{k}</dt>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/w/${orgId}/rent/${propertyId}`} variant="secondary" icon="wallet">Rent records</ButtonLink>
        {ws.can_manage_listings ? <ButtonLink href={`/w/${orgId}/listings/new`} icon="plus">List a home</ButtonLink> : null}
      </div>
      <UnitsTable orgId={orgId} propertyId={propertyId} rows={rows} canListings={ws.can_manage_listings} canTenancies={ws.can_manage_tenancies} />
      {ws.can_manage_tenancies || ws.can_manage_listings ? <AddUnitsForm orgId={orgId} propertyId={propertyId} /> : null}
      {admin ? (
        <details className="rounded-[18px] border border-line bg-surface p-4">
          <summary className="cursor-pointer font-semibold"><Icon name="edit" size={16} className="mr-1 inline" /> Edit property details</summary>
          <div className="mt-4">
            <PropertyForm
              orgId={orgId}
              propertyId={propertyId}
              initial={{ name: p.name, area: p.area, town: p.town ?? "", county: p.county ?? "", road: p.road ?? "", landmark: p.landmark ?? "", building_style: p.building_style ?? "apartment", owner_label: p.owner_label ?? "", rent_due_day: p.rent_due_day, evidence_policy: p.evidence_policy as "optional" | "required" }}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
