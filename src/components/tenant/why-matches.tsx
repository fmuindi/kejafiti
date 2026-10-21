import type { MatchExplanation } from "@/lib/listing/match";

// AI-03: a short factual list of how this home meets the search it was opened from.
export function WhyMatches({ why }: { why: MatchExplanation }) {
  if (!why.matches.length && !why.unknown.length && !why.misses.length) return null;
  return (
    <section aria-labelledby="why" className="rounded-[20px] border border-line bg-surface p-4">
      <h2 id="why" className="font-display text-[18px] font-bold">How it fits your search</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-[14.5px]">
        {why.matches.map((m) => (
          <li key={m} className="flex gap-2"><span aria-hidden="true" className="text-success">✓</span><span className="sr-only">Matches: </span>{m}</li>
        ))}
        {why.unknown.map((m) => (
          <li key={m} className="flex gap-2 text-waiting-strong"><span aria-hidden="true">?</span><span className="sr-only">Unknown: </span>{m}</li>
        ))}
        {why.misses.map((m) => (
          <li key={m} className="flex gap-2 text-error"><span aria-hidden="true">✗</span><span className="sr-only">Doesn&apos;t match: </span>{m}</li>
        ))}
      </ul>
      <p className="mt-2 text-[12.5px] text-muted">From the advertiser&apos;s current details. Ask about anything marked unconfirmed before paying.</p>
    </section>
  );
}
