import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryStatusBadge } from "@/components/rent/badges";
import { CorrectionPanel } from "@/components/rent/correction-panel";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, Card, Eyebrow, Notice } from "@/components/ui/primitives";
import { getSessionUser, requireWorkspace } from "@/lib/auth";
import { formatDate, formatDateTime, formatPeriod } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { getOpenCharges, getProperty } from "@/lib/rent/queries";
import { METHOD_LABEL } from "@/lib/rent/status";
import { createClient } from "@/lib/supabase/server";

const ACTION_LABEL: Record<string, string> = {
  created: "Entered",
  edited: "Edited",
  submitted: "Submitted for confirmation",
  returned: "Returned for changes",
  not_accepted: "Not accepted",
  confirmed: "Confirmed",
  reversed: "Reversed (correction)",
  replaced: "Replaced by a correction",
  reassigned: "Open work reassigned",
  credit_applied: "Credit applied to a charge",
};

export default async function EntryPage({ params }: PageProps<"/w/[orgId]/rent/[propertyId]/entries/[entryId]">) {
  const { orgId, propertyId, entryId } = await params;
  const base = `/w/${orgId}/rent/${propertyId}`;
  const ws = await requireWorkspace(orgId, base);
  const user = await getSessionUser();
  const supabase = await createClient();
  await getProperty(supabase, ws, propertyId);

  const { data: e } = await supabase
    .from("payment_entries")
    .select("*, units(label), tenancies(id, tenants(full_name))")
    .eq("id", entryId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (!e) notFound();

  const [{ data: events }, { data: allocs }, { data: atts }, { data: replacement }] = await Promise.all([
    supabase.from("entry_events").select("id, action, actor_id, reason, created_at").eq("entry_id", entryId).order("created_at"),
    supabase.from("allocations").select("id, charge_id, amount, posted_at, reverses_allocation_id, rent_charges(category, period_start, description)").eq("entry_id", entryId).order("posted_at"),
    supabase.from("attachments").select("id, file_name, mime_type, created_at, uploaded_by, removed_at").eq("entry_id", entryId),
    supabase.from("payment_entries").select("id, ref, status").eq("replaces_entry_id", entryId).maybeSingle(),
  ]);
  const original = e.replaces_entry_id
    ? (await supabase.from("payment_entries").select("id, ref").eq("id", e.replaces_entry_id).maybeSingle()).data
    : null;

  const actorIds = [...new Set([...(events ?? []).map((x) => x.actor_id), e.recorded_by, e.confirmed_by, e.decided_by].filter(Boolean) as string[])];
  const { data: people } = actorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
  const name = (id: string | null) => (id ? people?.find((p) => p.id === id)?.full_name || "staff" : "system");

  const posted = (allocs ?? []).reduce((s, a) => s + Number(a.amount), 0);
  const unallocated = e.status === "confirmed" ? Math.round((Number(e.amount) - posted) * 100) / 100 : 0;
  const unit = (e.units as unknown as { label: string } | null)?.label;
  const tenant = (e.tenancies as unknown as { tenants: { full_name: string } | null } | null)?.tenants?.full_name;
  const canEdit = ["draft", "returned"].includes(e.status) && ws.can_enter_payments && (e.recorded_by === user?.id || e.assigned_to === user?.id);
  const openCharges = e.status === "confirmed" && (ws.can_correct || (ws.can_confirm && unallocated > 0)) ? await getOpenCharges(supabase, e.tenancy_id) : [];
  const mine = new Map<string, number>();
  for (const a of allocs ?? []) {
    const cid = a.charge_id;
    if (cid) mine.set(cid, (mine.get(cid) ?? 0) + Number(a.amount));
  }
  const chargeOptions = openCharges.map((c) => ({
    id: c.id,
    label: c.category === "rent" ? `${formatPeriod(c.periodStart)} rent` : c.description ?? "Charge",
    periodStart: c.periodStart,
    dueDate: c.dueDate,
    net: c.net,
    confirmed: c.confirmed,
    thisEntry: Math.round((mine.get(c.id) ?? 0) * 100) / 100,
  }));

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5">
      <Link href={base} className="inline-flex min-h-11 items-center gap-1 self-start font-semibold">
        <Icon name="chevronLeft" /> Rent register
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>
            {e.ref} · Unit {unit}
          </Eyebrow>
          <h1 className="mt-1 font-display text-[28px] font-bold">{formatMoney(Number(e.amount))}</h1>
          <p className="text-[14.5px] text-muted">
            {tenant} · {e.kind === "opening_credit" ? "Opening credit" : `paid ${formatDate(e.paid_on)}`}
          </p>
        </div>
        <EntryStatusBadge status={e.status} />
      </div>

      {e.status === "returned" && e.decision_reason ? (
        <Notice tone="waiting" title="Returned for changes">&quot;{e.decision_reason}&quot;</Notice>
      ) : null}
      {e.status === "not_accepted" && e.decision_reason ? (
        <Notice tone="error" title="Not accepted">&quot;{e.decision_reason}&quot; This entry did not create a confirmed payment.</Notice>
      ) : null}
      {e.status === "reversed" ? (
        <Notice tone="neutral" title={`Corrected on ${formatDateTime(e.reversed_at)} by ${name(e.reversed_by)}`}>
          Reason: &quot;{e.reversal_reason}&quot;. The original record and its allocations are kept; a reversal was posted.
          {replacement ? (
            <>
              {" "}
              Replacement:{" "}
              <Link className="font-semibold underline" href={`${base}/entries/${replacement.id}`}>
                {replacement.ref}
              </Link>
              .
            </>
          ) : null}
        </Notice>
      ) : null}
      {original ? (
        <Notice tone="info">
          This entry corrects{" "}
          <Link className="font-semibold underline" href={`${base}/entries/${original.id}`}>
            {original.ref}
          </Link>
          .
        </Notice>
      ) : null}

      <Card className="p-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14.5px]">
          <dt className="text-muted">Method</dt>
          <dd>{e.method ? METHOD_LABEL[e.method] : "Not given"} <span className="text-[12.5px] text-muted">(records only; no account connected)</span></dd>
          <dt className="text-muted">Reference</dt>
          <dd className="font-mono">{e.reference ?? "Not given"}</dd>
          <dt className="text-muted">Recorded</dt>
          <dd>{formatDateTime(e.recorded_at)} by {name(e.recorded_by)}</dd>
          {e.confirmed_at ? (
            <>
              <dt className="text-muted">Confirmed</dt>
              <dd>
                {formatDateTime(e.confirmed_at)} by {name(e.confirmed_by)}
                {e.confirmed_by === e.recorded_by ? " (recorded and confirmed by the same person)" : ""}
              </dd>
            </>
          ) : null}
          {e.notes ? (
            <>
              <dt className="text-muted">Notes</dt>
              <dd>{e.notes}</dd>
            </>
          ) : null}
        </dl>
      </Card>

      <section aria-labelledby="alloc">
        <h2 id="alloc" className="font-display text-[18px] font-bold">
          {e.status === "confirmed" || e.status === "reversed" ? "Posted allocations" : "Proposed allocation (not counted until confirmed)"}
        </h2>
        <ul className="mt-2 flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
          {e.status === "confirmed" || e.status === "reversed"
            ? (allocs ?? []).map((a) => {
                const c = a.rent_charges as unknown as { category: string; period_start: string; description: string | null } | null;
                return (
                  <li key={a.id} className="flex justify-between px-4 py-2.5 text-[14.5px]">
                    <span>
                      {c?.category === "rent" ? `${formatPeriod(c.period_start)} rent` : c?.description ?? "Charge"}
                      {a.reverses_allocation_id ? <span className="text-muted"> · reversal</span> : null}
                    </span>
                    <span className="font-mono">{formatAmount(Number(a.amount))}</span>
                  </li>
                );
              })
            : ((e.proposed_allocations as Array<{ charge_id: string; amount: number }>) ?? []).map((a) => (
                <li key={a.charge_id} className="flex justify-between px-4 py-2.5 text-[14.5px]">
                  <span>Charge</span>
                  <span className="font-mono">{formatAmount(Number(a.amount))}</span>
                </li>
              ))}
          {unallocated > 0 ? (
            <li className="flex justify-between px-4 py-2.5 text-[14.5px] font-semibold">
              <span>Kept as tenant credit</span>
              <span className="font-mono">{formatAmount(unallocated)}</span>
            </li>
          ) : null}
        </ul>
      </section>

      {(atts ?? []).filter((a) => !a.removed_at).length ? (
        <section aria-labelledby="ev">
          <h2 id="ev" className="font-display text-[18px] font-bold">Evidence supplied by staff</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {(atts ?? []).filter((a) => !a.removed_at).map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-[14px] border border-line bg-surface p-3">
                <Icon name={a.mime_type === "application/pdf" ? "file" : "image"} className="text-deep" />
                <span className="min-w-0 flex-1">
                  {ws.can_view_attachments || a.uploaded_by === user?.id ? (
                    <a href={`/api/files/${a.id}`} target="_blank" rel="noopener" className="font-semibold underline">{a.file_name}</a>
                  ) : (
                    <span className="font-semibold">{a.file_name}</span>
                  )}
                  <span className="block text-[12.5px] text-muted">Uploaded by {name(a.uploaded_by)} · {formatDateTime(a.created_at)} · not proof of payment</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="hist">
        <h2 id="hist" className="font-display text-[18px] font-bold">History</h2>
        <ol className="mt-2 flex flex-col gap-0 border-l-2 border-line pl-4">
          {(events ?? []).map((ev) => (
            <li key={ev.id} className="relative pb-3">
              <span className="absolute top-1.5 -left-[22px] size-2.5 rounded-full bg-deep" aria-hidden="true" />
              <p className="text-[14.5px] font-semibold">{ACTION_LABEL[ev.action] ?? ev.action}</p>
              <p className="text-[13px] text-muted">
                {name(ev.actor_id)} · {formatDateTime(ev.created_at)}
              </p>
              {ev.reason ? <p className="text-[13.5px]">&quot;{ev.reason}&quot;</p> : null}
            </li>
          ))}
        </ol>
      </section>

      {canEdit ? (
        <ButtonLink href={`${base}/record?entry=${e.id}`} size="lg">
          {e.status === "returned" ? "Edit and resubmit" : "Continue this draft"}
        </ButtonLink>
      ) : null}
      {e.status === "confirmed" && e.kind === "payment" ? (
        <CorrectionPanel
          orgId={orgId}
          propertyId={propertyId}
          entry={{ id: e.id, ref: e.ref, amount: Number(e.amount), paidOn: e.paid_on, method: e.method, reference: e.reference, tenancyId: e.tenancy_id, unallocated }}
          charges={chargeOptions}
          canCorrect={ws.can_correct}
          canConfirm={ws.can_confirm}
        />
      ) : null}
    </div>
  );
}
