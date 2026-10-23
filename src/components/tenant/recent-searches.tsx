"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";

// Recent searches are kept on this device only (no account needed). They contain no
// personal data: just the search parameters.

const KEY = "nyumbani.recentSearches";
export type RecentSearch = { label: string; query: string; at: number };

function read(): RecentSearch[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentSearch[]) : [];
  } catch {
    return [];
  }
}

export function rememberSearch(entry: Omit<RecentSearch, "at">) {
  try {
    const next = [{ ...entry, at: Date.now() }, ...read().filter((r) => r.query !== entry.query)].slice(0, 5);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("nyumbani-recent"));
  } catch {
    // Storage unavailable (private mode): nothing to remember.
  }
}

let cache: { raw: string | null; value: RecentSearch[] } = { raw: null, value: [] };
function snapshot(): RecentSearch[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, value: read() };
  return cache.value;
}
const empty: RecentSearch[] = [];

export function RecentSearches() {
  const items = useSyncExternalStore(
    (cb) => {
      window.addEventListener("nyumbani-recent", cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener("nyumbani-recent", cb);
        window.removeEventListener("storage", cb);
      };
    },
    snapshot,
    () => empty,
  );
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="recent">
      <h2 id="recent" className="heading-section">
        Pick up where you left off
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {items.slice(0, 3).map((r) => (
          <li key={r.query}>
            <Link
              href={`/search?${r.query}`}
              className="surface flex min-h-row items-center gap-3 px-4 hover:border-ink"
            >
              <Icon name="history" className="text-deep" />
              <span className="min-w-0 flex-1 truncate font-semibold">{r.label}</span>
              <Icon name="chevronRight" className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-caption text-muted">Saved on this device only. On a shared phone, clear them in Account.</p>
    </section>
  );
}
