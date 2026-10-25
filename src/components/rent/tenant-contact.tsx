"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { updateTenantContact } from "@/app/w/[orgId]/rent/actions";
import { Field, TextInput, describedBy } from "@/components/ui/form";
import { Button, InlineError } from "@/components/ui/primitives";

/** The tenant's phone and email, which invoices, reminders and messages go to. */
export function TenantContact({
  orgId,
  propertyId,
  tenantId,
  email,
  phone,
  canEdit,
}: {
  orgId: string;
  propertyId: string;
  tenantId: string;
  email: string | null;
  phone: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [e, setE] = useState(email ?? "");
  const [p, setP] = useState(phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const hint = "Invoices, reminders and messages go here.";

  if (!open) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-label text-muted">
        {[phone, email].filter(Boolean).join(" · ") || "No phone or email on file"}
        {canEdit ? (
          <button type="button" className="link-action text-label" onClick={() => setOpen(true)}>
            {email || phone ? "Change" : "Add contact details"}
          </button>
        ) : null}
      </p>
    );
  }
  return (
    <form
      className="mt-2 flex max-w-narrow flex-col gap-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => {
          setError(null);
          const res = await updateTenantContact(orgId, propertyId, tenantId, e, p);
          if (!res.ok) return setError(res.message);
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <Field label="Email" htmlFor={`${id}-email`} optional hint={hint}>
        <TextInput id={`${id}-email`} type="email" autoComplete="off" value={e} onChange={(x) => setE(x.target.value)} aria-describedby={describedBy(`${id}-email`, { hint })} />
      </Field>
      <Field label="Phone" htmlFor={`${id}-phone`} optional>
        <TextInput id={`${id}-phone`} type="tel" inputMode="tel" autoComplete="off" value={p} onChange={(x) => setP(x.target.value)} />
      </Field>
      {error ? <InlineError>{error}</InlineError> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" pending={busy}>Save</Button>
        <Button type="button" size="sm" variant="quiet" onClick={() => { setOpen(false); setE(email ?? ""); setP(phone ?? ""); setError(null); }}>Cancel</Button>
      </div>
    </form>
  );
}
