"use client";

import { useState, useTransition } from "react";
import { updateEmailSettings } from "@/app/(tenant)/account/actions";
import { Checkbox } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";

export type EmailCategory = { key: string; label: string; description: string };

// Which updates also arrive by email. Everything always arrives in the app; this only adds an
// email copy. Each change saves straight away.
export function EmailSettings({ categories, off, emailOn }: { categories: EmailCategory[]; off: string[]; emailOn: boolean }) {
  const [state, setState] = useState(() => new Set(off));
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, start] = useTransition();

  function toggle(key: string, wantEmail: boolean) {
    const next = new Set(state);
    if (wantEmail) next.delete(key);
    else next.add(key);
    const before = state;
    setState(next);
    start(async () => {
      const res = await updateEmailSettings([...next]);
      if (res.ok) setStatus("saved");
      else {
        setState(before);
        setStatus("error");
      }
    });
  }

  return (
    <section id="notifications" aria-labelledby="email-h" className="flex scroll-mt-24 flex-col gap-2">
      <h2 id="email-h" className="flex items-center gap-2 text-[0.9375rem] font-semibold text-muted">
        <Icon name="bell" size={16} /> Email me about
      </h2>
      <div className="flex flex-col gap-3.5 rounded-[16px] border border-line bg-surface p-4">
        {!emailOn ? (
          <p className="text-[0.84375rem] text-muted">Email isn&apos;t switched on for nyumbani yet. Your choices are kept for when it is; everything still arrives in the app.</p>
        ) : null}
        {categories.map((c) => (
          <Checkbox
            key={c.key}
            label={c.label}
            description={c.description}
            checked={!state.has(c.key)}
            disabled={pending}
            onChange={(e) => toggle(c.key, e.target.checked)}
          />
        ))}
        <p role="status" className="min-h-5 text-[0.8125rem]">
          {status === "saved" ? <span className="font-semibold text-success">Saved</span> : null}
          {status === "error" ? <span className="font-semibold text-error">Not saved. Check your connection and try again.</span> : null}
        </p>
      </div>
    </section>
  );
}
