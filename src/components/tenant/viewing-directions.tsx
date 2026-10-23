"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button, buttonClass } from "@/components/ui/primitives";
import { googleDirectionsUrl, type Place } from "@/lib/directions";

// Leaflet needs the browser, and only people who open the map should download it.
const LiveMap = dynamic(() => import("./live-map"), {
  ssr: false,
  loading: () => <div className="grid h-[300px] place-items-center rounded-[14px] border border-line bg-cool text-[0.875rem] text-muted">Loading map…</div>,
});

/** Where the confirmed viewing is, with directions: Google Maps, or the live map in the app. */
export function ViewingDirections({ place, landmark }: { place: Place; landmark: string | null }) {
  const [open, setOpen] = useState(false);
  const exact = place.latitude !== null && place.longitude !== null;
  // Viewing addresses often start with the building name; don't say it twice.
  const address = place.address?.toLowerCase().startsWith(place.name.toLowerCase()) ? place.address : [place.name, place.address].filter(Boolean).join(", ");
  return (
    <section aria-label="Directions" className="flex flex-col gap-2.5 rounded-[12px] bg-cool p-3">
      <p className="flex items-start gap-2">
        <Icon name="pin" size={18} className="mt-0.5 shrink-0 text-primary" />
        <span>
          <span className="block font-semibold">{address}</span>
          {landmark ? <span className="block text-[0.84375rem] text-muted">{landmark}</span> : null}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={googleDirectionsUrl(place)} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "sm")}>
          <Icon name="map" size={17} /> Directions<span className="sr-only"> in Google Maps</span>
        </a>
        {exact ? (
          <Button type="button" size="sm" variant="secondary" icon="pin" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Hide map" : "Live map"}
          </Button>
        ) : null}
      </div>
      {open && exact ? <LiveMap lat={place.latitude!} lng={place.longitude!} label={place.name} /> : null}
    </section>
  );
}
