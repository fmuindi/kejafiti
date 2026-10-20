import { describe, expect, it } from "vitest";
import { backFromListing, listingHref, parseSearch, toQuery } from "@/lib/listing/search";
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

describe("return from a listing (IMP-09)", () => {
  it("rebuilds the same filtered search, page and position", () => {
    const query = "q=Ruaka&lat=-1.2&lng=36.8&r=3&max=20000&type=bedsitter_studio&must=parking&must=private_bathroom&sort=nearest&page=2";
    expect(backFromListing(query, "L-4001")).toEqual({
      href: `/search?${toQuery(parseSearch(Object.fromEntries([["q", "Ruaka"], ["lat", "-1.2"], ["lng", "36.8"], ["r", "3"], ["max", "20000"], ["type", ["bedsitter_studio"]], ["must", ["parking", "private_bathroom"]], ["sort", "nearest"], ["page", "2"]])))}#home-L-4001`,
      label: "Back to results",
    });
    expect(backFromListing(query, "L-4001").href).toContain("must=parking&must=private_bathroom");
  });
  it("drops anything that isn't a valid filter and falls back for direct visits", () => {
    expect(backFromListing("q=Ruaka&evil=%3Cscript%3E&max=abc", "L-1").href).toBe("/search?q=Ruaka#home-L-1");
    expect(backFromListing(undefined, "L-1")).toEqual({ href: "/search", label: "Search homes" });
    expect(backFromListing("saved", "L-1").href).toBe("/saved#home-L-1");
    expect(listingHref("L-1", "q=Ruaka")).toBe("/homes/L-1?back=q%3DRuaka");
  });
});
