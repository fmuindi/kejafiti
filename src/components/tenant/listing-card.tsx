import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/components/ui/primitives";
import { ADVERTISER_ROLE_LABEL, PRICE_BASIS_LABEL, layoutLabel } from "@/lib/listing/catalog";
import { cardPrice, type ListingCharge } from "@/lib/listing/costs";
import { listingHref } from "@/lib/listing/search";
import { daysSince, formatDate } from "@/lib/dates";
import { SaveButton } from "./save-button";

export type SearchRow = {
  ref: string;
  title: string | null;
  area: string;
  town: string | null;
  road: string | null;
  layout: string;
  bedrooms: number | null;
  rental_scope: string;
  price_period: string;
  price_basis: string;
  rent_amount: number;
  charges: ListingCharge[];
  facts: Record<string, string>;
  floor_level: number | null;
  furnishing: string | null;
  available_from: string | null;
  availability_confirmed_at: string | null;
  advertiser_role: string;
  sponsored: boolean;
  cover_path: string | null;
  photo_count: number;
  unconfirmed_match: boolean;
  fixed_monthly_total: number | null;
  move_in_total: number | null;
  totals_complete: boolean;
  /** Set on a place search: km from the picked place to the home's approximate position. */
  distance_km: number | null;
};

const CARD_FACTS: Array<[string, string]> = [
  ["private_bathroom", "Private bathroom"],
  ["own_meter", "Own meter"],
  ["balcony", "Balcony"],
  ["parking", "Parking"],
  ["lift", "Lift"],
  ["cctv", "CCTV"],
  ["borehole", "Borehole"],
];

function factChips(row: SearchRow): Array<{ label: string; unknown?: boolean }> {
  const chips: Array<{ label: string; unknown?: boolean }> = [];
  if (row.furnishing === "fully" || row.furnishing === "partly") chips.push({ label: "Furnished" });
  for (const [key, label] of CARD_FACTS) {
    const v = row.facts?.[key];
    if (v === "yes") chips.push({ label });
    if (v === "unknown" && key === "parking") chips.push({ label: "Parking unknown", unknown: true });
  }
  if (row.floor_level === 0) chips.unshift({ label: "Ground floor" });
  else if (row.floor_level && row.floor_level > 0) {
    chips.push({ label: `Floor ${row.floor_level}${row.facts?.lift === "yes" ? ", lift" : ", stairs"}` });
  }
  // Shown first so it is never the chip hidden for lack of room.
  if (row.unconfirmed_match) chips.unshift({ label: "Must-have not answered yet", unknown: true });
  return chips.slice(0, 4);
}

/**
 * Always exactly three lines under the headline (empty ones keep their space): the price
 * breakdown, the move-in total, then the "total incomplete" warning or any remaining notes.
 */
function priceRows(price: ReturnType<typeof cardPrice>): Array<{ text: string; warning?: boolean }> {
  const [first = "", second = "", ...rest] = price.lines;
  const third = price.warning ? { text: price.warning, warning: true } : { text: rest.join(" · ") };
  return [{ text: first }, { text: second }, third];
}

// Positions are approximate (about 1 km), so whole kilometres past 3 km.
function formatDistance(km: number) {
  return km < 3 ? km.toFixed(1) : String(Math.round(km));
}

export function ListingCard({
  row,
  photoUrl,
  saved,
  signedIn,
  returnTo,
  back,
  eager = false,
}: {
  row: SearchRow;
  photoUrl?: string;
  saved: boolean;
  signedIn: boolean;
  returnTo: string;
  /** Where the listing's back link returns: a search query string, or "saved". */
  back?: string;
  /** The first card is usually in view on load: fetch its photo straight away. */
  eager?: boolean;
}) {
  const age = daysSince(row.availability_confirmed_at);
  const stale = age !== null && age > 10;
  const basis = PRICE_BASIS_LABEL[row.price_basis];
  const title = row.title ?? `${layoutLabel(row)} · ${row.area}`;
  const chips = factChips(row);
  const price = cardPrice(row);
  return (
    <article id={`home-${row.ref}`} className="relative flex h-full w-full min-w-0 scroll-mt-28 flex-col overflow-hidden rounded-panel border border-line bg-surface">
      {/* overflow-hidden keeps the 16:10 box: without it a portrait photo stretches the card. */}
      <div className="relative aspect-[16/10] overflow-hidden bg-cool">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-muted">
            <Icon name="image" size={28} />
          </div>
        )}
        {row.sponsored ? (
          <span className="absolute top-3 left-3 rounded-chip bg-surface px-2 py-1 text-micro font-semibold">Sponsored</span>
        ) : null}
        <span className="absolute bottom-3 left-3 rounded-chip bg-ink/85 px-2 py-1 text-micro font-semibold text-white">
          {row.photo_count} photo{row.photo_count === 1 ? "" : "s"}
        </span>
        <div className="absolute top-3 right-3">
          <SaveButton refId={row.ref} saved={saved} signedIn={signedIn} returnTo={returnTo} />
        </div>
      </div>
      {/* Every slot below has a fixed height, so all cards in a grid line up whatever their content.
          Long lines are cut with an ellipsis (full text on hover); the listing page has everything. */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <p className="truncate" title={`${price.headline} ${price.headlineUnit}${basis ? ` ${basis}` : ""}`}>
            <span className="font-display text-title font-extrabold tracking-[-0.4px]">{price.headline}</span>
            <span className="text-label text-muted">
              {" "}
              {price.headlineUnit}
              {basis ? ` ${basis}` : ""}
            </span>
          </p>
          {priceRows(price).map((l, i) =>
            l.text ? (
              <p key={i} title={l.text} className={cx("truncate text-caption", l.warning ? "font-semibold text-waiting-strong" : "text-muted")}>
                {l.text}
              </p>
            ) : (
              <p key={i} aria-hidden="true" className="text-caption">
                {"\u00a0"}
              </p>
            ),
          )}
        </div>
        <h3 className="line-clamp-2 min-h-[2.75em] text-body leading-snug font-semibold">
          <Link href={listingHref(row.ref, back)} className="after:absolute after:inset-0 hover:underline">
            {title}
          </Link>
          <span className="font-normal text-muted">
            {" "}
            · {[row.area, row.road].filter(Boolean).join(", ")}
            {row.distance_km != null ? ` · about ${row.distance_km < 1 ? "1" : formatDistance(row.distance_km)} km away` : ""}
          </span>
        </h3>
        {/* One row of chips: any that would wrap onto a second row are hidden whole, not cut. */}
        <ul className="flex h-7 flex-wrap gap-x-1.5 gap-y-2 overflow-hidden">
          {chips.map((c) => (
            <li
              key={c.label}
              className={cx(
                "rounded-chip px-2 py-1 text-caption leading-5 whitespace-nowrap",
                c.unknown ? "bg-waiting-tint text-waiting-strong" : "bg-cool text-ink",
              )}
            >
              {c.label}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-end justify-between gap-3 pt-2 text-caption">
          <span className={cx("inline-flex min-w-0 items-center gap-1 font-semibold", stale ? "text-waiting" : "text-success")}>
            <Icon name={stale ? "clock" : "check"} size={16} strokeWidth={2.2} className="shrink-0" />
            <span className="truncate">
              {row.availability_confirmed_at
                ? `${stale ? "Last confirmed" : "Available, confirmed"} ${formatDate(row.availability_confirmed_at, { year: false })}`
                : "Availability not confirmed"}
            </span>
          </span>
          <span className="shrink-0 text-right text-muted">{ADVERTISER_ROLE_LABEL[row.advertiser_role] ?? "Advertiser"}</span>
        </div>
      </div>
    </article>
  );
}

