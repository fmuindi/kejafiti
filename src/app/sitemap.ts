import type { MetadataRoute } from "next";
import { CATEGORIES } from "@/lib/listing/catalog";
import { SITE_URL } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";

// Rebuilt at most hourly. Listings come from the same public search a signed-out visitor
// runs, so nothing unpublished or private can appear here.
export const revalidate = 3600;

const PAGE = 60; // search_listings' own maximum page size
const MAX_LISTINGS = 5000; // well under the 50,000-URL sitemap limit

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: "hourly", priority: 0.9 },
    ...CATEGORIES.map((c) => ({ url: `${SITE_URL}/search?category=${c.value}`, changeFrequency: "daily" as const, priority: 0.7 })),
    { url: `${SITE_URL}/help`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/legal/terms`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE_URL}/legal/privacy`, changeFrequency: "yearly", priority: 0.1 },
  ];

  const supabase = createPublicClient();
  if (!supabase) return fixed;

  const homes: MetadataRoute.Sitemap = [];
  for (let offset = 0; offset < MAX_LISTINGS; offset += PAGE) {
    const { data, error } = await supabase.rpc("search_listings", {
      params: { sort: "newest", limit: PAGE, offset, include_unconfirmed: true },
    });
    if (error || !data?.length) break;
    for (const l of data) {
      homes.push({
        url: `${SITE_URL}/homes/${l.ref}`,
        lastModified: l.availability_confirmed_at ?? l.published_at ?? undefined,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
    if (data.length < PAGE) break;
  }
  return [...fixed, ...homes];
}
