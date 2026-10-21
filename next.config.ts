import type { NextConfig } from "next";

const securityHeaders = [
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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
