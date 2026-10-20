import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "@/lib/env";

// Refreshes the auth session cookie on every request. Authorization is NOT decided here:
// pages, actions and the database check permissions themselves. The only redirect is
// signed-out -> sign-in, so the return destination is the page actually requested.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Validates the token and refreshes it when needed.
  const { data } = await supabase.auth.getClaims();

  // Signed-out visit to a page that needs an account: send them to sign-in with the exact
  // page (path and query) to come back to. Layouts can only see their own segment, so a
  // deep link like /w/<org>/rent/inbox used to come back to /w/<org> (IMP-06).
  const path = request.nextUrl.pathname;
  if (!data?.claims?.sub && request.method === "GET" && SIGNED_IN_ONLY.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

const SIGNED_IN_ONLY = ["/w", "/admin", "/account", "/messages", "/viewings", "/saved", "/updates"];
