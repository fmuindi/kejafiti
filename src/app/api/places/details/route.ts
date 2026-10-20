import { NextResponse, type NextRequest } from "next/server";
import { PLACES_ENABLED, placeDetails } from "@/lib/places";

// Area, town, county, road and coordinates for a picked suggestion. Ends the billing session.
export async function GET(request: NextRequest) {
  if (!PLACES_ENABLED) return NextResponse.json({ place: null }, { status: 404 });
  const sp = request.nextUrl.searchParams;
  const id = sp.get("id") ?? "";
  const session = sp.get("session") ?? "";
  if (!/^[\w-]{10,300}$/.test(id) || !/^[\w-]{8,64}$/.test(session)) {
    return NextResponse.json({ place: null }, { status: 400 });
  }
  try {
    const place = await placeDetails(id, session);
    return NextResponse.json({ place }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ place: null }, { status: 502 });
  }
}
