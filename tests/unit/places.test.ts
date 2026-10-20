import { describe, expect, it } from "vitest";
import { parseSearch, toQuery } from "@/lib/listing/search";
import { parsePlace } from "@/lib/places";

const c = (longText: string, ...types: string[]) => ({ longText, types });

describe("parsePlace (Google address components -> property fields)", () => {
  it("an estate fills area, town and county, and strips 'County'", () => {
    const p = parsePlace({
      displayName: { text: "Kilimani" },
      types: ["sublocality_level_1", "sublocality", "political"],
      addressComponents: [c("Kilimani", "sublocality_level_1", "sublocality"), c("Nairobi", "locality"), c("Nairobi County", "administrative_area_level_1"), c("Kenya", "country")],
      location: { latitude: -1.2921, longitude: 36.7871 },
    });
    expect(p).toMatchObject({ area: "Kilimani", town: "Nairobi", county: "Nairobi", road: "", landmark: "", latitude: -1.2921, longitude: 36.7871 });
  });

  it("a building becomes the landmark, with its road and estate", () => {
    const p = parsePlace({
      displayName: { text: "Ruaka Square" },
      types: ["shopping_mall", "establishment", "point_of_interest"],
      addressComponents: [c("Limuru Road", "route"), c("Ruaka", "neighborhood"), c("Ruaka", "locality"), c("Kiambu County", "administrative_area_level_1")],
      location: { latitude: -1.2049, longitude: 36.7786 },
    });
    expect(p).toMatchObject({ area: "Ruaka", town: "Ruaka", county: "Kiambu", road: "Limuru Road", landmark: "Ruaka Square" });
  });

  it("a town with no estate uses the town as the area", () => {
    const p = parsePlace({ displayName: { text: "Juja" }, types: ["locality"], addressComponents: [c("Juja", "locality"), c("Kiambu", "administrative_area_level_1")] });
    expect(p).toMatchObject({ area: "Juja", town: "Juja", county: "Kiambu", landmark: "", latitude: null, longitude: null });
  });
});

describe("place search URL state", () => {
  it("round-trips a picked place and radius", () => {
    const p = parseSearch({ q: "Two Rivers Mall", lat: "-1.2109876543", lng: "36.80512", r: "3", sort: "nearest" });
    expect(p).toMatchObject({ q: "Two Rivers Mall", lat: -1.21099, lng: 36.80512, r: 3, sort: "nearest" });
    expect(parseSearch(Object.fromEntries(new URLSearchParams(toQuery(p))))).toEqual(p);
  });
  it("needs both coordinates, falls back to 5 km, and only sorts by distance near a place", () => {
    expect(parseSearch({ q: "Ruaka", lat: "-1.2", r: "7", sort: "nearest" })).toMatchObject({ lat: undefined, lng: undefined, r: 5, sort: "relevant" });
    expect(toQuery(parseSearch({ lat: "-1.2", lng: "36.8" }))).toBe("lat=-1.2&lng=36.8");
    expect(parseSearch({ lat: "abc", lng: "36.8" }).lat).toBeUndefined();
  });
});
