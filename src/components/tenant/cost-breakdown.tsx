import { computeCosts, type ListingCharge } from "@/lib/listing/costs";
import { PERIOD_LABEL, PRICE_BASIS_LABEL } from "@/lib/listing/catalog";
import { formatAmount } from "@/lib/money";

// "What you'll pay": rent, compulsory fixed charges, a fixed monthly total, deposit and a
// move-in total, each counted once. Variable bills are listed separately. An unknown
// compulsory charge marks the total as incomplete instead of claiming it is all-inclusive.

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${strong ? "font-semibold" : ""}`}>
      <dt className="text-[15px]">{label}</dt>
      <dd className="font-mono text-[15px]">{value}</dd>
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
  const c = computeCosts({ rent, depositAmount, depositMonths, charges });
  const period = PERIOD_LABEL[pricePeriod] ?? pricePeriod;
  const basis = PRICE_BASIS_LABEL[priceBasis];
  const periodWord = period === "month" ? "monthly" : `per ${period}`;

  return (
    <section aria-labelledby="costs" className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-baseline justify-between">
          <h2 id="costs" className="font-display text-[18px] font-bold">
            What you&apos;ll pay
          </h2>
          <span className="text-[12.5px] text-muted">KES{basis ? ` · ${basis}` : ""}</span>
        </div>
        <dl className="mt-1 divide-y divide-divider">
          <Row label={`${period === "month" ? "Monthly" : `Per ${period}`} rent`} value={formatAmount(rent)} />
          {c.monthlyLines.map((l) => (
            <Row key={l.label} label={l.label} value={l.amount === null ? "Not confirmed" : formatAmount(l.amount)} />
          ))}
          <Row label={`Fixed ${periodWord} total`} value={formatAmount(c.fixedMonthly)} strong />
        </dl>
      </div>
      <div className="bg-ink px-4 py-3 text-white">
        <dl className="divide-y divide-white/15">
          <div className="flex items-baseline justify-between gap-4 py-1.5">
            <dt className="text-[14.5px]">
              Deposit
              {depositMonths ? ` (${depositMonths} month${depositMonths === 1 ? "" : "s"}' rent)` : ""}
            </dt>
            <dd className="font-mono text-[14.5px]">{formatAmount(c.deposit)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-1.5">
            <dt className="text-[14.5px]">First {period}{c.monthlyLines.length ? " (rent + charges)" : ""}</dt>
            <dd className="font-mono text-[14.5px]">{formatAmount(c.fixedMonthly)}</dd>
          </div>
          {c.oneOffLines.map((l) => (
            <div key={l.label} className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="text-[14.5px]">{l.label}</dt>
              <dd className="font-mono text-[14.5px]">{l.amount === null ? "Not confirmed" : formatAmount(l.amount)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 pt-2.5">
            <dt className="font-semibold">Move-in total</dt>
            <dd className="font-display text-[26px] font-extrabold">{formatAmount(c.moveIn)}</dd>
          </div>
        </dl>
        {!c.complete ? (
          <p className="mt-1 text-[13px] font-semibold text-[#ffd59a]">
            Total incomplete: {c.unconfirmed.length ? `${c.unconfirmed.join(", ")} not confirmed` : "a charge is not confirmed"}.
          </p>
        ) : null}
      </div>
      {c.billedSeparately.length || c.included.length || c.unconfirmed.length ? (
        <div className="space-y-1 px-4 py-3 text-[14px]">
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
