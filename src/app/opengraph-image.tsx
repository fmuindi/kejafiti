import { ImageResponse } from "next/og";
import { BRAND, BrandMark } from "@/lib/brand-mark";

export const alt = "nyumbani: Kenyan rentals with rent, charges and move-in totals shown up front";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: BRAND.cream, color: BRAND.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <BrandMark size={88} padding={0.1} />
          <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: -1 }}>nyumbani</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>Find your next home without the hassle</span>
          <span style={{ fontSize: 34, color: "#67737C" }}>Rent, charges and move-in totals shown up front.</span>
        </div>
        <div style={{ display: "flex", height: 10, width: 160, borderRadius: 5, background: BRAND.primary }} />
      </div>
    ),
    size,
  );
}
