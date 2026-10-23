"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { distanceText, metresBetween } from "@/lib/directions";

// The in-app map for a confirmed viewing: the home's pin and the tenant's own position, live.
// OpenStreetMap tiles (no key). The position comes from the browser and stays in it.

type Fix = { lat: number; lng: number; accuracy: number };
type Geo = "asking" | "on" | "denied" | "unavailable";

const homeIcon = L.divIcon({
  className: "",
  html: '<div class="grid size-10 place-items-center rounded-full border-[3px] border-white bg-primary text-white shadow-lg"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/></svg></div>',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});
const meIcon = L.divIcon({
  className: "",
  html: '<div class="size-[18px] rounded-full border-[3px] border-white bg-deep shadow-[0_0_0_6px_rgba(0,79,113,0.25)]"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export default function LiveMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ me?: L.Marker; accuracy?: L.Circle; line?: L.Polyline }>({});
  const fitted = useRef(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [geo, setGeo] = useState<Geo>(() => ("geolocation" in navigator ? "asking" : "unavailable"));
  const home = { lat, lng };

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    L.marker([lat, lng], { icon: homeIcon, title: label, keyboard: false }).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layers.current = {};
      fitted.current = false;
    };
  }, [lat, lng, label]);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeo("on");
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      (e) => setGeo(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Move the blue dot and the line as the position changes; frame both on the first fix.
  useEffect(() => {
    const m = map.current;
    if (!m || !fix) return;
    const l = layers.current;
    const at: L.LatLngTuple = [fix.lat, fix.lng];
    if (!l.me) {
      l.accuracy = L.circle(at, { radius: fix.accuracy, color: "#004f71", weight: 1, fillOpacity: 0.08, interactive: false }).addTo(m);
      l.me = L.marker(at, { icon: meIcon, title: "You", keyboard: false }).addTo(m);
      l.line = L.polyline([at, [lat, lng]], { color: "#dd0031", weight: 3, dashArray: "6 8", interactive: false }).addTo(m);
    } else {
      l.me.setLatLng(at);
      l.accuracy?.setLatLng(at).setRadius(fix.accuracy);
      l.line?.setLatLngs([at, [lat, lng]]);
    }
    if (!fitted.current) {
      fitted.current = true;
      m.fitBounds(L.latLngBounds([at, [lat, lng]]), { padding: [48, 48], maxZoom: 17 });
    }
  }, [fix, lat, lng]);

  const showBoth = () => fix && map.current?.fitBounds(L.latLngBounds([[fix.lat, fix.lng], [lat, lng]]), { padding: [48, 48], maxZoom: 17 });
  const showHome = () => map.current?.setView([lat, lng], 17);
  const metres = fix ? metresBetween(fix, home) : null;

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative">
        <div ref={el} role="img" aria-label={`Map with ${label} and your location`} className="z-0 h-[52vh] max-h-[460px] min-h-[300px] w-full overflow-hidden rounded-[14px] border border-line" />
        <div className="pointer-events-none absolute inset-x-2 top-2 z-[400] flex justify-center">
          <p role="status" aria-live="polite" className="pointer-events-auto rounded-full bg-surface px-3.5 py-1.5 text-[0.875rem] font-semibold shadow-md">
            {metres !== null
              ? distanceText(metres)
              : geo === "asking"
                ? "Finding your location…"
                : geo === "denied"
                  ? "Location is off. Showing the home only."
                  : "Your location isn't available. Showing the home only."}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {fix ? <Button type="button" size="sm" variant="secondary" onClick={showBoth}>Show me and the home</Button> : null}
        <Button type="button" size="sm" variant="secondary" onClick={showHome}>Centre on the home</Button>
      </div>
      <figcaption className="text-[0.78125rem] text-muted">
        {geo === "denied" ? "To see yourself on the map, allow location for this site in your browser settings. " : null}
        The line is a straight line; use Google Maps for the road route. Your location stays on this phone and isn&apos;t shared.
      </figcaption>
    </figure>
  );
}
