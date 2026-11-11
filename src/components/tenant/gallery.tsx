"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";

// Swipe is optional; visible previous/next buttons and a position count always work.
export function Gallery({
  photos,
  title,
}: {
  /** `thumbUrl` is the 640px copy made at upload; phones use it instead of the 1600px original. */
  photos: Array<{ url: string; thumbUrl?: string; label: string; alt: string | null }>;
  title: string;
}) {
  const [i, setI] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  if (photos.length === 0) {
    return (
      <div className="grid aspect-[4/3] place-items-center bg-cool text-muted md:rounded-panel">
        <span className="flex flex-col items-center gap-2 text-label">
          <Icon name="image" size={28} /> No photos yet
        </span>
      </div>
    );
  }
  const p = photos[i];
  const go = (d: number) => setI((x) => (x + d + photos.length) % photos.length);
  const labelText = p.label === "sample" ? "Sample photo, not this unit" : p.label === "building" ? "Building" : "Actual unit";

  return (
    <div
      className="relative aspect-[4/3] overflow-hidden bg-cool md:rounded-panel"
      aria-roledescription="carousel"
      aria-label={`Photos of ${title}`}
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        setTouchX(null);
      }}
    >
      {/* Signed Storage URLs change per request, so the Next image optimizer would never hit
          its cache; the upload already made both sizes, and srcset picks between them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={p.url}
        src={p.url}
        srcSet={srcSet(p)}
        sizes="(min-width: 768px) 720px, 100vw"
        alt={p.alt ?? `${labelText}, photo ${i + 1} of ${photos.length}`}
        // The first photo is usually the largest thing on screen: fetch it first.
        fetchPriority={i === 0 ? "high" : "auto"}
        decoding="async"
        className="size-full object-cover"
      />
      {photos.length > 1 ? (
        // Warm the next photo so "Next" shows it without a blank frame.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photos[(i + 1) % photos.length].url} srcSet={srcSet(photos[(i + 1) % photos.length])} sizes="(min-width: 768px) 720px, 100vw" alt="" aria-hidden="true" loading="lazy" decoding="async" className="pointer-events-none absolute size-px opacity-0" />
      ) : null}
      <span
        className={`absolute bottom-3 left-3 rounded-chip px-2.5 py-1 text-caption font-semibold ${p.label === "sample" ? "bg-waiting-tint text-waiting-strong" : "bg-ink/85 text-white"}`}
        aria-live="polite"
      >
        {labelText} · photo {i + 1} of {photos.length}
      </span>
      {photos.length > 1 ? (
        <div className="absolute right-3 bottom-3 flex gap-2">
          <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="grid size-11 place-items-center rounded-full bg-surface text-ink">
            <Icon name="chevronLeft" />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Next photo" className="grid size-11 place-items-center rounded-full bg-surface text-ink">
            <Icon name="chevronRight" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function srcSet(p: { url: string; thumbUrl?: string }) {
  return p.thumbUrl ? `${p.thumbUrl} 640w, ${p.url} 1600w` : undefined;
}
