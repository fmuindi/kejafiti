import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/shell/back-link";
import { Icon } from "@/components/ui/icon";
import { Card, cx } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { balanceWords, getMyTenancies, type StatementLine } from "@/lib/my-rent";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABEL, type MessageKind } from "@/lib/tenant-messages";

export const metadata: Metadata = { title: "My statement" };

export default async function MyStatementPage({ params }: PageProps<"/my-rent/[tenancyId]">) {
  const { tenancyId } = await params;
  await requireUser(`/my-rent/${tenancyId}`);
  const supabase = await createClient();
  const t = (await getMyTenancies(supabase)).find((x) => x.tenancy_id === tenancyId);
  if (!t) notFound();
  const [{ data }, { data: messages }] = await Promise.all([
    supabase.rpc("tenancy_statement", { p_tenancy: tenancyId }),
    supabase.from("tenant_messages").select("id, kind, ref, subject, created_at").eq("tenancy_id", tenancyId).order("created_at", { ascending: false }).limit(30),
  ]);
  const lines = (data ?? []) as unknown as StatementLine[];
  const b = balanceWords(t.balance);

  return (
    <div className="mx-auto flex max-w-standard flex-col gap-5 px-4 pt-5 pb-10">
      <BackLink href="/my-rent">My rent</BackLink>
      <Card className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <h1 className="heading-page">{t.property_name} · Unit {t.unit_label}</h1>
          <p className="text-label text-muted">{[t.area, t.org_name].filter(Boolean).join(" · ")}</p>
          <p className="mt-1 text-label">
            Since {formatDate(t.start_date)}
            {t.status === "ended" ? ` · ended ${formatDate(t.end_date)}` : ` · ${t.current_rent ? `${formatMoney(t.current_rent)} a month, ` : ""}due on day ${t.due_day}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-caption text-muted">{b.label}</p>
          <p className={cx("font-display text-title-lg font-extrabold", b.tone === "owed" ? "text-error" : "text-success")}>{formatMoney(Math.abs(t.balance))}</p>
          <p className="text-micro text-muted">Confirmed records only</p>
        </div>
      </Card>

      {messages?.length ? (
        <section aria-labelledby="from" className="flex flex-col gap-2">
          <h2 id="from" className="heading-section">From {t.org_name}</h2>
          <ul className="surface-list">
            {messages.map((m) => (
              <li key={m.id}>
                <Link href={`/my-rent/${tenancyId}/messages/${m.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-cool">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{m.subject}</span>
                    <span className="block text-caption text-muted">
                      {KIND_LABEL[m.kind as MessageKind]}{m.ref ? ` ${m.ref}` : ""} · {formatDateTime(m.created_at)}
                    </span>
                  </span>
                  <Icon name="chevronRight" className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="stmt" className="flex flex-col gap-2">
        <h2 id="stmt" className="heading-section">Statement</h2>
        {lines.length === 0 ? (
          <p className="surface-empty p-4">No charges or payments recorded yet.</p>
        ) : (
          <div className="surface overflow-x-auto" tabIndex={0} role="region" aria-label="Statement (scrolls sideways)">
            <table className="w-full min-w-[520px] text-label">
              <caption className="sr-only">Charges and confirmed payments with the running balance</caption>
              <thead>
                <tr className="border-b border-line text-left font-mono text-micro text-muted">
                  <th scope="col" className="px-3 py-2 font-medium">Date</th>
                  <th scope="col" className="px-3 py-2 font-medium">Description</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Charge</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Paid</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-divider last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(l.line_date)}</td>
                    <td className="px-3 py-2">{l.description}{l.ref ? <span className="font-mono text-micro text-muted"> · {l.ref}</span> : null}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(l.charge) ? formatAmount(Number(l.charge)) : ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(l.payment) ? formatAmount(Number(l.payment)) : ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatAmount(Number(l.balance))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-caption text-muted">
          A payment appears once your landlord or agent has checked and confirmed it. Balance: positive means owed, negative means credit.
        </p>
      </section>
    </div>
  );
}
