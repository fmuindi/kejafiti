import "server-only";
import type { ServerClient } from "@/lib/supabase/server";

export const LISTING_BUCKET = "listing-media";
export const PRIVATE_BUCKET = "private-docs";

// Listing photos live in a private bucket. Storage policies only release an object when
// its listing is published (or to the listing's own staff), so these signed URLs are
// issued with the caller's own permissions.
export async function signListingPhotos(supabase: ServerClient, paths: Array<string | null | undefined>) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data } = await supabase.storage.from(LISTING_BUCKET).createSignedUrls(unique, 60 * 60);
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) out.set(item.path, item.signedUrl);
  }
  return out;
}
