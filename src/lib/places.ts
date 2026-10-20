// Google Places API (New), called only from our route handlers so the key stays on the server.
// Without GOOGLE_MAPS_API_KEY the feature is off and location fields stay plain text inputs.

const API = "https://places.googleapis.com/v1";
const KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";

export const PLACES_ENABLED = KEY !== "";

export type PlaceSuggestion = { id: string; main: string; secondary: string };

export type PlaceDetails = {
  name: string;
  area: string;
  town: string;
  county: string;
  road: string;
  /** Set when the pick is a named building, school, mall or stage rather than an area. */
  landmark: string;
  latitude: number | null;
  longitude: number | null;
};

// Bias toward Nairobi, where most listings are, without excluding the rest of Kenya.
const NAIROBI = { latitude: -1.286389, longitude: 36.817223 };

export async function autocomplete(input: string, sessionToken: string): Promise<PlaceSuggestion[]> {
  const res = await fetch(`${API}/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY },
    body: JSON.stringify({
      input,
      sessionToken,
      includedRegionCodes: ["ke"],
      languageCode: "en",
      locationBias: { circle: { center: NAIROBI, radius: 50000 } },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Places autocomplete failed: ${res.status}`);
  const body = (await res.json()) as {
    suggestions?: Array<{ placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }>;
  };
  return (body.suggestions ?? []).flatMap((s) => {
    const p = s.placePrediction;
    if (!p) return [];
    const main = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
    return main ? [{ id: p.placeId, main, secondary: p.structuredFormat?.secondaryText?.text ?? "" }] : [];
  });
}

export async function placeDetails(placeId: string, sessionToken: string): Promise<PlaceDetails> {
  const url = `${API}/places/${encodeURIComponent(placeId)}?languageCode=en&sessionToken=${encodeURIComponent(sessionToken)}`;
  const res = await fetch(url, {
    // Request only what we store: billing rises with the fields asked for.
    headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "displayName,addressComponents,location,types" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Places details failed: ${res.status}`);
  return parsePlace(await res.json());
}

export type RawPlace = {
  displayName?: { text: string };
  addressComponents?: Array<{ longText: string; shortText?: string; types: string[] }>;
  location?: { latitude: number; longitude: number };
  types?: string[];
};

const AREA_PLACE_TYPES = new Set(["sublocality", "sublocality_level_1", "sublocality_level_2", "neighborhood", "locality", "route", "administrative_area_level_1", "administrative_area_level_2", "postal_town"]);

/** Map Google's address components onto our property fields (area, town, county, road). */
export function parsePlace(p: RawPlace): PlaceDetails {
  const parts = p.addressComponents ?? [];
  const pick = (...types: string[]) => {
    for (const t of types) {
      const c = parts.find((x) => x.types.includes(t));
      if (c) return c.longText;
    }
    return "";
  };
  const name = p.displayName?.text ?? "";
  const town = pick("locality", "postal_town", "administrative_area_level_2");
  // Kenyan counties come back as "Kiambu County"; we store "Kiambu".
  const county = pick("administrative_area_level_1").replace(/\s+County$/i, "");
  const area = pick("sublocality_level_1", "sublocality", "neighborhood", "sublocality_level_2") || town || name;
  const isArea = (p.types ?? []).some((t) => AREA_PLACE_TYPES.has(t));
  return {
    name,
    area,
    town,
    county,
    road: pick("route"),
    landmark: !isArea && name && name !== area ? name : "",
    latitude: p.location?.latitude ?? null,
    longitude: p.location?.longitude ?? null,
  };
}
