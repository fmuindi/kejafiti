import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Private evidence is never linked directly. Each request is re-authorised: the attachment
// row is only visible with "view attachments" on its property (or to its uploader), and
// the storage policy checks the same rule again before signing a 60-second URL.
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/files/[attachmentId]">) {
  const { attachmentId } = await ctx.params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new NextResponse("Sign in to view this file.", { status: 401 });

  const { data: att } = await supabase
    .from("attachments")
    .select("storage_path, file_name, removed_at")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!att || att.removed_at) return new NextResponse("File not found.", { status: 404 });

  const { data, error } = await supabase.storage.from("private-docs").createSignedUrl(att.storage_path, 60);
  if (error || !data?.signedUrl) return new NextResponse("File not found.", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
