import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { RecentSearches } from "@/components/tenant/recent-searches";
import { WhereInput } from "@/components/tenant/where-input";
import { CATEGORIES, HOME_TYPES } from "@/lib/listing/catalog";
import { PLACES_ENABLED } from "@/lib/places";
import { AI } from "@/lib/ai/config";
import { VoiceSearch } from "@/components/search/ai-search";
import { cx } from "@/components/ui/primitives";

// One quiet border at rest; on focus the whole field (not the input inside it) takes the ring.
const FIELD = "group rounded-[14px] border border-input bg-surface px-3.5 pt-2 transition-[border-color,box-shadow] duration-150 hover:border-ink/60 focus-within:border-deep focus-within:ring-4 focus-within:ring-deep/15";
const LABEL = "block text-[0.78125rem] font-semibold text-muted transition-colors group-focus-within:text-deep";

export default function ExplorePage() {
  // Voice search is optional and comes second; the filters work the same without it.
  const aiSearch = AI.searchEnabled();
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-4 pb-10 md:px-6 md:pt-14">
      <div className="md:grid md:grid-cols-[1.1fr_1fr] md:items-start md:gap-14">
        <section aria-labelledby="hero">
          <h1
            id="hero"
            className="font-display text-[2.125rem] leading-[1.02] font-bold tracking-[-1.2px] md:text-[3.5rem] md:tracking-[-2px]"
          >
            Find your next home.
            <br />
            Without the <span className="text-primary">hassle</span>.
          </h1>
          <p className="mt-3 text-[0.9375rem] text-muted md:text-[1.0625rem]">
            Stop hunting. Find a home you love with a budget that fits you.
          </p>

          <form action="/search" className="mt-6 flex flex-col gap-3">
            <div className={cx(FIELD, "pb-2.5")}>
              <label htmlFor="q" className={LABEL}>
                Where
              </label>
              <WhereInput placesEnabled={PLACES_ENABLED} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className={cx(FIELD, "pb-2.5")}>
                <label htmlFor="max" className={LABEL}>
                  Max rent / month
                </label>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[0.9375rem] font-semibold" aria-hidden="true">
                    KES
                  </span>
                  <input
                    id="max"
                    name="max"
                    inputMode="numeric"
                    pattern="[0-9,]*"
                    placeholder="Any"
                    className="w-full min-w-0 bg-transparent text-[1.0625rem] font-semibold text-ink placeholder:font-normal focus:outline-none"
                  />
                </div>
              </div>
              <div className={cx(FIELD, "pb-1.5")}>
                <label htmlFor="type" className={LABEL}>
                  Layout
                </label>
                <select
                  id="type"
                  name="type"
                  defaultValue=""
                  className="w-full appearance-none bg-transparent text-[1.0625rem] font-semibold text-ink focus:outline-none"
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
              className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[14px] bg-primary text-[1rem] font-semibold text-white hover:bg-primary-hover"
            >
              <Icon name="search" />
              Find a home
            </button>
          </form>
          {/* Floating mic; the filters above stay the main way to search. */}
          {aiSearch ? <VoiceSearch serverVoice={AI.voiceEnabled()} /> : null}
        </section>

        <div className="mt-8 flex flex-col gap-8 md:mt-2">
          <section aria-labelledby="browse">
            <h2 id="browse" className="font-display text-[1.125rem] font-bold">
              Browse by home type
            </h2>
            <ul className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
              {CATEGORIES.map((c) => (
                <li key={c.value} className="shrink-0">
                  <Link
                    href={`/search?category=${c.value}`}
                    className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-line bg-surface px-4 text-[0.90625rem] font-semibold hover:border-ink"
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
            <p className="mt-1 text-[0.875rem] text-muted">
              List a vacancy for free and keep simple rent records your team confirms. Tenants keep paying the way they
              already do.
            </p>
            <Link href="/start" className="mt-1 inline-flex min-h-11 items-center gap-1 font-semibold text-primary hover:text-primary-hover">
              Get started <Icon name="arrowRight" size={16} />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
