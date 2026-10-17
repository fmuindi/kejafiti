"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateMemberAccess } from "@/app/w/[orgId]/team/actions";
import { Field, Select } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";
import { AccessFields, DEFAULT_ACCESS, type AccessState } from "./access-fields";

export function EditAccess({
  orgId,
  membershipId,
  properties,
  isOwner,
  initial,
}: {
  orgId: string;
  membershipId: string;
  properties: Array<{ id: string; name: string }>;
  isOwner: boolean;
  initial: AccessState;
}) {
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5"
      action={() =>
        start(async () => {
          const r = await updateMemberAccess(orgId, membershipId, access);
          setMsg(r.ok ? { ok: true, text: "Access updated. It applies to their very next request, and the change is logged." } : { ok: false, text: r.message });
          if (r.ok) router.refresh();
        })
      }
    >
      <Field label="Role" htmlFor="role">
        <Select id="role" value={access.role} onChange={(e) => setAccess((a) => ({ ...a, ...DEFAULT_ACCESS[e.target.value as AccessState["role"]] }))}>
          <option value="manager">Property manager</option>
          <option value="caretaker">Caretaker</option>
          <option value="viewer">Accountant (view only)</option>
          {isOwner ? <option value="agency_admin">Agency admin</option> : null}
        </Select>
      </Field>
      <AccessFields value={access} onChange={setAccess} properties={properties} isOwner={isOwner} />
      {msg ? <Notice tone={msg.ok ? "success" : "error"} role="status">{msg.text}</Notice> : null}
      <Button type="submit" size="lg" pending={pending} pendingLabel="Saving">
        Save access
      </Button>
    </form>
  );
}
