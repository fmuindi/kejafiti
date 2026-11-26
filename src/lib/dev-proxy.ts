// Optional /supabase/* forwarding for sharing a local build through one tunnel (ngrok), where the
// browser can't reach the local Supabase at 127.0.0.1:54321. Only a loopback target is honoured:
// a misconfigured SUPABASE_PROXY_TARGET in production must never turn the app into a proxy to
// another host. Imported by next.config.ts, so it stays dependency-free.

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function supabaseProxyRewrites(target: string | undefined): Array<{ source: string; destination: string }> {
  if (!target) return [];
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    console.warn("SUPABASE_PROXY_TARGET is not a valid URL; /supabase forwarding is off.");
    return [];
  }
  if (!LOOPBACK.has(url.hostname) || (url.protocol !== "http:" && url.protocol !== "https:")) {
    console.warn("SUPABASE_PROXY_TARGET must point at a local Supabase (localhost or 127.0.0.1); /supabase forwarding is off.");
    return [];
  }
  return [{ source: "/supabase/:path*", destination: `${url.origin}/:path*` }];
}
