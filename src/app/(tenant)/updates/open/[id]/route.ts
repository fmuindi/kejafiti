import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, getWorkspaces } from "@/lib/auth";
import { safeInternalLink } from "@/lib/updates";
import { createClient } from "@/lib/supabase/server";

// Opening an update marks it read and goes to its item. Access is checked now, at click
// time: a workspace link is followed only while the person is still an active member, and
// the item's own page applies its usual permission checks. Linked with a plain <a>, so a
// prefetch can never mark anything read.
export async function GET(request: NextRequest, ctx: RouteContext<"/updates/open/[id]">) {
  const { id } = await ctx.params;
  const back = (reason: string) => NextResponse.redirect(new URL(`/updates?gone=${reason}`, request.url), { status: 303 });
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent("/updates")}`, request.url), { status: 303 });
  const supabase = await createClient();
  const { data: n } = await supabase.from("notifications").select("id, org_id, link, read_at").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!n) return back("missing");
  if (!n.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
  const link = safeInternalLink(n.link);
  if (!link) return NextResponse.redirect(new URL("/updates", request.url), { status: 303 });
  const workspaces = await getWorkspaces();
  const linkOrg = link.match(/^\/w\/([0-9a-f-]{36})/)?.[1];
  if ((n.org_id && !workspaces.some((w) => w.org_id === n.org_id)) || (linkOrg && !workspaces.some((w) => w.org_id === linkOrg))) return back("access");
  return NextResponse.redirect(new URL(link, request.url), { status: 303 });
}
