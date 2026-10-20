"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateMemberAccess } from "@/app/w/[orgId]/team/actions";
import { Field, Select } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";
import { AccessFields, AuthoritySummary, DEFAULT_ACCESS, ROLE_HELP, type AccessState } from "./access-fields";

export function EditAccess({
  orgId,
  membershipId,
  properties,
  isOwner,
  initial,
  name = "",
}: {
  orgId: string;
  membershipId: string;
  properties: Array<{ id: string; name: string }>;
  isOwner: boolean;
  initial: AccessState;
  name?: string;
}) {
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  // Review the before/after summary before saving (IMP-14).
  const [reviewing, setReviewing] = useState(false);
  const change = (v: AccessState) => {
    setAccess(v);
    setReviewing(false);
    setMsg(null);
  };
  return (
    <form
      className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5"
      action={() => {
        if (!reviewing) {
          setReviewing(true);
          return;
        }
        start(async () => {
          const r = await updateMemberAccess(orgId, membershipId, access);
          setMsg(r.ok ? { ok: true, text: "Access updated. It applies to their very next request, and the change is logged." } : { ok: false, text: r.message });
          setReviewing(false);
          if (r.ok) router.refresh();
        });
      }}
    >
      <Field label="Role" htmlFor="role">
        <Select id="role" value={access.role} onChange={(e) => change({ ...access, ...DEFAULT_ACCESS[e.target.value as AccessState["role"]] })}>
          <option value="manager">Property manager</option>
          <option value="caretaker">Caretaker</option>
          <option value="viewer">Accountant (view only)</option>
          {isOwner ? <option value="agency_admin">Agency admin</option> : null}
        </Select>
      </Field>
      <p className="-mt-2 text-[13px] text-muted">{ROLE_HELP[access.role]}</p>
      <AccessFields value={access} onChange={change} properties={properties} isOwner={isOwner} />
      {reviewing ? <AuthoritySummary value={access} before={initial} properties={properties} name={name.trim().split(/\s+/)[0]} /> : null}
      {msg ? <Notice tone={msg.ok ? "success" : "error"} role="status">{msg.text}</Notice> : null}
      <div className="flex gap-2">
        {reviewing ? (
          <Button type="button" variant="secondary" size="lg" onClick={() => setReviewing(false)} className="flex-1">
            Change
          </Button>
        ) : null}
        <Button type="submit" size="lg" pending={pending} pendingLabel="Saving" className="flex-[1.6]">
          {reviewing ? "Save access" : "Review changes"}
        </Button>
      </div>
    </form>
  );
}
