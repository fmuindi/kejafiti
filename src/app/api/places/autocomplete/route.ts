import { NextResponse, type NextRequest } from "next/server";
import { PLACES_ENABLED, autocomplete } from "@/lib/places";

// Location suggestions for the search box and the listing wizard. Public, like search itself.
export async function GET(request: NextRequest) {
  if (!PLACES_ENABLED) return NextResponse.json({ suggestions: [] }, { status: 404 });
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const session = sp.get("session") ?? "";
  if (q.length < 2 || q.length > 80 || !/^[\w-]{8,64}$/.test(session)) {
    return NextResponse.json({ suggestions: [] }, { status: 400 });
  }
  try {
    const suggestions = await autocomplete(q, session);
    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 502 });
  }
}
