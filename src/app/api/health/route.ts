import { connection } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

// Liveness and readiness for uptime monitors and load balancers: 200 when the app can reach
// the database, 503 otherwise. Public and cheap; it says nothing about data or configuration.
const TIMEOUT_MS = 3000;

export async function GET() {
  await connection();
  const started = Date.now();
  const supabase = createPublicClient();
  let database: "ok" | "unreachable" | "not_configured" = "not_configured";
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc("health_check").abortSignal(AbortSignal.timeout(TIMEOUT_MS));
      database = !error && data === true ? "ok" : "unreachable";
    } catch {
      database = "unreachable";
    }
  }
  const ok = database === "ok";
  return Response.json(
    { status: ok ? "ok" : "degraded", database, latencyMs: Date.now() - started },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
