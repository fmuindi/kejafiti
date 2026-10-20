"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/primitives";

const MAX = 3;

/** Pick two or three saved homes to compare (IMP-12). A plain GET form: works without JS. */
export function ComparePicker({ homes }: { homes: Array<{ ref: string; label: string }> }) {
  const [picked, setPicked] = useState<string[]>([]);
  if (homes.length < 2) return null;
  return (
    <form action="/saved/compare" className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-4">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-semibold">Compare saved homes</legend>
        <p className="mb-1 text-[13px] text-muted">Choose 2 or 3. You&apos;ll see costs, bathroom, water, floor and availability side by side.</p>
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
        Compare {picked.length >= 2 ? picked.length : ""} homes
      </button>
    </form>
  );
}
