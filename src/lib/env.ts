// Public configuration. Both the new publishable key and the legacy anon key are accepted.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3200").replace(/\/$/, "");
// Phone sign-in needs an SMS provider configured in Supabase Auth; off until one is.
export const PHONE_AUTH_ENABLED = process.env.NEXT_PUBLIC_PHONE_AUTH_ENABLED === "true";

export function assertSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
}
