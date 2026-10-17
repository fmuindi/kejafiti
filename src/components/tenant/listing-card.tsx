import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/components/ui/primitives";
import { ADVERTISER_ROLE_LABEL, PERIOD_LABEL, PRICE_BASIS_LABEL, layoutLabel } from "@/lib/listing/catalog";
import { chargeSummaryLine, type ListingCharge } from "@/lib/listing/costs";
import { formatAmount } from "@/lib/money";
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

export function ListingCard({
  row,
  photoUrl,
  saved,
  signedIn,
  returnTo,
}: {
  row: SearchRow;
  photoUrl?: string;
  saved: boolean;
  signedIn: boolean;
  returnTo: string;
}) {
  const age = daysSince(row.availability_confirmed_at);
  const stale = age !== null && age > 10;
  const basis = PRICE_BASIS_LABEL[row.price_basis];
  const title = row.title ?? `${layoutLabel(row)} · ${row.area}`;
  const chips = factChips(row);
  return (
    <article className="relative flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface">
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
          <span className="absolute top-3 left-3 rounded-[8px] bg-surface px-2 py-1 text-[12px] font-semibold">Sponsored</span>
        ) : null}
        <span className="absolute bottom-3 left-3 rounded-[8px] bg-ink/85 px-2 py-1 text-[12px] font-semibold text-white">
          {row.photo_count} photo{row.photo_count === 1 ? "" : "s"}
        </span>
        <div className="absolute top-3 right-3">
          <SaveButton refId={row.ref} saved={saved} signedIn={signedIn} returnTo={returnTo} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p>
          <span className="font-display text-[24px] font-extrabold tracking-[-0.4px]">KES {formatAmount(row.rent_amount)}</span>
          <span className="text-[14px] text-muted">
            {" "}
            / {PERIOD_LABEL[row.price_period] ?? row.price_period}
            {basis ? ` ${basis}` : ""}
          </span>
        </p>
        <p className="-mt-1 text-[13px] text-muted">{chargeSummaryLine(row.charges) || "No other monthly charges listed"}</p>
        <h3 className="text-[15.5px] leading-snug font-semibold">
          <Link href={`/homes/${row.ref}`} className="after:absolute after:inset-0 hover:underline">
            {title}
          </Link>
          <span className="font-normal text-muted"> · {[row.area, row.road].filter(Boolean).join(", ")}</span>
        </h3>
        {chips.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <li
                key={c.label}
                className={cx(
                  "rounded-[8px] px-2 py-1 text-[12.5px]",
                  c.unknown ? "bg-waiting-tint text-waiting-strong" : "bg-cool text-ink",
                )}
              >
                {c.label}
              </li>
            ))}
          </ul>
        ) : null}
        {row.unconfirmed_match ? (
          <p className="text-[12.5px] font-semibold text-waiting">A must-have isn&apos;t answered yet</p>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-3 pt-2 text-[13px]">
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

