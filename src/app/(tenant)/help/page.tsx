import type { Metadata } from "next";
import Link from "next/link";
import { SupportForm } from "@/components/support/support-form";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, PageTitle, StatusBadge } from "@/components/ui/primitives";
import { getSessionUser } from "@/lib/auth";
import { timeAgo } from "@/lib/dates";
import { SUPPORT_STATUS, categoryLabel } from "@/lib/support";
import { safeInternalLink } from "@/lib/updates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Help and support" };

// Answers that are true of the product today; nothing here promises more than it does.
const FAQ: Array<[string, string]> = [
  ["Does nyumbani take rent payments?", "No. Tenants pay through each property's own arrangements. Staff check payments outside nyumbani, then record and confirm them here."],
  ["Why does my viewing say \"not confirmed\"?", "A request stays pending until the advertiser accepts it. If the time passes first, ask for a new time from Viewings."],
  ["Why do some totals say \"incomplete\"?", "The advertiser hasn't confirmed every compulsory charge yet. Ask them before you pay anything."],
  ["I'm staff. Why can't I confirm a payment?", "Confirming needs the \"Can confirm rent records\" permission. Ask the workspace owner, who can see and change your access under Team."],
  ["How do I report a suspicious listing?", "Open the listing and use \"Report this listing\". Our team reviews every report."],
];

export default async function HelpPage({ searchParams }: PageProps<"/help">) {
  const from = safeInternalLink(typeof (await searchParams).from === "string" ? ((await searchParams).from as string) : null) ?? undefined;
  const user = await getSessionUser();
  const supabase = await createClient();
  const { data: tickets } = user
    ? await supabase.from("support_tickets").select("id, ref, subject, category, status, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(20)
    : { data: [] };
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 pt-5 pb-10">
      <PageTitle>Help and support</PageTitle>
      <section aria-labelledby="faq" className="flex flex-col gap-2">
        <h2 id="faq" className="font-display text-[20px] font-bold">Common questions</h2>
        {FAQ.map(([q, a]) => (
          <details key={q} className="rounded-[14px] border border-line bg-surface px-4 py-3">
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
      <section aria-labelledby="contact" className="flex flex-col gap-2">
        <h2 id="contact" className="font-display text-[20px] font-bold">Contact support</h2>
        <p className="text-[14px] text-muted">For a problem with a listing, use &quot;Report this listing&quot; on that listing. Questions about your rent go to your landlord or property manager.</p>
        {user ? (
          <SupportForm contextLink={from} />
        ) : (
          <ButtonLink href={`/sign-in?next=${encodeURIComponent(`/help${from ? `?from=${encodeURIComponent(from)}` : ""}`)}`} className="self-start">Sign in to contact support</ButtonLink>
        )}
      </section>
    </div>
  );
}
