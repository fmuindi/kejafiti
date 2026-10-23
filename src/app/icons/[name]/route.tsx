import { ImageResponse } from "next/og";
import { BrandMark } from "@/lib/brand-mark";

// Home-screen icons for the web app manifest. "maskable" keeps the mark inside the safe
// zone (the inner 80%) because Android crops it to its own shape.
const ICONS: Record<string, { size: number; padding: number }> = {
  "192.png": { size: 192, padding: 0.18 },
  "512.png": { size: 512, padding: 0.18 },
  "maskable-512.png": { size: 512, padding: 0.28 },
};

export async function GET(_req: Request, { params }: RouteContext<"/icons/[name]">) {
  const icon = ICONS[(await params).name];
  if (!icon) return new Response("Not found", { status: 404 });
  return new ImageResponse(<BrandMark size={icon.size} padding={icon.padding} rounded={false} />, {
    width: icon.size,
    height: icon.size,
    headers: { "Cache-Control": "public, max-age=604800, immutable" },
  });
}
