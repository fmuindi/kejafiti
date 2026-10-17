"use client";

import { useState, useTransition } from "react";
import { updateProfileName } from "@/app/(tenant)/account/actions";
import { Field, TextInput } from "@/components/ui/form";
import { Button } from "@/components/ui/primitives";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [value, setValue] = useState(name);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateProfileName(value);
          setMsg(r.ok ? "Saved." : r.message);
        });
      }}
    >
      <Field label="Your name" htmlFor="full_name" hint="Shown to advertisers you contact and to your team.">
        <TextInput id="full_name" value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} autoComplete="name" aria-describedby="full_name-hint" />
      </Field>
      <p className="text-[14px]"><span className="text-muted">Sign-in email:</span> <strong>{email}</strong></p>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" pending={pending}>Save name</Button>
        {msg ? <span role="status" className="text-[13.5px] font-semibold">{msg}</span> : null}
      </div>
    </form>
  );
}
