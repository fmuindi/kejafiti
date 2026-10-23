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
  return chips.slice(0, 4);
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
}: {
  row: SearchRow;
  photoUrl?: string;
  saved: boolean;
  signedIn: boolean;
  returnTo: string;
  /** Where the listing's back link returns: a search query string, or "saved". */
  back?: string;
}) {
  const age = daysSince(row.availability_confirmed_at);
  const stale = age !== null && age > 10;
  const basis = PRICE_BASIS_LABEL[row.price_basis];
  const title = row.title ?? `${layoutLabel(row)} · ${row.area}`;
  const chips = factChips(row);
  const price = cardPrice(row);
  return (
    <article id={`home-${row.ref}`} className="relative flex scroll-mt-28 flex-col overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="relative aspect-[16/10] bg-cool">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-muted">
            <Icon name="image" size={28} />
          </div>
        )}
        {row.sponsored ? (
          <span className="absolute top-3 left-3 rounded-[8px] bg-surface px-2 py-1 text-[0.75rem] font-semibold">Sponsored</span>
        ) : null}
        <span className="absolute bottom-3 left-3 rounded-[8px] bg-ink/85 px-2 py-1 text-[0.75rem] font-semibold text-white">
          {row.photo_count} photo{row.photo_count === 1 ? "" : "s"}
        </span>
        <div className="absolute top-3 right-3">
          <SaveButton refId={row.ref} saved={saved} signedIn={signedIn} returnTo={returnTo} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <p>
            <span className="font-display text-[1.5rem] font-extrabold tracking-[-0.4px]">{price.headline}</span>
            <span className="text-[0.875rem] text-muted">
              {" "}
              {price.headlineUnit}
              {basis ? ` ${basis}` : ""}
            </span>
          </p>
          {price.lines.map((l) => <p key={l} className="text-[0.8125rem] text-muted">{l}</p>)}
          {price.warning ? <p className="text-[0.8125rem] font-semibold text-waiting-strong">{price.warning}</p> : null}
        </div>
        <h3 className="text-[0.96875rem] leading-snug font-semibold">
          <Link href={listingHref(row.ref, back)} className="after:absolute after:inset-0 hover:underline">
            {title}
          </Link>
          <span className="font-normal text-muted">
            {" "}
            · {[row.area, row.road].filter(Boolean).join(", ")}
            {row.distance_km != null ? ` · about ${row.distance_km < 1 ? "1" : formatDistance(row.distance_km)} km away` : ""}
          </span>
        </h3>
        {chips.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <li
                key={c.label}
                className={cx(
                  "rounded-[8px] px-2 py-1 text-[0.78125rem]",
                  c.unknown ? "bg-waiting-tint text-waiting-strong" : "bg-cool text-ink",
                )}
              >
                {c.label}
              </li>
            ))}
          </ul>
        ) : null}
        {row.unconfirmed_match ? (
          <p className="text-[0.78125rem] font-semibold text-waiting">A must-have isn&apos;t answered yet</p>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-3 pt-2 text-[0.8125rem]">
          <span className={cx("inline-flex items-center gap-1 font-semibold", stale ? "text-waiting" : "text-success")}>
            <Icon name={stale ? "clock" : "check"} size={15} strokeWidth={2.2} />
            {row.availability_confirmed_at
              ? `${stale ? "Last confirmed" : "Available, confirmed"} ${formatDate(row.availability_confirmed_at, { year: false })}`
              : "Availability not confirmed"}
          </span>
          <span className="text-right text-muted">{ADVERTISER_ROLE_LABEL[row.advertiser_role] ?? "Advertiser"}</span>
        </div>
      </div>
    </article>
  );
}

