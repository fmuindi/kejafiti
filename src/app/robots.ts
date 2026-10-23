import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";

// Only the public marketplace is indexable. Everything behind sign-in, plus the API and
// one-off links (invitations, auth), is kept out.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/", "/w/", "/admin", "/account", "/messages", "/viewings", "/saved", "/updates",
        "/my-rent", "/auth/", "/invite/", "/tenant-invite/", "/sign-in", "/start", "/help/tickets/", "/homes/*/message", "/homes/*/viewing",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
