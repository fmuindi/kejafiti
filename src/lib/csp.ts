// Content Security Policy. Scripts need this request's nonce ('strict-dynamic' then trusts
// whatever those scripts load), so an injected <script> can't run. Styles allow inline
// because React and Leaflet set style attributes; that is low risk once scripts are locked.
// Every outside origin the browser talks to is listed here and nowhere else.
export function buildCsp({ nonce, dev, supabaseUrl }: { nonce: string; dev: boolean; supabaseUrl: string }) {
  const supabase = supabaseUrl ? new URL(supabaseUrl) : null;
  const supabaseHttp = supabase ? supabase.origin : "";
  const supabaseWs = supabase ? `${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}` : "";

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Listing photos and receipts are signed Supabase Storage URLs; the live map uses OSM tiles.
    "img-src": ["'self'", "data:", "blob:", supabaseHttp, "https://tile.openstreetmap.org"],
    "font-src": ["'self'", "data:"],
    // Uploads, auth and realtime messaging go straight to Supabase; dev adds the reload socket.
    "connect-src": ["'self'", supabaseHttp, supabaseWs, ...(dev ? ["ws:"] : [])],
    "media-src": ["'self'", "blob:"],
    // The optional "approximate area" map is a Google Maps Embed iframe.
    "frame-src": ["https://www.google.com"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.filter(Boolean).join(" ")}`);
  // Skipped for a plain-http Supabase (the local stack under `next start`), which it would break.
  if (!dev && supabase?.protocol !== "http:") parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function createNonce() {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
