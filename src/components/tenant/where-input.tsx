"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { PlaceAutocomplete } from "@/components/ui/place-autocomplete";

const POPULAR = ["Ruaka", "Kilimani", "Kileleshwa", "Lavington", "Westlands", "Ngong Road", "Juja", "Syokimau", "Kasarani", "Rongai", "Thika Road", "Embakasi"];

/** Example addresses typed out in the empty box, to show what can be entered. */
const EXAMPLES = ["Ruaka, Limuru Road", "Kilimani, Argwings Kodhek Road", "Westlands, near Sarit Centre", "Syokimau, Mombasa Road", "Juja, near JKUAT"];
const TYPE_MS = 75;
const ERASE_MS = 35;
const HOLD_MS = 1600;

const noop = () => () => {};
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Types each example out, holds it, erases it, then moves to the next. Static when motion is reduced. */
function useTypedExample(running: boolean) {
  const [text, setText] = useState("");
  const still = useSyncExternalStore(noop, prefersReducedMotion, () => false);
  useEffect(() => {
    if (!running || still) return;
    let example = 0;
    let length = 0;
    let erasing = false;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const full = EXAMPLES[example];
      if (!erasing && length < full.length) length++;
      else if (!erasing) erasing = true;
      else if (length > 0) length--;
      else {
        erasing = false;
        example = (example + 1) % EXAMPLES.length;
      }
      setText(EXAMPLES[example].slice(0, length));
      timer = setTimeout(step, erasing ? (length === full.length ? HOLD_MS : ERASE_MS) : TYPE_MS);
    };
    timer = setTimeout(step, 500);
    return () => clearTimeout(timer);
  }, [running, still]);
  return still ? EXAMPLES[0] : text;
}

// The "Where" box on Explore. Picking a place searches by distance from it; typed text that
// wasn't picked searches area, town, county, road and landmark by name.
export function WhereInput({ placesEnabled }: { placesEnabled: boolean }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState<{ lat: number; lng: number } | null>(null);
  const [focused, setFocused] = useState(false);
  // The example plays only while the box is empty and not in use; the real placeholder takes over on focus.
  const demo = !q && !focused;
  const example = useTypedExample(demo);
  return (
    <div className="relative" onFocusCapture={() => setFocused(true)} onBlurCapture={() => setFocused(false)}>
      <PlaceAutocomplete
        enabled={placesEnabled}
        id="q"
        name="q"
        value={q}
        onChange={(text) => {
          setQ(text);
          setAt(null);
        }}
        onPlace={(p) => setAt(p?.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude } : null)}
        fallback={POPULAR}
        placeholder="Area, estate, road or landmark"
        className={`w-full bg-transparent text-[1.0625rem] font-semibold text-ink placeholder:font-normal focus:outline-none ${demo ? "placeholder:text-transparent" : "placeholder:text-[#8c959b]"}`}
      />
      {demo ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex max-w-full items-center overflow-hidden text-[1.0625rem] whitespace-nowrap text-[#8c959b]">
          {example}
          <span className="ml-px inline-block h-[1.1em] w-[2px] animate-[caret-blink_1s_steps(1)_infinite] bg-primary" />
        </span>
      ) : null}
      {at ? (
        <>
          <input type="hidden" name="lat" value={at.lat.toFixed(5)} />
          <input type="hidden" name="lng" value={at.lng.toFixed(5)} />
        </>
      ) : null}
    </div>
  );
}
