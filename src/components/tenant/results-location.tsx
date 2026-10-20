"use client";

import { useState } from "react";
import { PlaceAutocomplete } from "@/components/ui/place-autocomplete";
import { Icon } from "@/components/ui/icon";
import { buttonClass } from "@/components/ui/primitives";

/**
 * Change the area from the results page (IMP-10). Budget, layout, must-haves and the
 * other filters ride along as hidden fields; only the location and page change. A picked
 * place searches by distance; text that isn't picked searches by name, and the form says so.
 */
export function ResultsLocation({ placesEnabled, q, lat, lng, r, keep }: {
  placesEnabled: boolean;
  q?: string;
  lat?: number;
  lng?: number;
  r: number;
  /** Current filters other than location and page, as [name, value] pairs. */
  keep: Array<[string, string]>;
}) {
  const [text, setText] = useState(q ?? "");
  const [at, setAt] = useState<{ lat: number; lng: number } | null>(lat !== undefined && lng !== undefined ? { lat, lng } : null);
  const nearestSort = keep.some(([k, v]) => k === "sort" && v === "nearest");
  return (
    <form action="/search" role="search" aria-label="Change location" className="flex flex-col gap-1.5">
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1 rounded-[12px] border border-input bg-surface px-3 focus-within:ring-2 focus-within:ring-deep/40">
          <label htmlFor="results-where" className="sr-only">Where</label>
          <PlaceAutocomplete
            enabled={placesEnabled}
            id="results-where"
            name="q"
            value={text}
            onChange={(v) => {
              setText(v);
              setAt(null);
            }}
            onPlace={(p) => setAt(p?.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude } : null)}
            placeholder="Area, estate, road or landmark"
            className="min-h-11 w-full bg-transparent text-[15.5px] font-semibold text-ink placeholder:font-normal focus:outline-none"
          />
        </div>
        <button type="submit" className={buttonClass("primary", "md")} aria-label="Update location">
          <Icon name="search" size={18} />
        </button>
      </div>
      {keep.filter(([k, v]) => !(k === "sort" && v === "nearest" && !at)).map(([k, v], i) => <input key={`${k}-${i}`} type="hidden" name={k} value={v} />)}
      {at ? (
        <>
          <input type="hidden" name="lat" value={at.lat.toFixed(5)} />
          <input type="hidden" name="lng" value={at.lng.toFixed(5)} />
          {r !== 5 ? <input type="hidden" name="r" value={r} /> : null}
        </>
      ) : null}
      <p className="text-[12.5px] text-muted" aria-live="polite">
        {at
          ? `Homes within ${r} km of the picked place. Your other filters stay.`
          : text
            ? `Matching homes whose area, road or landmark mentions "${text}". Pick a suggestion to search by distance.${nearestSort ? " Nearest-first sorting needs a picked place, so it will switch to Most relevant." : ""}`
            : "Anywhere. Your other filters stay."}
      </p>
    </form>
  );
}
