import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { emailConfigured, processDeliveries } from "@/lib/delivery";
import { processSearchAlerts } from "@/lib/search-alerts";

// Scheduled jobs: saved-search alerts, then the delivery worker (so new alert emails go out in
// the same run). Call every few minutes from a scheduler (Vercel Cron, Supabase pg_cron +
// pg_net, or any cron) with: Authorization: Bearer <CRON_SECRET>
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    // Alerts need the service key, which the delivery worker also requires; without email
    // they still land in the app.
    const alerts = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ? await processSearchAlerts() : null;
    const result = await processDeliveries(50);
    return NextResponse.json({ ...result, alerts, email: emailConfigured() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
