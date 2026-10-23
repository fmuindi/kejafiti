import type { Metadata } from "next";
import Link from "next/link";
import { CompareNote } from "@/components/tenant/compare-note";
import { Icon } from "@/components/ui/icon";
import { ButtonLink } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { daysSince, formatDate } from "@/lib/dates";
import { layoutLabel } from "@/lib/listing/catalog";
import { chargeName, type ListingCharge } from "@/lib/listing/costs";
import { isOpenListing, type ClosedListing, type PublicListing } from "@/lib/listing/types";
import { formatAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/shell/back-link";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Compare saved homes", robots: { index: false } };

const UNKNOWN = "Unknown";
const yn = (v: string | undefined, yes: string, no: string) => (v === "yes" ? yes : v === "no" ? no : UNKNOWN);

function utility(charges: ListingCharge[], kind: "water" | "electricity") {
  const c = charges.find((x) => x.kind === kind);
  if (!c || c.billing === "unknown") return UNKNOWN;
  return c.billing === "included" ? "Included in rent" : c.billing === "metered" ? "Metered, paid separately" : c.amount === null ? `${chargeName(c)} not confirmed` : `KES ${formatAmount(c.amount)} fixed`;
}

// One row per question a tenant asks. Values come from the same listing totals the cards
// and the detail page use; anything not confirmed by the advertiser says Unknown.
const ROWS: Array<[string, (l: PublicListing) => string]> = [
  ["Rent", (l) => `KES ${formatAmount(l.rent_amount)} / ${l.price_period}`],
  ["Fixed monthly total", (l) => (l.fixed_monthly_total === null ? `Priced per ${l.price_period}: no monthly total` : `KES ${formatAmount(l.fixed_monthly_total)}${l.totals_complete ? "" : " (incomplete)"}`)],
  ["Deposit", (l) => (l.deposit_amount !== null ? `KES ${formatAmount(l.deposit_amount)}` : l.deposit_months !== null ? `${l.deposit_months} month${l.deposit_months === 1 ? "" : "s"}' rent` : UNKNOWN)],
  ["Move-in total", (l) => (l.move_in_total === null ? "Not shown" : `KES ${formatAmount(l.move_in_total)}${l.totals_complete ? "" : " (incomplete)"}`)],
  ["Layout", (l) => layoutLabel(l.unit)],
  ["Bathroom", (l) => yn(l.unit.facts?.private_bathroom, "Private", "Shared")],
  ["Water", (l) => utility(l.charges, "water")],
  ["Electricity", (l) => utility(l.charges, "electricity")],
  ["Floor and lift", (l) => (l.unit.floor_level === null ? UNKNOWN : l.unit.floor_level === 0 ? "Ground floor" : `Floor ${l.unit.floor_level} · ${yn(l.unit.facts?.lift, "lift", "stairs only")}`)],
  ["Location", (l) => [l.location.area, l.location.road].filter(Boolean).join(", ") + " (approximate)"],
  ["Available from", (l) => (l.available_from ? formatDate(l.available_from) : UNKNOWN)],
  ["Availability confirmed", (l) => (l.availability_confirmed_at ? `${daysSince(l.availability_confirmed_at)} days ago` : UNKNOWN)],
];

export default async function ComparePage({ searchParams }: PageProps<"/saved/compare">) {
  await requireUser("/saved");
  const raw = (await searchParams).ref;
  const asked = [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).filter((r) => /^L-\d+$/.test(r)))].slice(0, 3);
  const supabase = await createClient();
  // Only the person's own saved homes can be compared, with their own private notes.
  const { data: saved } = await supabase.rpc("my_saved_listings");
  const mine = new Map((saved ?? []).map((s) => [s.ref, s]));
  const refs = asked.filter((r) => mine.has(r));
  const listings = await Promise.all(refs.map(async (ref) => ({ ref, l: (await supabase.rpc("get_listing", { p_ref: ref })).data as unknown as PublicListing | ClosedListing | null })));
  const withoutRef = (ref: string) => `/saved/compare?${refs.filter((r) => r !== ref).map((r) => `ref=${r}`).join("&")}`;

  if (refs.length < 2) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-5 pb-10">
        <PageHeader icon="swap" title="Compare" />
        <p className="text-[15px] text-muted">Choose two or three of your saved homes to compare.</p>
        <ButtonLink href="/saved" variant="secondary" className="self-start">Back to saved homes</ButtonLink>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-4 pt-5 pb-10">
      <BackLink href="/saved">Saved homes</BackLink>
      <PageHeader icon="swap" title="Compare" />
      <p className="-mt-2 text-[14px] text-muted">&quot;Unknown&quot; means the advertiser hasn&apos;t confirmed it. Ask before you pay anything.</p>
      {/* Columns side by side from tablet width; stacked per home on phones. */}
      <div className="grid gap-4 md:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ ["--n" as string]: refs.length }}>
        {listings.map(({ ref, l }) => {
          const note = mine.get(ref)?.note ?? "";
          const open = l && isOpenListing(l) && l.status === "published";
          return (
            <section key={ref} aria-labelledby={`cmp-${ref}`} className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 id={`cmp-${ref}`} className="font-display text-[17px] leading-snug font-bold">
                  <Link href={`/homes/${ref}?back=saved`} className="hover:underline">{l?.title ?? `Home ${ref}`}</Link>
                </h2>
                <Link href={withoutRef(ref)} aria-label={`Remove ${l?.title ?? ref} from the comparison`} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-cool">
                  <Icon name="x" size={18} />
                </Link>
              </div>
              {open ? (
                <dl className="flex flex-col divide-y divide-divider text-[14px]">
                  {ROWS.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3 py-2">
                      <dt className="text-muted">{label}</dt>
                      <dd className={`text-right font-semibold ${value(l as PublicListing).startsWith(UNKNOWN) ? "text-waiting-strong" : ""}`}>{value(l as PublicListing)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="rounded-[12px] bg-error-tint p-3 text-[14px] font-semibold text-error">
                  No longer available{l && !isOpenListing(l) && l.let_on ? ` · let on ${formatDate(l.let_on)}` : ""}. It isn&apos;t compared as current stock.
                </p>
              )}
              <CompareNote refId={ref} initial={note} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
