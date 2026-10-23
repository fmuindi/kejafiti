"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { buttonClass } from "@/components/ui/primitives";

const MAX = 3;

/** Pick two or three saved homes to compare (IMP-12). A plain GET form: works without JS. */
export function ComparePicker({ homes }: { homes: Array<{ ref: string; label: string }> }) {
  const [picked, setPicked] = useState<string[]>([]);
  if (homes.length < 2) return null;
  return (
    <details className="group rounded-[16px] border border-line bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-4 font-semibold">
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-cool text-deep"><Icon name="swap" size={16} /></span>
        Compare side by side
        <span className="text-[13px] font-normal text-muted">Pick 2–3</span>
        <Icon name="chevronDown" size={18} className="ml-auto text-muted transition-transform group-open:rotate-180" />
      </summary>
      <form action="/saved/compare" className="flex flex-col gap-2 border-t border-divider p-4">
        <fieldset className="flex flex-col gap-1">
          <legend className="sr-only">Homes to compare</legend>
          {homes.map((h) => {
            const on = picked.includes(h.ref);
            return (
              <Checkbox
                key={h.ref}
                name="ref"
                value={h.ref}
                checked={on}
                disabled={!on && picked.length >= MAX}
                onChange={(e) => setPicked(e.target.checked ? [...picked, h.ref] : picked.filter((r) => r !== h.ref))}
                label={h.label}
              />
            );
          })}
        </fieldset>
        <button type="submit" disabled={picked.length < 2} className={buttonClass("primary", "md", "self-start disabled:opacity-50")}>
          <Icon name="swap" size={18} /> Compare{picked.length >= 2 ? ` ${picked.length}` : ""}
        </button>
      </form>
    </details>
  );
}
