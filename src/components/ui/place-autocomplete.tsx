"use client";

import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import type { PlaceDetails, PlaceSuggestion } from "@/lib/places";
import { Icon } from "./icon";
import { cx } from "./primitives";

// Accessible combobox over /api/places. When Places is off (no key), it is a plain input that
// keeps the given fallback suggestions as a native datalist.

type Props = Omit<ComponentProps<"input">, "value" | "onChange" | "list" | "onSelect"> & {
  enabled: boolean;
  value: string;
  onChange: (value: string) => void;
  /**
   * When set, a pick also fetches the place's details (area, town, county, road, coordinates)
   * in the same billing session. Details are null if that lookup failed.
   */
  onPlace?: (details: PlaceDetails | null, suggestion: PlaceSuggestion) => void;
  fallback?: string[];
};

export function PlaceAutocomplete({ enabled, value, onChange, onPlace, fallback = [], className, id, ...input }: Props) {
  const auto = useId();
  const inputId = id ?? auto;
  const listId = `${inputId}-places`;
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typed, setTyped] = useState(false);
  const session = useRef<string>("");
  const cache = useRef(new Map<string, PlaceSuggestion[]>());

  useEffect(() => {
    if (!enabled || !typed) return;
    const q = value.trim();
    if (q.length < 2) return;
    const hit = cache.current.get(q.toLowerCase());
    if (hit) {
      setItems(hit);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      // One session per pick: Google bills the keystrokes and the final details call together.
      session.current ||= crypto.randomUUID();
      try {
        const res = await fetch(`/api/places/autocomplete?${new URLSearchParams({ q, session: session.current })}`, { signal: ctrl.signal });
        const body = (await res.json()) as { suggestions: PlaceSuggestion[] };
        cache.current.set(q.toLowerCase(), body.suggestions);
        setItems(body.suggestions);
        setActive(-1);
      } catch {
        // Offline or aborted: keep typing as free text.
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [enabled, typed, value]);

  const shown = open && value.trim().length >= 2 ? items : [];

  async function pick(s: PlaceSuggestion) {
    onChange(s.main);
    setOpen(false);
    setTyped(false);
    setItems([]);
    const token = session.current;
    session.current = "";
    if (onPlace) onPlace(await fetchDetails(s.id, token), s);
  }

  if (!enabled) {
    return (
      <>
        <input {...input} id={inputId} value={value} onChange={(e) => onChange(e.target.value)} list={fallback.length ? listId : undefined} autoComplete="off" className={className} />
        {fallback.length ? (
          <datalist id={listId}>
            {fallback.map((a) => <option key={a} value={a} />)}
          </datalist>
        ) : null}
      </>
    );
  }

  return (
    <div className="relative">
      <input
        {...input}
        id={inputId}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-activedescendant={active >= 0 && shown[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          setTyped(true);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && shown.length) {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (a + 1) % shown.length);
          } else if (e.key === "ArrowUp" && shown.length) {
            e.preventDefault();
            setActive((a) => (a <= 0 ? shown.length - 1 : a - 1));
          } else if (e.key === "Enter" && shown.length && active >= 0) {
            e.preventDefault();
            void pick(shown[active]);
          } else if (e.key === "Escape" && shown.length) {
            e.preventDefault();
            setOpen(false);
          }
        }}
      />
      {shown.length ? (
        <div className="surface absolute inset-x-0 top-full z-30 mt-1 overflow-hidden shadow-raised">
          <ul id={listId} role="listbox" aria-label="Suggested places">
            {shown.map((s, i) => (
              <li
                key={s.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Keep focus in the input so blur doesn't close the list before the click lands.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(s)}
                onMouseEnter={() => setActive(i)}
                className={cx("flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-left", i === active ? "bg-cool" : "")}
              >
                <Icon name="pin" size={18} className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block truncate text-body font-semibold text-ink">{s.main}</span>
                  {s.secondary ? <span className="block truncate text-caption font-normal text-muted">{s.secondary}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-divider px-3.5 py-1.5 text-right text-micro text-muted">Suggestions from Google Maps</p>
        </div>
      ) : null}
    </div>
  );
}

async function fetchDetails(id: string, session: string): Promise<PlaceDetails | null> {
  try {
    const res = await fetch(`/api/places/details?${new URLSearchParams({ id, session: session || crypto.randomUUID() })}`);
    if (!res.ok) return null;
    return ((await res.json()) as { place: PlaceDetails | null }).place;
  } catch {
    return null;
  }
}
