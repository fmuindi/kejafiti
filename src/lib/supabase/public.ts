import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "@/lib/env";

// An anonymous client with no session: sees exactly what a signed-out visitor sees. Used by
// the sitemap and share images, which must never reflect whoever happens to request them.
export function createPublicClient() {
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) return null;
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
