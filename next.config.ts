import type { NextConfig } from "next";
import { supabaseProxyRewrites } from "./src/lib/dev-proxy";

// HTTPS only, for a year. Browsers ignore this header on plain-http responses (local `next start`),
// so it is safe to send from every production build. includeSubDomains/preload are left for the
// operator to add once every subdomain of the live domain is known to serve HTTPS.
const HSTS = { key: "Strict-Transport-Security", value: "max-age=31536000" };

const securityHeaders = [
  ...(process.env.NODE_ENV === "production" ? [HSTS] : []),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera: receipt and listing photos. Microphone: voice search (only after the person taps it).
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(self)" },
];

const nextConfig: NextConfig = {
  // Nearly every screen is per-user and dynamic, so the request-time model is simpler and
  // safer here than Cache Components. Public pages can opt into caching later.
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Tunnels (ngrok) may load dev assets; see allowedDevOrigins in the Next docs.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.dev"],
  // When sharing a local build through one tunnel, the browser can't reach 127.0.0.1:54321,
  // so /supabase/* is forwarded to the local Supabase. Only on when SUPABASE_PROXY_TARGET is set.
  // Only loopback targets are honoured (src/lib/dev-proxy.ts).
  async rewrites() {
    return supabaseProxyRewrites(process.env.SUPABASE_PROXY_TARGET);
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
