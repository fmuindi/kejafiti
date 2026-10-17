import Link from "next/link";
import { ConfirmCard, type InboxEntry } from "@/components/rent/confirm-card";
import { BulkConfirm } from "@/components/rent/bulk-confirm";
import { EmptyState, Eyebrow, Notice } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth";
import { formatPeriod, isoHoursAgo, timeAgo } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getOpenCharges } from "@/lib/rent/queries";
import { createClient } from "@/lib/supabase/server";

export default async function InboxPage({ params, searchParams }: PageProps<"/w/[orgId]/rent/inbox">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const ws = await requireWorkspace(orgId, `/w/${orgId}/rent/inbox`);
  const property = typeof sp.property === "string" ? sp.property : null;
  const supabase = await createClient();

  if (!ws.can_confirm) {
    return (
      <Notice tone="info" title="You can't confirm rent records">
        Entries you submit are reviewed by an authorised manager. Ask the workspace owner if you should have confirmation
        authority.
      </Notice>
    );
  }

  let q = supabase
    .from("payment_entries")
    .select(
      "id, ref, version, amount, paid_on, method, reference, notes, proposed_allocations, submitted_at, property_id, tenancy_id, submitted_by, properties(name), units(label), tenancies(tenants(full_name)), attachments(id, file_name, mime_type, created_at, uploaded_by, removed_at)",
    )
    .eq("org_id", orgId)
    .eq("status", "awaiting_confirmation")
    .order("submitted_at");
  if (property) q = q.eq("property_id", property);
  const since = isoHoursAgo(1);
  const { data: me } = await supabase.auth.getClaims();
  const [{ data: entries, error }, { data: returned }, { data: recent }] = await Promise.all([
    q,
    supabase
      .from("payment_entries")
      .select("id, ref, amount, decision_reason, decided_at, property_id, units(label), assigned_to")
      .eq("org_id", orgId)
      .eq("status", "returned")
      .order("decided_at", { ascending: false })
      .limit(20),
    supabase
      .from("payment_entries")
      .select("id, ref, amount, status, decided_at, property_id, units(label)")
      .eq("org_id", orgId)
      .eq("decided_by", me?.claims?.sub ?? "")
      .gte("decided_at", since)
      .order("decided_at", { ascending: false })
      .limit(10),
  ]);

  const rows = (entries ?? []) as unknown as Array<{
    id: string; ref: string; version: number; amount: number; paid_on: string; method: string | null; reference: string | null;
    notes: string | null; proposed_allocations: Array<{ charge_id: string; amount: number }>; submitted_at: string;
    property_id: string; tenancy_id: string; submitted_by: string | null;
    properties: { name: string } | null; units: { label: string } | null; tenancies: { tenants: { full_name: string } | null } | null;
    attachments: Array<{ id: string; file_name: string; mime_type: string; created_at: string; uploaded_by: string; removed_at: string | null }>;
  }>;

  const people = new Map<string, string>();
  const ids = [...new Set(rows.map((r) => r.submitted_by).concat((returned ?? []).map((r) => r.assigned_to)).filter(Boolean) as string[])];
  if (ids.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const p of profiles ?? []) people.set(p.id, p.full_name || "staff");
  }

  const inbox: InboxEntry[] = await Promise.all(
    rows.map(async (r) => {
      const charges = await getOpenCharges(supabase, r.tenancy_id);
      const byId = new Map(charges.map((c) => [c.id, c]));
      const lines = r.proposed_allocations.map((a) => {
        const c = byId.get(a.charge_id);
        const label = c ? (c.category === "rent" ? `${formatPeriod(c.periodStart)} rent` : c.description ?? "Charge") : "Charge";
        const before = c ? c.net - c.confirmed : 0;
        return { label, amount: Number(a.amount), before, after: before - Number(a.amount) };
      });
      return {
        id: r.id,
        ref: r.ref,
        version: r.version,
        amount: Number(r.amount),
        paidOn: r.paid_on,
        method: r.method,
        reference: r.reference,
        notes: r.notes,
        submittedAgo: timeAgo(r.submitted_at),
        submittedBy: r.submitted_by ? (people.get(r.submitted_by) ?? "staff") : "staff",
        propertyName: r.properties?.name ?? "",
        propertyId: r.property_id,
        unitLabel: r.units?.label ?? "",
        tenantName: r.tenancies?.tenants?.full_name ?? "",
        lines,
        credit: Math.max(0, Number(r.amount) - lines.reduce((s, l) => s + l.amount, 0)),
        attachments: r.attachments.filter((a) => !a.removed_at).map((a) => ({ id: a.id, name: a.file_name, mime: a.mime_type, at: a.created_at, url: `/api/files/${a.id}` })),
        canViewAttachments: ws.can_view_attachments,
      };
    }),
  );

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5">
      <div>
        <Eyebrow>{property ? (rows[0]?.properties?.name ?? "Property") : "All your properties"}</Eyebrow>
        <h1 className="mt-1 font-display text-[26px] font-bold tracking-[-0.5px] md:text-[34px]">
          Awaiting your confirmation · {inbox.length}
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          Check each payment using your property&apos;s external records before confirming. The platform records your decision; it
          does not verify payments.
        </p>
      </div>
      {error ? (
        <Notice tone="error" role="alert" title="We couldn't load the inbox.">Nothing has changed. Reload to try again.</Notice>
      ) : inbox.length === 0 ? (
        <EmptyState title="Nothing waiting for you" icon="check">
          New submissions from caretakers and staff appear here. Entries you record yourself can be confirmed in one step.
        </EmptyState>
      ) : (
        <>
          {inbox.length > 1 ? <BulkConfirm orgId={orgId} entries={inbox.map((e) => ({ id: e.id, ref: e.ref, unitLabel: e.unitLabel, amount: e.amount, periods: e.lines.map((l) => l.label) }))} /> : null}
          <ul className="flex flex-col gap-4">
            {inbox.map((e) => (
              <li key={e.id}>
                <ConfirmCard orgId={orgId} entry={e} />
              </li>
            ))}
          </ul>
        </>
      )}

      {(recent ?? []).length ? (
        <section aria-labelledby="recent" role="status">
          <h2 id="recent" className="mb-2 text-[14px] font-bold text-muted">
            Decided by you in the last hour
          </h2>
          <ul className="flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {(recent ?? []).map((r) => (
              <li key={r.id}>
                <Link href={`/w/${orgId}/rent/${r.property_id}/entries/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-cool">
                  <span className="font-semibold">
                    <span className="font-mono">{(r.units as unknown as { label: string } | null)?.label}</span> · {formatMoney(Number(r.amount))}
                    <span className="block text-[13px] font-normal text-muted">{r.ref} · {timeAgo(r.decided_at)}</span>
                  </span>
                  <span className={`text-[13.5px] font-semibold ${r.status === "confirmed" ? "text-success" : r.status === "returned" ? "text-waiting" : "text-error"}`}>
                    {r.status === "confirmed" ? "Confirmed" : r.status === "returned" ? "Returned" : r.status === "not_accepted" ? "Not accepted" : r.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(returned ?? []).length ? (
        <section aria-labelledby="ret">
          <h2 id="ret" className="mb-2 text-[14px] font-bold text-muted">
            Returned, waiting on staff
          </h2>
          <ul className="flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
            {(returned ?? []).map((r) => (
              <li key={r.id} className="px-4 py-3">
                <Link href={`/w/${orgId}/rent/${r.property_id}/entries/${r.id}`} className="block hover:underline">
                  <span className="flex justify-between gap-3">
                    <span className="font-semibold">
                      <span className="font-mono">{(r.units as unknown as { label: string } | null)?.label}</span> · {formatMoney(Number(r.amount))} ·{" "}
                      {r.assigned_to ? people.get(r.assigned_to) ?? "staff" : "staff"}
                    </span>
                    <span className="text-[13px] text-muted">{timeAgo(r.decided_at)}</span>
                  </span>
                  <span className="mt-0.5 block text-[13.5px] text-muted">&quot;{r.decision_reason}&quot;</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
