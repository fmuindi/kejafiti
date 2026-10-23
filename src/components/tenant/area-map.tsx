"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";

const EMBED_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ?? "";

/**
 * Approximate area on a map, loaded only when asked for (IMP-10). It is centred on the
 * listing's public position, which is rounded to about 1 km, with no pin, so it can't
 * reveal the exact address. Without an embed key nothing renders; the text location stays.
 */
export function AreaMap({ lat, lng, label }: { lat: number | null; lng: number | null; label: string }) {
  const [open, setOpen] = useState(false);
  if (!EMBED_KEY || lat === null || lng === null) return null;
  if (!open) {
    return (
      <Button type="button" size="sm" variant="secondary" icon="map" onClick={() => setOpen(true)} className="self-start">
        Show the approximate area on a map
      </Button>
    );
  }
  const src = `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(EMBED_KEY)}&center=${lat},${lng}&zoom=14`;
  return (
    <figure className="flex flex-col gap-1.5">
      <iframe title={`Map of the approximate area: ${label}`} src={src} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="aspect-[16/10] w-full rounded-card border border-line" />
      <figcaption className="text-caption text-muted">Approximate area only (within about 1 km). The exact address is shared after a viewing is confirmed.</figcaption>
    </figure>
  );
}
