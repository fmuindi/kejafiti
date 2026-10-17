"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createProperty, updateProperty } from "@/app/w/[orgId]/properties/actions";
import { ErrorSummary, Field, Select, TextInput } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";
import { STYLE_LABEL } from "@/lib/listing/catalog";

type Values = { name: string; area: string; town: string; county: string; road: string; landmark: string; building_style: string; owner_label: string; rent_due_day: number; evidence_policy: "optional" | "required" };

export function PropertyForm({ orgId, propertyId, initial }: { orgId: string; propertyId?: string; initial?: Values }) {
  const router = useRouter();
  const [v, setV] = useState<Values>(initial ?? { name: "", area: "", town: "", county: "", road: "", landmark: "", building_style: "apartment", owner_label: "", rent_due_day: 5, evidence_policy: "optional" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: k === "rent_due_day" ? Number(e.target.value) : e.target.value });
  return (
    <form
      noValidate
      className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setSaved(false);
          const r = propertyId ? await updateProperty(orgId, propertyId, v) : await createProperty(orgId, v);
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            setMessage(r.message);
            return;
          }
          setErrors({});
          setMessage(undefined);
          if (!propertyId && r.data && "id" in r.data) router.push(`/w/${orgId}/properties/${(r.data as { id: string }).id}`);
          else {
            setSaved(true);
            router.refresh();
          }
        });
      }}
    >
      <ErrorSummary errors={errors} message={message} />
      <Field label="Property name" htmlFor="name" error={errors.name}>
        <TextInput id="name" value={v.name} onChange={set("name")} error={errors.name} placeholder="e.g. Sunrise Apartments" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Area or estate" htmlFor="area" error={errors.area}>
          <TextInput id="area" value={v.area} onChange={set("area")} error={errors.area} />
        </Field>
        <Field label="Road" htmlFor="road" optional>
          <TextInput id="road" value={v.road} onChange={set("road")} />
        </Field>
        <Field label="Town" htmlFor="town" optional>
          <TextInput id="town" value={v.town} onChange={set("town")} />
        </Field>
        <Field label="County" htmlFor="county" optional>
          <TextInput id="county" value={v.county} onChange={set("county")} />
        </Field>
      </div>
      <Field label="Nearby landmark" htmlFor="landmark" optional>
        <TextInput id="landmark" value={v.landmark} onChange={set("landmark")} />
      </Field>
      <Field label="Building style" htmlFor="building_style">
        <Select id="building_style" value={v.building_style} onChange={set("building_style")}>
          {Object.entries(STYLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Owner (if you manage it for someone)" htmlFor="owner_label" optional hint="Kept private. Helps agencies that manage for several owners.">
        <TextInput id="owner_label" value={v.owner_label} onChange={set("owner_label")} aria-describedby="owner_label-hint" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Usual rent due day" htmlFor="rent_due_day" hint="1–28. Each tenancy can override it.">
          <TextInput id="rent_due_day" type="number" min={1} max={28} value={v.rent_due_day} onChange={set("rent_due_day")} aria-describedby="rent_due_day-hint" />
        </Field>
        <Field label="Receipts before confirming" htmlFor="evidence_policy" hint="Whether staff must attach evidence before confirming.">
          <Select id="evidence_policy" value={v.evidence_policy} onChange={set("evidence_policy")}>
            <option value="optional">Optional</option>
            <option value="required">Required</option>
          </Select>
        </Field>
      </div>
      {saved ? <Notice tone="success" role="status">Saved.</Notice> : null}
      <Button type="submit" size="lg" pending={pending} pendingLabel="Saving">{propertyId ? "Save property" : "Add property"}</Button>
    </form>
  );
}
