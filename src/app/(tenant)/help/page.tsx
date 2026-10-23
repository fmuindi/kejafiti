import type { Metadata } from "next";
import Link from "next/link";
import { AskHelp } from "@/components/support/ask-help";
import { SupportForm } from "@/components/support/support-form";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/shell/page-header";
import { TenantJumps } from "@/components/shell/tenant-jumps";
import { ButtonLink, StatusBadge } from "@/components/ui/primitives";
import { AI } from "@/lib/ai/config";
import { getSessionUser } from "@/lib/auth";
import { timeAgo } from "@/lib/dates";
import { HELP_ARTICLES } from "@/lib/help/articles";
import { SUPPORT_STATUS, categoryLabel } from "@/lib/support";
import { safeInternalLink } from "@/lib/updates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Help" };

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
      <PageHeader icon="info" title="Help" action={user ? <ButtonLink href="#contact" size="sm" variant="secondary" icon="message">Contact</ButtonLink> : null} />
      {user ? <TenantJumps current="/help" /> : null}
      {AI.assistEnabled("help_answer") ? <AskHelp signedIn={!!user} /> : null}
      <section aria-labelledby="faq" className="flex flex-col gap-2">
        <h2 id="faq" className="text-[13px] font-semibold tracking-[0.4px] text-muted uppercase">Common questions</h2>
        <div className="flex flex-col divide-y divide-divider overflow-hidden rounded-[16px] border border-line bg-surface">
          {HELP_ARTICLES.map(({ id, question: q, answer: a }) => (
            <details key={id} id={id} className="group">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 font-semibold hover:bg-cool">
                <span className="flex-1">{q}</span>
                <Icon name="chevronDown" size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-4 pb-3.5 text-[14.5px] text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
      {(tickets ?? []).length ? (
        <section aria-labelledby="mine" className="flex flex-col gap-2">
          <h2 id="mine" className="text-[13px] font-semibold tracking-[0.4px] text-muted uppercase">Your requests</h2>
          <ul className="flex flex-col divide-y divide-divider overflow-hidden rounded-[16px] border border-line bg-surface">
            {(tickets ?? []).map((t) => (
              <li key={t.id}>
                <Link href={`/help/tickets/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cool">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{t.ref} · {t.subject}</span>
                    <span className="text-[13px] text-muted">{categoryLabel(t.category)} · {timeAgo(t.updated_at)}</span>
                  </span>
                  <StatusBadge tone={SUPPORT_STATUS[t.status]?.tone ?? "neutral"}>{SUPPORT_STATUS[t.status]?.label ?? t.status}</StatusBadge>
                  <Icon name="chevronRight" className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <details id="contact" open={!!ask || !!from} className="group scroll-mt-24 rounded-[16px] border border-line bg-surface">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-semibold">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-pink text-primary"><Icon name="message" size={18} /></span>
          <span className="flex-1">Contact support</span>
          <Icon name="chevronDown" size={18} className="text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-3 border-t border-divider p-4">
          <ul className="flex flex-col gap-1 text-[13.5px] text-muted">
            <li className="flex items-center gap-2"><Icon name="flag" size={15} /> Listing problem? Use Report on the listing.</li>
            <li className="flex items-center gap-2"><Icon name="wallet" size={15} /> Rent question? Ask your landlord.</li>
          </ul>
          {user ? (
            <SupportForm contextLink={from} initialDescription={ask} />
          ) : (
            <ButtonLink href={`/sign-in?next=${encodeURIComponent(`/help${ask ? `?ask=${encodeURIComponent(ask)}#contact` : from ? `?from=${encodeURIComponent(from)}` : ""}`)}`} className="self-start">Sign in to contact support</ButtonLink>
          )}
        </div>
      </details>
      <p className="text-[13px] text-muted">
        <Link href="/legal/terms" className="hover:text-ink">Terms</Link> · <Link href="/legal/privacy" className="hover:text-ink">Privacy</Link>
      </p>
    </div>
  );
}
