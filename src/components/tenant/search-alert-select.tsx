"use client";

import { useState, useTransition } from "react";
import { setSavedSearchAlert } from "@/app/(tenant)/actions";
import { cx } from "@/components/ui/primitives";

type Frequency = "instant" | "daily" | "off";
const OPTIONS: Array<{ value: Frequency; label: string }> = [
  { value: "instant", label: "Alert me right away" },
  { value: "daily", label: "Daily digest" },
  { value: "off", label: "No alerts" },
];

// How often a saved search tells the tenant about newly published homes that match it.
export function SearchAlertSelect({ id, value, label }: { id: string; value: Frequency; label: string }) {
  const [current, setCurrent] = useState(value);
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return (
    <select
      aria-label={`Alerts for ${label}`}
      value={current}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as Frequency;
        const before = current;
        setCurrent(next);
        setError(false);
        start(async () => {
          const res = await setSavedSearchAlert(id, next);
          if (!res.ok) {
            setCurrent(before);
            setError(true);
          }
        });
      }}
      className={cx(
        "ml-4 min-h-10 max-w-[11rem] shrink-0 rounded-control sm:ml-0 border bg-surface px-2 text-caption font-semibold",
        error ? "border-error text-error" : "border-line",
      )}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{error && o.value === current ? `${o.label} (not saved)` : o.label}</option>
      ))}
    </select>
  );
}
