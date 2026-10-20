"use client";

import { useState } from "react";
import { PlaceAutocomplete } from "@/components/ui/place-autocomplete";

const POPULAR = ["Ruaka", "Kilimani", "Kileleshwa", "Lavington", "Westlands", "Ngong Road", "Juja", "Syokimau", "Kasarani", "Rongai", "Thika Road", "Embakasi"];

// The "Where" box on Explore. Picking a place searches by distance from it; typed text that
// wasn't picked searches area, town, county, road and landmark by name.
export function WhereInput({ placesEnabled }: { placesEnabled: boolean }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState<{ lat: number; lng: number } | null>(null);
  return (
    <>
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
        className="w-full bg-transparent text-[17px] font-semibold text-ink placeholder:font-normal placeholder:text-[#8c959b] focus:outline-none"
      />
      {at ? (
        <>
          <input type="hidden" name="lat" value={at.lat.toFixed(5)} />
          <input type="hidden" name="lng" value={at.lng.toFixed(5)} />
        </>
      ) : null}
    </>
  );
}
