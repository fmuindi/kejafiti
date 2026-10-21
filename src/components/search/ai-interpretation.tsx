"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/primitives";

const UNDO_KEY = "nyumbani.aiSearch.undo";
const LAST_KEY = "nyumbani.aiSearch.last";

type Last = { to: string; text: string; changes: string[]; defaults: string[]; notes: string[] };

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

const noop = () => () => {};

/**
 * Shows how a typed or spoken request was read, any default that was applied (visible, as
 * the blueprint requires), what couldn't be searched, and Undo to the previous search.
 * Only for the search the request produced; the filters and chips remain the source of truth.
 */
export function AiInterpretation({ query }: { query: string }) {
  const router = useRouter();
  const last = useSyncExternalStore(noop, () => sessionStorage.getItem(LAST_KEY), () => null);
  const stack = useSyncExternalStore(noop, () => sessionStorage.getItem(UNDO_KEY), () => null);
  const info = last ? (read<Last | null>(LAST_KEY, null)) : null;
  const undo = stack ? read<Array<{ from: string; to: string }>>(UNDO_KEY, []).at(-1) : undefined;
  if (!info || info.to !== query) return null;
  return (
    <section aria-label="How we read your request" className="mt-3 flex flex-col gap-1.5 rounded-[14px] border border-line bg-surface p-3 text-[14px]">
      <p>
        <span className="text-muted">You asked for </span>&quot;{info.text}&quot;
      </p>
      {info.changes.length ? <p><span className="text-muted">We searched: </span>{info.changes.join(" · ")}</p> : null}
      {info.defaults.map((d) => <p key={d} className="text-waiting-strong">{d}</p>)}
      {info.notes.map((n) => <p key={n} className="text-muted">{n}</p>)}
      {undo && undo.to === query && undo.from ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() => {
            try {
              const s = read<Array<{ from: string; to: string }>>(UNDO_KEY, []);
              sessionStorage.setItem(UNDO_KEY, JSON.stringify(s.slice(0, -1)));
              sessionStorage.removeItem(LAST_KEY);
            } catch {
              /* ignore */
            }
            router.push(undo.from ? `/search?${undo.from}` : "/search");
          }}
        >
          Undo last change
        </Button>
      ) : null}
    </section>
  );
}
