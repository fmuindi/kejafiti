"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inviteMember } from "@/app/w/[orgId]/team/actions";
import { ErrorSummary, Field, Select, TextInput, describedBy } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Button, Notice } from "@/components/ui/primitives";
import { formatDate } from "@/lib/dates";
import { AccessFields, AuthoritySummary, DEFAULT_ACCESS, ROLE_HELP, type AccessState } from "./access-fields";

export function AddMemberPanel({ orgId, properties, isOwner }: { orgId: string; properties: Array<{ id: string; name: string }>; isOwner: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [access, setAccess] = useState<AccessState>({ ...DEFAULT_ACCESS.manager, all_properties: false, property_ids: properties.length === 1 ? [properties[0].id] : [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | undefined>();
  const [result, setResult] = useState<{ link: string; expiresAt: string; name: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  // Two steps: choose, then review the summary and send (IMP-14).
  const [reviewing, setReviewing] = useState(false);
  const firstName = name.trim().split(/\s+/)[0];

  if (result) {
    return (
      <aside aria-labelledby="sent" className="surface flex h-fit flex-col gap-4 p-5 xl:sticky xl:top-6">
        <h2 id="sent" className="heading-section">Invitation created</h2>
        <Notice tone="success" role="status" title={`${result.name} is invited`}>
          The invitation to {result.email} expires {formatDate(result.expiresAt)}. They sign in with that email and set their own sign-in;
          you never see their password.
        </Notice>
        <div className="flex flex-col gap-2">
          <p className="text-label font-semibold">Invitation link</p>
          <p className="rounded-control bg-cool p-3 font-mono text-caption break-all">{result.link}</p>
          <Button
            variant="secondary"
            icon="file"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result.link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
          <p className="text-caption text-muted">Share it only with {result.name}. It works once, for that email address.</p>
        </div>
        <Button
          onClick={() => {
            setResult(null);
            setName("");
            setEmail("");
            setPhone("");
            setCopied(false);
          }}
        >
          Add another person
        </Button>
      </aside>
    );
  }

  return (
    <aside aria-labelledby="add" className="surface h-fit p-5 xl:sticky xl:top-6">
      <h2 id="add" className="heading-section">
        Add manager
      </h2>
      <form
        noValidate
        className="mt-4 flex flex-col gap-4"
        action={() => {
          if (!reviewing) {
            setReviewing(true);
            return;
          }
          start(async () => {
            setErrors({});
            setMessage(undefined);
            const res = await inviteMember(orgId, { ...access, display_name: name, email, phone: phone || undefined });
            setReviewing(false);
            if (!res.ok) {
              setErrors(res.fieldErrors ?? {});
              setMessage(res.message);
              return;
            }
            setResult({ link: res.data.link, expiresAt: res.data.expiresAt, name, email });
            router.refresh();
          });
        }}
      >
        <ErrorSummary errors={errors} message={message} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Field label="Full name" htmlFor="display_name" error={errors.display_name}>
            <TextInput id="display_name" value={name} onChange={(e) => setName(e.target.value)} error={errors.display_name} aria-describedby={describedBy("display_name", { error: errors.display_name })} />
          </Field>
          <Field label="Role" htmlFor="role">
            <Select
              id="role"
              value={access.role}
              onChange={(e) => {
                const role = e.target.value as AccessState["role"];
                setAccess((a) => ({ ...a, ...DEFAULT_ACCESS[role] }));
                setReviewing(false);
              }}
            >
              <option value="manager">Property manager</option>
              <option value="caretaker">Caretaker</option>
              <option value="viewer">Accountant (view only)</option>
              {isOwner ? <option value="agency_admin">Agency admin</option> : null}
            </Select>
          </Field>
        </div>
        <p className="-mt-2 text-caption text-muted">{ROLE_HELP[access.role]}</p>
        <Field label="Invitation email" htmlFor="email" error={errors.email}>
          <TextInput id="email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="name@example.co.ke" aria-describedby={describedBy("email", { error: errors.email })} />
        </Field>
        <Field label="Phone" htmlFor="phone" optional>
          <TextInput id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <AccessFields value={access} onChange={(v) => { setAccess(v); setReviewing(false); }} properties={properties} isOwner={isOwner} propertyError={errors.property_ids} />
        <p className="flex items-start gap-2 text-caption text-muted">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
          {firstName ? `${firstName} sets` : "They set"} their own sign-in. You never see it. The invitation expires in 7 days.
        </p>
        {reviewing ? <AuthoritySummary value={access} properties={properties} name={firstName} /> : null}
        <div className="flex gap-2">
          {reviewing ? <Button type="button" variant="secondary" size="lg" onClick={() => setReviewing(false)} className="flex-1">Change</Button> : null}
          <Button type="submit" size="lg" pending={pending} pendingLabel="Sending" className="flex-[1.6]">
            {reviewing ? "Send invitation" : "Review access"}
          </Button>
        </div>
      </form>
    </aside>
  );
}
