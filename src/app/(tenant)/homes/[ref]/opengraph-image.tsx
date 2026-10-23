import { ImageResponse } from "next/og";
import { BRAND, BrandMark } from "@/lib/brand-mark";
import { layoutLabel } from "@/lib/listing/catalog";
import { isOpenListing, type ClosedListing, type PublicListing } from "@/lib/listing/types";
import { formatAmount } from "@/lib/money";
import { LISTING_BUCKET } from "@/lib/storage";
import { createPublicClient } from "@/lib/supabase/public";

// The preview card WhatsApp, Facebook and X show when a listing link is shared: cover photo,
// rent and move-in total. Built from the signed-out view, so it only ever shows what the
// public page shows; a home that is no longer available gets the plain brand card.
export const alt = "Rental listing on nyumbani";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

async function coverDataUrl(supabase: NonNullable<ReturnType<typeof createPublicClient>>, path: string) {
  const { data } = await supabase.storage.from(LISTING_BUCKET).createSignedUrl(path, 60);
  if (!data?.signedUrl) return null;
  try {
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!/^image\/(jpeg|png)$/.test(type)) return null; // the renderer reads JPEG and PNG
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function ListingImage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const supabase = createPublicClient();
  const { data } = supabase ? await supabase.rpc("get_listing", { p_ref: ref }) : { data: null };
  const listing = data as unknown as PublicListing | ClosedListing | null;

  if (!supabase || !listing || !isOpenListing(listing)) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 24, background: BRAND.cream, color: BRAND.ink }}>
          <BrandMark size={120} padding={0.1} />
          <span style={{ fontSize: 72, fontWeight: 700 }}>nyumbani</span>
        </div>
      ),
      size,
    );
  }

  const cover = listing.photos[0] ? await coverDataUrl(supabase, listing.photos[0].path) : null;
  const what = listing.title ?? layoutLabel(listing.unit);
  const where = [...new Set([listing.location.area, listing.location.town].filter(Boolean))].join(", ");
  const period = listing.price_period === "month" ? "/ month" : `/ ${listing.price_period}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BRAND.cream, color: BRAND.ink }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og, not a page
          <img src={cover} alt="" width={630} height={630} style={{ width: 630, height: 630, objectFit: "cover" }} />
        ) : (
          <div style={{ width: 630, height: 630, display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F8F9" }}>
            <BrandMark size={200} padding={0.1} />
          </div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>{what.length > 60 ? `${what.slice(0, 57)}…` : what}</span>
            <span style={{ fontSize: 28, color: "#67737C" }}>{where}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 54, fontWeight: 800, color: BRAND.primary }}>KES {formatAmount(listing.rent_amount)}<span style={{ fontSize: 28, fontWeight: 500, color: BRAND.ink, marginLeft: 10, alignSelf: "flex-end", marginBottom: 8 }}>{period}</span></span>
            {listing.move_in_total != null && (
              <span style={{ fontSize: 26 }}>Move-in total KES {formatAmount(listing.move_in_total)}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BrandMark size={44} padding={0.08} />
            <span style={{ fontSize: 28, fontWeight: 700 }}>nyumbani</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
