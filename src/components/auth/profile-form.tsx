"use client";

import { useState, useTransition } from "react";
import { updateProfileName } from "@/app/(tenant)/account/actions";
import { Field, TextInput } from "@/components/ui/form";
import { Avatar, Button } from "@/components/ui/primitives";

/** Who you are: avatar, name and sign-in email, with the name editable in place. */
export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [value, setValue] = useState(name);
  const [saved, setSaved] = useState(name);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section aria-label="Profile" className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4">
      <div className="flex items-center gap-3.5">
        <Avatar name={saved || email} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[20px] font-bold">{saved || "Add your name"}</p>
          <p className="truncate text-[14px] text-muted">{email}</p>
        </div>
        {!editing ? (
          <Button type="button" size="sm" variant="secondary" icon="edit" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : null}
      </div>
      {editing ? (
        <form
          className="flex flex-col gap-3 border-t border-divider pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await updateProfileName(value);
              if (!r.ok) return setError(r.message);
              setError(null);
              setSaved(value.trim());
              setEditing(false);
            });
          }}
        >
          <Field label="Your name" htmlFor="full_name" hint="Advertisers and your team see this.">
            <TextInput id="full_name" value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} autoComplete="name" aria-describedby="full_name-hint" autoFocus />
          </Field>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" icon="check" pending={pending}>Save</Button>
            <Button type="button" size="sm" variant="quiet" onClick={() => { setValue(saved); setEditing(false); setError(null); }}>Cancel</Button>
            {error ? <span role="alert" className="text-[13.5px] font-semibold text-error">{error}</span> : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}
