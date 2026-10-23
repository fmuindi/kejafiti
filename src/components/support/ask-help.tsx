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
      <h2 id="ask" className="sr-only">Ask a question</h2>
      <form
        className="flex gap-2"
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
        <TextInput id="ask-q" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything, e.g. can I pay rent here?" className="min-w-0 flex-1" />
        <Button type="submit" icon="arrowRight" pending={pending} pendingLabel="Checking">Ask</Button>
      </form>
      <p className="text-[0.78125rem] text-muted">Answered from our help articles. Leave out personal details.</p>
      <div aria-live="polite">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {result?.found ? (
          <div className="flex flex-col gap-2 rounded-[14px] border border-line bg-cool p-4">
            <p className="text-[0.90625rem]">{result.answer}</p>
            <p className="text-[0.8125rem] text-muted">From: {result.articles.map((a, i) => <span key={a.id}>{i ? ", " : ""}<a href={`#${a.id}`} className="underline">{a.question}</a></span>)}</p>
            <p className="text-[0.8125rem]">Not what you needed? <Link href={supportHref} className="underline">Contact support</Link></p>
          </div>
        ) : null}
        {result && !result.found ? (
          <div className="flex flex-col gap-2 rounded-[14px] border border-line bg-cool p-4">
            <p className="text-[0.90625rem]">Our help articles don&apos;t cover that. Our support team can help.</p>
            <Link href={supportHref} className="self-start font-semibold underline">{signedIn ? "Send this question to support" : "Sign in to ask support"}</Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
