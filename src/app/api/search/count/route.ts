import { NextResponse, type NextRequest } from "next/server";
import { parseSearch, toRpcParams } from "@/lib/listing/search";
import { createClient } from "@/lib/supabase/server";

// Live result count for the filters sheet. Public, read-only, published listings only.
export async function GET(request: NextRequest) {
  const raw: Record<string, string[]> = {};
  request.nextUrl.searchParams.forEach((v, k) => {
    (raw[k] ??= []).push(v);
  });
  const p = parseSearch(raw);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_listings", { params: toRpcParams(p, { limit: 1, offset: 0 }) });
  if (error) return NextResponse.json({ count: null }, { status: 503 });
  const count = ((data ?? []) as Array<{ total_count: number }>)[0]?.total_count ?? 0;
  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
