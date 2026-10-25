import type { Metadata } from "next";
import Link from "next/link";
import { HomeSearch } from "@/components/workspace/home";
import { BackLink } from "@/components/shell/back-link";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

type Hit = { kind: "unit" | "tenant" | "payment"; title: string; detail: string; property_id: string; unit_id: string | null; entry_id: string | null };
const ICON: Record<Hit["kind"], IconName> = { unit: "home", tenant: "user", payment: "wallet" };

// Unit, tenant name, phone, email or payment reference, within the properties this person can see.
export default async function SearchPage({ params, searchParams }: PageProps<"/w/[orgId]/search">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const base = `/w/${orgId}`;
  await requireWorkspace(orgId, `${base}/search${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const supabase = await createClient();
  const { data } = q.length >= 2 ? await supabase.rpc("workspace_search", { p_org: orgId, p_q: q }) : { data: [] };
  const hits = (data ?? []) as unknown as Hit[];
  const href = (h: Hit) =>
    h.kind === "payment" && h.entry_id ? `${base}/rent/${h.property_id}/entries/${h.entry_id}` : `${base}/rent/${h.property_id}/units/${h.unit_id}`;

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-5">
      <BackLink href={base}>Home</BackLink>
      <h1 className="heading-page">Search</h1>
      <HomeSearch orgId={orgId} defaultValue={q} autoFocus={!q} />
      {q.length < 2 ? (
        <p className="text-label text-muted">Type at least 2 characters: a unit like A2, a tenant&apos;s name or phone, or an M-PESA or bank reference.</p>
      ) : hits.length ? (
        <ul className="surface-list" aria-label={`${hits.length} result${hits.length === 1 ? "" : "s"} for ${q}`}>
          {hits.map((h, i) => (
            <li key={i}>
              <Link href={href(h)} className="flex items-center gap-3 px-4 py-3 hover:bg-cool">
                <Icon name={ICON[h.kind]} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{h.title}</span>
                  <span className="block truncate text-caption text-muted">{h.detail}</span>
                </span>
                <Icon name="chevronRight" className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={`Nothing found for "${q}"`} icon="search">
          Only properties you&apos;re assigned to are searched. Try the unit label, part of the name, or the last digits of the phone number.
        </EmptyState>
      )}
    </div>
  );
}
