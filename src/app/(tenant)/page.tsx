import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { RecentSearches } from "@/components/tenant/recent-searches";
import { WhereInput } from "@/components/tenant/where-input";
import { CATEGORIES, HOME_TYPES } from "@/lib/listing/catalog";
import { PLACES_ENABLED } from "@/lib/places";

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-4 pb-10 md:px-6 md:pt-14">
      <div className="md:grid md:grid-cols-[1.1fr_1fr] md:items-start md:gap-14">
        <section aria-labelledby="hero">
          <h1
            id="hero"
            className="font-display text-[34px] leading-[1.02] font-bold tracking-[-1.2px] md:text-[56px] md:tracking-[-2px]"
          >
            Find a home you can actually afford to move into.
          </h1>
          <p className="mt-3 text-[15px] text-muted md:text-[17px]">
            Every listing shows rent, charges and move-in total up front.
          </p>

          <form action="/search" className="mt-6 flex flex-col gap-3">
            <div className="rounded-[14px] border border-input bg-surface px-3.5 pt-2 pb-2.5 focus-within:ring-2 focus-within:ring-deep/40">
              <label htmlFor="q" className="block text-[12.5px] font-semibold text-muted">
                Where
              </label>
              <WhereInput placesEnabled={PLACES_ENABLED} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[14px] border border-input bg-surface px-3.5 pt-2 pb-2.5 focus-within:ring-2 focus-within:ring-deep/40">
                <label htmlFor="max" className="block text-[12.5px] font-semibold text-muted">
                  Max rent / month
                </label>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[15px] font-semibold" aria-hidden="true">
                    KES
                  </span>
                  <input
                    id="max"
                    name="max"
                    inputMode="numeric"
                    pattern="[0-9,]*"
                    placeholder="Any"
                    className="w-full min-w-0 bg-transparent text-[17px] font-semibold text-ink placeholder:font-normal focus:outline-none"
                  />
                </div>
              </div>
              <div className="rounded-[14px] border border-input bg-surface px-3.5 pt-2 pb-1.5 focus-within:ring-2 focus-within:ring-deep/40">
                <label htmlFor="type" className="block text-[12.5px] font-semibold text-muted">
                  Layout
                </label>
                <select
                  id="type"
                  name="type"
                  defaultValue=""
                  className="w-full appearance-none bg-transparent text-[17px] font-semibold text-ink focus:outline-none"
                >
                  <option value="">Any layout</option>
                  {HOME_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[14px] bg-primary text-[16px] font-semibold text-white hover:bg-primary-hover"
            >
              <Icon name="search" />
              Find a home
            </button>
          </form>
        </section>

        <div className="mt-8 flex flex-col gap-8 md:mt-2">
          <section aria-labelledby="browse">
            <h2 id="browse" className="font-display text-[18px] font-bold">
              Browse by home type
            </h2>
            <ul className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
              {CATEGORIES.map((c) => (
                <li key={c.value} className="shrink-0">
                  <Link
                    href={`/search?category=${c.value}`}
                    className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-line bg-surface px-4 text-[14.5px] font-semibold hover:border-ink"
                  >
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <RecentSearches />
          <section className="rounded-[18px] border border-line bg-surface p-4">
            <p className="font-semibold">Landlord, agent or property manager?</p>
            <p className="mt-1 text-[14px] text-muted">
              List a vacancy for free and keep simple rent records your team confirms. Tenants keep paying the way they
              already do.
            </p>
            <Link href="/start" className="mt-3 inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-hover">
              Get started <Icon name="arrowRight" size={16} />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
