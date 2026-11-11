"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startListing } from "@/app/w/[orgId]/listings/actions";
import { ChoiceChips, Field, Select, TextInput } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";
import { LAYOUT_LABEL } from "@/lib/listing/catalog";
import { OCCUPANCY, type Occupancy } from "@/lib/rent/status";

type Earlier = { id: string; ref: string; status: string; unitLabel: string; layout: string; bedrooms: number | null };
type Prop = { id: string; name: string; area: string; units: Array<{ id: string; label: string; occupancy: string }>; listings: Earlier[] };

const STATUS: Record<string, string> = { draft: "draft", under_review: "in review", published: "live", paused: "paused", needs_correction: "needs a correction", let: "let", withdrawn: "withdrawn", expired: "expired" };

// Single-home landlords never need to understand properties and units: "A new home" creates
// both behind the scenes. Portfolio managers pick an existing unit. Another unit in a building
// that has been listed before starts from that listing's building details, so the location,
// costs, contact and house rules aren't typed again.
export function StartListingForm({ orgId, properties, canCreateProperty, presetUnit }: { orgId: string; properties: Prop[]; canCreateProperty: boolean; presetUnit?: string }) {
  const router = useRouter();
  const presetProp = properties.find((p) => p.units.some((u) => u.id === presetUnit));
  const [mode, setMode] = useState<"existing" | "new">(properties.length || !canCreateProperty ? "existing" : "new");
  const [propertyId, setPropertyId] = useState(presetProp?.id ?? properties[0]?.id ?? "");
  const [unitId, setUnitId] = useState(presetUnit ?? "");
  const [area, setArea] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [layout, setLayout] = useState("bedsitter_studio");
  // "" = the suggested listing in the building (the first one listed); "none" = start blank.
  const [copyFrom, setCopyFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const prop = properties.find((p) => p.id === propertyId);

  return (
    <form
      className="surface flex flex-col gap-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r =
            mode === "existing"
              ? await startListing(orgId, { ...(unitId ? { unitId } : { propertyId, unitLabel: unitLabel || undefined, layout }), copyFrom: copyFrom || undefined })
              : await startListing(orgId, { area, unitLabel: unitLabel || "Main", layout });
          if (!r.ok) return setError(r.message);
          router.push(`/w/${orgId}/listings/${r.data.listingId}`);
        });
      }}
    >
      {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
      {properties.length && canCreateProperty ? (
        <ChoiceChips name="mode" legend="What are you listing?" value={mode} onChange={(v) => setMode(v as "existing" | "new")}
          options={[{ value: "existing", label: "A unit in one of my properties" }, { value: "new", label: "A new home" }]} />
      ) : null}
      {mode === "existing" ? (
        <>
          <Field label="Property" htmlFor="property">
            <Select id="property" value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setUnitId(""); setCopyFrom(""); }}>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.area}</option>)}
            </Select>
          </Field>
          <Field label="Unit" htmlFor="unit">
            <Select id="unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">A new unit in this property</option>
              {(prop?.units ?? []).map((u) => <option key={u.id} value={u.id}>{u.label} · {OCCUPANCY[u.occupancy as Occupancy]}</option>)}
            </Select>
          </Field>
          {!unitId ? (
            <Field label="New unit reference" htmlFor="unit_label">
              <TextInput id="unit_label" value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="e.g. B4" />
            </Field>
          ) : null}
          {prop?.listings.length ? (
            <Field
              label="Fill in from"
              htmlFor="copy_from"
              hint="The location is already saved for this building. Costs and charges, deposit, contact and viewing details, house rules, building features and building photos are copied; you can change anything. The unit's own details and photos aren't copied."
            >
              <Select id="copy_from" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} aria-describedby="copy_from-hint">
                {prop.listings.map((l, i) => (
                  <option key={l.id} value={i === 0 ? "" : l.id}>
                    Unit {l.unitLabel} · {LAYOUT_LABEL[l.layout] ?? l.layout}{l.bedrooms ? ` (${l.bedrooms} bed)` : ""} · {STATUS[l.status] ?? l.status}{i === 0 ? " · suggested" : ""}
                  </option>
                ))}
                <option value="none">Start blank (location only)</option>
              </Select>
            </Field>
          ) : null}
        </>
      ) : (
        <>
          <Field label="Area or estate" htmlFor="area" hint="Tenants see the area. The exact address stays private.">
            <TextInput id="area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Ruaka" aria-describedby="area-hint" />
          </Field>
          <Field label="Unit reference" htmlFor="unit_label" optional hint='Use "Main" for a whole house.'>
            <TextInput id="unit_label" value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} aria-describedby="unit_label-hint" />
          </Field>
        </>
      )}
      {mode === "new" || !unitId ? (
        <ChoiceChips name="layout" legend="Layout" value={layout} onChange={setLayout}
          options={[{ value: "single_room", label: "Single room" }, { value: "double_room", label: "Double room" }, { value: "bedsitter_studio", label: "Bedsitter / studio" }, { value: "bedroom_home", label: "Home with bedrooms" }]} />
      ) : null}
      <Button type="submit" size="lg" pending={pending} pendingLabel="Starting">Start listing</Button>
    </form>
  );
}
