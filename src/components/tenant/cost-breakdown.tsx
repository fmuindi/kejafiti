import { computeCosts, type ListingCharge } from "@/lib/listing/costs";
import { PERIOD_LABEL, PRICE_BASIS_LABEL } from "@/lib/listing/catalog";
import { formatAmount } from "@/lib/money";

// "What you'll pay": rent, compulsory fixed charges, a fixed monthly total, deposit and a
// move-in total, each counted once. Variable bills are listed separately. An unknown
// compulsory charge marks the total as incomplete instead of claiming it is all-inclusive.

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${strong ? "font-semibold" : ""}`}>
      <dt className="text-body">{label}</dt>
      <dd className="tabular-nums text-body">{value}</dd>
    </div>
  );
}

export function CostBreakdown({
  rent,
  depositAmount,
  depositMonths,
  charges,
  pricePeriod,
  priceBasis,
}: {
  rent: number;
  depositAmount: number | null;
  depositMonths: number | null;
  charges: ListingCharge[];
  pricePeriod: string;
  priceBasis: string;
}) {
  const c = computeCosts({ rent, depositAmount, depositMonths, charges, pricePeriod });
  const period = PERIOD_LABEL[pricePeriod] ?? pricePeriod;
  const basis = PRICE_BASIS_LABEL[priceBasis];
  // Rent per week, night or semester is never added to monthly charges (IMP-11).
  const monthlyPrice = pricePeriod === "month";
  const monthlyCharges = c.monthlyLines.reduce((s, l) => s + (l.amount ?? 0), 0);

  return (
    <section aria-labelledby="costs" className="surface overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-baseline justify-between">
          <h2 id="costs" className="heading-section">
            What you&apos;ll pay
          </h2>
          <span className="text-caption text-muted">KES{basis ? ` · ${basis}` : ""}</span>
        </div>
        <dl className="mt-1 divide-y divide-divider">
          <Row label={`${period === "month" ? "Monthly" : `Per ${period}`} rent`} value={formatAmount(rent)} />
          {c.monthlyLines.map((l) => (
            <Row key={l.label} label={l.label} value={l.amount === null ? "Not confirmed" : formatAmount(l.amount)} />
          ))}
          {monthlyPrice ? (
            <Row label="Fixed monthly total" value={formatAmount(c.fixedMonthly)} strong />
          ) : c.monthlyLines.length ? (
            <Row label="Fixed monthly charges" value={formatAmount(monthlyCharges)} strong />
          ) : null}
        </dl>
      </div>
      <div className="bg-ink px-4 py-3 text-white">
        <dl className="divide-y divide-white/15">
          <div className="flex items-baseline justify-between gap-4 py-1.5">
            <dt className="text-body">
              Deposit
              {depositMonths ? ` (${depositMonths} month${depositMonths === 1 ? "" : "s"}' rent)` : ""}
            </dt>
            <dd className="tabular-nums text-body">{formatAmount(c.deposit)}</dd>
          </div>
          {monthlyPrice ? (
            <div className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="text-body">First month{c.monthlyLines.length ? " (rent + charges)" : ""}</dt>
              <dd className="tabular-nums text-body">{formatAmount(c.fixedMonthly)}</dd>
            </div>
          ) : null}
          {c.oneOffLines.map((l) => (
            <div key={l.label} className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="text-body">{l.label}</dt>
              <dd className="tabular-nums text-body">{l.amount === null ? "Not confirmed" : formatAmount(l.amount)}</dd>
            </div>
          ))}
          {monthlyPrice ? (
            <div className="flex items-baseline justify-between gap-4 pt-2.5">
              <dt className="font-semibold">Move-in total</dt>
              <dd className="font-display text-title-lg font-extrabold">{formatAmount(c.moveIn)}</dd>
            </div>
          ) : (
            <p className="pt-2.5 text-label">
              No move-in total: rent is charged per {period} and charges are monthly, and we don&apos;t convert between them. Confirm your first payment with the advertiser.
            </p>
          )}
        </dl>
        {!c.complete ? (
          <p className="mt-1 text-caption font-semibold text-waiting-on-dark">
            Total incomplete: {c.unconfirmed.length ? `${c.unconfirmed.join(", ")} not confirmed` : "a charge is not confirmed"}.
          </p>
        ) : null}
      </div>
      {c.billedSeparately.length || c.included.length || c.unconfirmed.length ? (
        <div className="space-y-1 px-4 py-3 text-label">
          {c.billedSeparately.length ? (
            <p>
              <span className="font-semibold">Billed separately:</span> {c.billedSeparately.join(", ")}
            </p>
          ) : null}
          {c.included.length ? (
            <p>
              <span className="font-semibold">Included in rent:</span> {c.included.join(", ")}
            </p>
          ) : null}
          {charges.some((x) => x.billing === "unknown") ? (
            <p className="text-waiting-strong">
              <span className="font-semibold">Not confirmed yet:</span>{" "}
              {charges.filter((x) => x.billing === "unknown").map((x) => x.label || x.kind.replace("_", " ")).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
