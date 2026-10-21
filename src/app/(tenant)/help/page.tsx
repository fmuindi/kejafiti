import type { Metadata } from "next";
import Link from "next/link";
import { AskHelp } from "@/components/support/ask-help";
import { SupportForm } from "@/components/support/support-form";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, PageTitle, StatusBadge } from "@/components/ui/primitives";
import { AI } from "@/lib/ai/config";
import { getSessionUser } from "@/lib/auth";
import { timeAgo } from "@/lib/dates";
import { HELP_ARTICLES } from "@/lib/help/articles";
import { SUPPORT_STATUS, categoryLabel } from "@/lib/support";
import { safeInternalLink } from "@/lib/updates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Help and support" };

export default async function HelpPage({ searchParams }: PageProps<"/help">) {
  const sp = await searchParams;
  const from = safeInternalLink(typeof sp.from === "string" ? sp.from : null) ?? undefined;
  // A question handed over from "Ask a question" starts the support message.
  const ask = typeof sp.ask === "string" ? sp.ask.slice(0, 500) : "";
  const user = await getSessionUser();
  const supabase = await createClient();
  const { data: tickets } = user
    ? await supabase.from("support_tickets").select("id, ref, subject, category, status, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(20)
    : { data: [] };
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 pt-5 pb-10">
      <PageTitle>Help and support</PageTitle>
      {AI.assistEnabled("help_answer") ? <AskHelp signedIn={!!user} /> : null}
      <section aria-labelledby="faq" className="flex flex-col gap-2">
        <h2 id="faq" className="font-display text-[20px] font-bold">Common questions</h2>
        {HELP_ARTICLES.map(({ id, question: q, answer: a }) => (
          <details key={id} id={id} className="rounded-[14px] border border-line bg-surface px-4 py-3">
            <summary className="cursor-pointer font-semibold">{q}</summary>
            <p className="mt-2 text-[14.5px] text-muted">{a}</p>
          </details>
        ))}
        <p className="text-[13.5px] text-muted">
          <Link href="/legal/terms" className="underline">Terms</Link> · <Link href="/legal/privacy" className="underline">Privacy notice</Link>
        </p>
      </section>
      {(tickets ?? []).length ? (
        <section aria-labelledby="mine" className="flex flex-col gap-2">
          <h2 id="mine" className="font-display text-[20px] font-bold">Your requests</h2>
          <ul className="flex flex-col divide-y divide-divider overflow-hidden rounded-[16px] border border-line bg-surface">
            {(tickets ?? []).map((t) => (
              <li key={t.id}>
                <Link href={`/help/tickets/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cool">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{t.ref} · {t.subject}</span>
                    <span className="text-[13px] text-muted">{categoryLabel(t.category)} · updated {timeAgo(t.updated_at)}</span>
                  </span>
                  <StatusBadge tone={SUPPORT_STATUS[t.status]?.tone ?? "neutral"}>{SUPPORT_STATUS[t.status]?.label ?? t.status}</StatusBadge>
                  <Icon name="chevronRight" className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section id="contact" aria-labelledby="contact-h" className="flex flex-col gap-2">
        <h2 id="contact-h" className="font-display text-[20px] font-bold">Contact support</h2>
        <p className="text-[14px] text-muted">For a problem with a listing, use &quot;Report this listing&quot; on that listing. Questions about your rent go to your landlord or property manager.</p>
        {user ? (
          <SupportForm contextLink={from} initialDescription={ask} />
        ) : (
          <ButtonLink href={`/sign-in?next=${encodeURIComponent(`/help${ask ? `?ask=${encodeURIComponent(ask)}#contact` : from ? `?from=${encodeURIComponent(from)}` : ""}`)}`} className="self-start">Sign in to contact support</ButtonLink>
        )}
      </section>
    </div>
  );
}
