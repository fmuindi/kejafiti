import { describe, expect, it } from "vitest";
import { distanceText, googleDirectionsUrl, metresBetween } from "@/lib/directions";

// Directions to a confirmed viewing.

describe("googleDirectionsUrl", () => {
  it("routes to the exact position when there is one", () => {
    expect(googleDirectionsUrl({ latitude: -1.2051, longitude: 36.7782, address: "Banana Hill Rd, Ruaka", name: "Example Court" })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=-1.2051%2C36.7782",
    );
  });
  it("falls back to the name and address", () => {
    expect(googleDirectionsUrl({ latitude: null, longitude: null, address: "Banana Hill Rd, Ruaka", name: "Example Court" })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Example%20Court%2C%20Banana%20Hill%20Rd%2C%20Ruaka%2C%20Kenya",
    );
  });
});

describe("distance", () => {
  it("measures straight-line distance", () => {
    // Ruaka to Westlands, about 7.6 km apart.
    const m = metresBetween({ lat: -1.2051, lng: 36.7782 }, { lat: -1.2676, lng: 36.8108 });
    expect(m).toBeGreaterThan(7400);
    expect(m).toBeLessThan(8000);
  });
  it("reads naturally", () => {
    expect(distanceText(40)).toBe("You're here");
    expect(distanceText(347)).toBe("350 m away");
    expect(distanceText(2430)).toBe("2.4 km away");
    expect(distanceText(15_600)).toBe("16 km away");
  });
});
