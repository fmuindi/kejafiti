"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { askHelp, type HelpAnswer } from "@/app/(tenant)/help/ai-actions";
import { TextInput } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";

// AI-11: ask a question, answered only from the help articles below. When they don't cover it,
// the person goes to Contact support with their question already filled in.
export function AskHelp({ signedIn }: { signedIn: boolean }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<HelpAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const handoff = `/help?ask=${encodeURIComponent(q.trim().slice(0, 500))}#contact`;
  const supportHref = signedIn ? handoff : `/sign-in?next=${encodeURIComponent(handoff)}`;
  return (
    <section aria-labelledby="ask" className="flex flex-col gap-2">
      <h2 id="ask" className="font-display text-[20px] font-bold">Ask a question</h2>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            setResult(null);
            const r = await askHelp(q);
            if (!r.ok) return setError(r.message);
            setResult(r.result);
          });
        }}
      >
        <label htmlFor="ask-q" className="sr-only">Your question</label>
        <TextInput id="ask-q" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Can I pay rent here?" className="flex-1" />
        <Button type="submit" pending={pending} pendingLabel="Checking">Ask</Button>
      </form>
      <p className="text-[12.5px] text-muted">Answers come from the help articles on this page. Please don&apos;t include personal details.</p>
      <div aria-live="polite">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {result?.found ? (
          <div className="flex flex-col gap-2 rounded-[14px] border border-line bg-cool p-4">
            <p className="text-[14.5px]">{result.answer}</p>
            <p className="text-[13px] text-muted">From: {result.articles.map((a, i) => <span key={a.id}>{i ? ", " : ""}<a href={`#${a.id}`} className="underline">{a.question}</a></span>)}</p>
            <p className="text-[13px]">Not what you needed? <Link href={supportHref} className="underline">Contact support</Link></p>
          </div>
        ) : null}
        {result && !result.found ? (
          <div className="flex flex-col gap-2 rounded-[14px] border border-line bg-cool p-4">
            <p className="text-[14.5px]">Our help articles don&apos;t cover that. Our support team can help.</p>
            <Link href={supportHref} className="self-start font-semibold underline">{signedIn ? "Send this question to support" : "Sign in to ask support"}</Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
