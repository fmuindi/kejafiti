"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addUnits } from "@/app/w/[orgId]/properties/actions";
import { Field, MoneyInput, Select, TextInput } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";
import { parseAmount } from "@/lib/money";

export function AddUnitsForm({ orgId, propertyId }: { orgId: string; propertyId: string }) {
  const router = useRouter();
  const [labels, setLabels] = useState("");
  const [layout, setLayout] = useState("bedsitter_studio");
  const [bedrooms, setBedrooms] = useState("1");
  const [rent, setRent] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section aria-labelledby="add-units" className="surface p-4">
      <h2 id="add-units" className="heading-section">Add units</h2>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_1fr_0.6fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addUnits(orgId, propertyId, { labels, layout, bedrooms: layout === "bedroom_home" ? Number(bedrooms) : null, rent: parseAmount(rent) });
            setMsg(r.ok ? { ok: true, text: `${r.data.created} unit${r.data.created === 1 ? "" : "s"} added.` } : { ok: false, text: r.message });
            if (r.ok) {
              setLabels("");
              router.refresh();
            }
          });
        }}
      >
        <Field label="Unit references" htmlFor="labels" hint='e.g. "A1-A10, B1"'>
          <TextInput id="labels" value={labels} onChange={(e) => setLabels(e.target.value)} aria-describedby="labels-hint" />
        </Field>
        <Field label="Layout" htmlFor="u-layout">
          <Select id="u-layout" value={layout} onChange={(e) => setLayout(e.target.value)}>
            <option value="single_room">Single room</option>
            <option value="double_room">Double room</option>
            <option value="bedsitter_studio">Bedsitter / studio</option>
            <option value="bedroom_home">Bedroom home</option>
          </Select>
        </Field>
        <Field label="Bedrooms" htmlFor="u-beds">
          <TextInput id="u-beds" type="number" min={1} value={bedrooms} disabled={layout !== "bedroom_home"} onChange={(e) => setBedrooms(e.target.value)} />
        </Field>
        <Field label="Usual rent" htmlFor="u-rent" optional>
          <MoneyInput id="u-rent" value={rent} onChange={(e) => setRent(e.target.value)} />
        </Field>
        <Button type="submit" pending={pending} className="min-h-field">Add</Button>
      </form>
      {msg ? <Notice tone={msg.ok ? "success" : "error"} role="status" className="mt-3">{msg.text}</Notice> : null}
    </section>
  );
}
