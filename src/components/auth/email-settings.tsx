"use client";

import { useState, useTransition } from "react";
import { updateEmailSettings } from "@/app/(tenant)/account/actions";
import { Checkbox } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";

export type EmailCategory = { key: string; label: string; description: string };

// Notification settings: everything always arrives in the app; this chooses which categories
// also come by email. Each change saves straight away.
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
      <h2 id="email-h" className="heading-group flex items-center gap-2">
        <Icon name="bell" size={16} /> Notifications
      </h2>
      <div className="surface flex flex-col gap-3.5 p-4">
        <p className="text-label text-muted">
          {emailOn
            ? "Everything arrives in the app. Choose what also comes by email:"
            : "Everything arrives in the app. Email isn't switched on for nyumbani yet; your choices below are kept for when it is."}
        </p>
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
        <p role="status" className="min-h-5 text-caption">
          {status === "saved" ? <span className="font-semibold text-success">Saved</span> : null}
          {status === "error" ? <span className="font-semibold text-error">Not saved. Check your connection and try again.</span> : null}
        </p>
      </div>
    </section>
  );
}
