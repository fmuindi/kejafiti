"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createWorkspace } from "@/app/start/actions";
import { ChoiceChips, Field, TextInput } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";

export function StartWorkspaceForm() {
  const router = useRouter();
  const [kind, setKind] = useState("landlord");
  const [role, setRole] = useState("owner");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5"
      action={(fd) =>
        start(async () => {
          setError(null);
          const r = await createWorkspace(String(fd.get("name") ?? ""), kind as "landlord" | "agency", role, String(fd.get("phone") ?? ""));
          if (!r.ok) return setError(r.message);
          router.replace(`/w/${r.data.orgId}`);
          router.refresh();
        })
      }
    >
      {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
      <ChoiceChips
        name="kind"
        legend="I am"
        value={kind}
        onChange={(v) => {
          setKind(v);
          setRole(v === "agency" ? "agent" : "owner");
        }}
        options={[
          { value: "landlord", label: "A landlord" },
          { value: "agency", label: "An agent or management company" },
        ]}
      />
      {kind === "agency" ? (
        <ChoiceChips
          name="advertiser_role"
          legend="Shown to tenants as"
          value={role}
          onChange={setRole}
          options={[
            { value: "agent", label: "Agent" },
            { value: "property_manager", label: "Property manager" },
          ]}
        />
      ) : null}
      <Field label={kind === "agency" ? "Agency name" : "Your name or business name"} htmlFor="name" hint="Tenants see this on your listings.">
        <TextInput id="name" name="name" required minLength={2} maxLength={120} aria-describedby="name-hint" />
      </Field>
      <Field label="Contact phone" htmlFor="phone" optional hint="Used for tenant calls and WhatsApp only if you turn them on for a listing.">
        <TextInput id="phone" name="phone" type="tel" inputMode="tel" aria-describedby="phone-hint" />
      </Field>
      <Button type="submit" size="lg" pending={pending} pendingLabel="Creating">
        Create workspace
      </Button>
    </form>
  );
}
