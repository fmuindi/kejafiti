"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { inviteTenantAccess, revokeTenantAccess } from "@/app/w/[orgId]/rent/actions";
import { Field, TextInput, describedBy } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Button, Notice } from "@/components/ui/primitives";
import { formatDate } from "@/lib/dates";

// Online access for the tenant: their own rent, balance and statement (confirmed records
// only). Staff send a one-time link; the tenant opens it signed in with that email.
export function TenantAccess({
  orgId,
  propertyId,
  tenantId,
  tenantName,
  linked,
  pending,
  defaultEmail,
}: {
  orgId: string;
  propertyId: string;
  tenantId: string;
  tenantName: string;
  linked: boolean;
  pending: { email: string; expiresAt: string } | null;
  defaultEmail: string | null;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(pending?.email ?? defaultEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ link: string; emailQueued: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const first = tenantName.split(" ")[0];
  const id = useId();
  const hint = "They sign in with this email to open the link.";

  const invite = () =>
    start(async () => {
      setError(null);
      const res = await inviteTenantAccess(orgId, propertyId, tenantId, email);
      if (!res.ok) return setError(res.message);
      setSent({ link: res.data.link, emailQueued: res.data.emailQueued });
      setOpen(false);
      router.refresh();
    });

  return (
    <section aria-labelledby="access-h" className="mt-4 flex flex-col gap-2.5 border-t border-divider pt-4">
      <h3 id="access-h" className="flex items-center gap-2 text-label font-semibold">
        <Icon name="user" size={16} className="text-muted" /> Tenant&apos;s online access
      </h3>
      {linked ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-label text-muted">{first} can see their rent, balance and statement online.</p>
          <Button
            size="sm"
            variant="secondary"
            pending={busy}
            onClick={() => {
              if (!confirm(`Remove ${first}'s online access? They will no longer see their tenancy.`)) return;
              start(async () => {
                const res = await revokeTenantAccess(orgId, propertyId, tenantId);
                if (!res.ok) setError(res.message);
                router.refresh();
              });
            }}
          >
            Remove access
          </Button>
        </div>
      ) : (
        <>
          <p className="text-label text-muted">
            {pending
              ? `Link sent to ${pending.email}, waiting for ${first} to open it (expires ${formatDate(pending.expiresAt)}).`
              : `Let ${first} see their own rent, balance and statement online. They see confirmed records only, never your notes.`}
          </p>
          {sent ? (
            <div className="flex flex-col gap-2 rounded-control bg-cool p-3">
              <p className="text-caption font-semibold">{sent.emailQueued ? `Emailed to ${email}. You can also share the link yourself:` : "Email is off, so share this link with the tenant yourself:"}</p>
              <p className="font-mono text-micro break-all">{sent.link}</p>
              <Button
                size="sm"
                variant="secondary"
                icon={copied ? "check" : undefined}
                className="self-start"
                onClick={async () => {
                  await navigator.clipboard.writeText(sent.link);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          ) : null}
          {open ? (
            <form
              className="flex flex-col gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                invite();
              }}
            >
              <Field label="Tenant's email" htmlFor={id} error={error ?? undefined} hint={hint}>
                <TextInput id={id} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required error={error ?? undefined} aria-describedby={describedBy(id, { error: error ?? undefined, hint })} />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" size="sm" pending={busy}>{pending ? "Send a new link" : "Send link"}</Button>
                <Button type="button" size="sm" variant="quiet" onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <Button size="sm" variant="secondary" className="self-start" onClick={() => setOpen(true)}>
              {pending ? "Resend link" : "Give online access"}
            </Button>
          )}
        </>
      )}
      {error && !open ? <Notice tone="error" role="alert">{error}</Notice> : null}
    </section>
  );
}
