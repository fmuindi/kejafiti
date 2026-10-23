import type { NextRequest } from "next/server";
import { buildCsp, createNonce } from "@/lib/csp";
import { SUPABASE_URL } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // A fresh nonce per request. Next.js reads it back out of the request's CSP header and
  // stamps it on its own scripts while rendering.
  const csp = buildCsp({ nonce: createNonce(), dev: process.env.NODE_ENV === "development", supabaseUrl: SUPABASE_URL });
  const response = await updateSession(request, { "Content-Security-Policy": csp });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|icons/|opengraph-image|manifest.webmanifest|robots.txt|sitemap.xml|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
