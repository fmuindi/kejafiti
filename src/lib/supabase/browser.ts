"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

// Used for direct-to-storage uploads and sign-in. Same user token and the same RLS rules.
export function getBrowserClient() {
  if (!client) client = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
  return client;
}
