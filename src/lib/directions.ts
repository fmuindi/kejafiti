// Directions to a confirmed viewing: the Google Maps link and the distance shown on the live map.

export type Place = { latitude: number | null; longitude: number | null; address: string | null; name: string };

/**
 * Google Maps directions from wherever the person is now. Opens the Google Maps app on phones
 * that have it, the website otherwise. Uses the exact position when there is one, else the address.
 */
export function googleDirectionsUrl(place: Place): string {
  const destination =
    place.latitude !== null && place.longitude !== null ? `${place.latitude},${place.longitude}` : [place.name, place.address, "Kenya"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** Straight-line distance in metres (haversine). */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Close enough to say "You're here". GPS on phones is often 10 to 30 m off. */
export const ARRIVED_M = 60;

/** "350 m away", "2.4 km away", "You're here". Straight line, not the road distance. */
export function distanceText(metres: number): string {
  if (metres <= ARRIVED_M) return "You're here";
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m away`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km away`;
}
