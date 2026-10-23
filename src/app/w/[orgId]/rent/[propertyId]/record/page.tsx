import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordPaymentForm } from "@/components/rent/record-payment-form";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/primitives";
import { requireUser, requireWorkspace } from "@/lib/auth";
import { currentPeriod, formatDate, formatPeriod, parsePeriodParam } from "@/lib/dates";
import { getOpenCharges, getProperty, getSummary } from "@/lib/rent/queries";
import { createClient } from "@/lib/supabase/server";

export default async function RecordPaymentPage({ params, searchParams }: PageProps<"/w/[orgId]/rent/[propertyId]/record">) {
  const { orgId, propertyId } = await params;
  const sp = await searchParams;
  const base = `/w/${orgId}/rent/${propertyId}`;
  const ws = await requireWorkspace(orgId, base);
  const user = await requireUser(base);
  const supabase = await createClient();
  const property = await getProperty(supabase, ws, propertyId);
  const tenancyId = typeof sp.tenancy === "string" ? sp.tenancy : null;
  const entryId = typeof sp.entry === "string" ? sp.entry : null;
  const period = parsePeriodParam(sp.period);

  if (!ws.can_enter_payments) {
    return (
      <Notice tone="info" title="You can view these records, but not enter payments.">
        Ask the workspace owner to turn on &quot;Enter payments&quot; for you on this property.
      </Notice>
    );
  }

  type EntryRow = {
    id: string; ref: string; tenancy_id: string; amount: number; paid_on: string; method: string | null; reference: string | null;
    notes: string | null; proposed_allocations: Array<{ charge_id: string; amount: number }>; status: string; version: number;
    client_request_id: string; decision_reason: string | null;
  };
  let entry: EntryRow | null = null;
  if (entryId) {
    const { data } = await supabase
      .from("payment_entries")
      .select("id, ref, tenancy_id, amount, paid_on, method, reference, notes, proposed_allocations, status, version, client_request_id, decision_reason")
      .eq("id", entryId)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (!data) notFound();
    entry = data as unknown as EntryRow;
  }
  const tId = entry?.tenancy_id ?? tenancyId;
  if (!tId) notFound();

  const { data: tenancy } = await supabase
    .from("tenancies")
    .select("id, start_date, status, due_day, unit_id, units(label), tenants(full_name)")
    .eq("id", tId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (!tenancy) notFound();

  const [charges, { summary }, { data: attachments }] = await Promise.all([
    getOpenCharges(supabase, tId),
    getSummary(supabase, orgId, propertyId, period),
    entry
      ? supabase.from("attachments").select("id, file_name, mime_type, size_bytes, created_at").eq("entry_id", entry.id).is("removed_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  const labelled = charges.map((c) => ({
    id: c.id,
    periodStart: c.periodStart,
    dueDate: c.dueDate,
    net: c.net,
    confirmed: c.confirmed,
    category: c.category,
    label:
      c.category === "rent" ? `${formatPeriod(c.periodStart)} rent`
      : c.category === "opening_balance" ? `Opening balance (${formatDate(c.dueDate)})`
      : c.description ?? "Other charge",
  }));
  const proposed = new Set((entry?.proposed_allocations ?? []).map((a) => a.charge_id));
  const open = labelled.filter((c) => c.net - c.confirmed > 0 || proposed.has(c.id));
  const current = labelled.find((c) => c.category === "rent" && c.periodStart === period);
  const unitLabel = (tenancy.units as unknown as { label: string } | null)?.label ?? "";
  const tenantName = (tenancy.tenants as unknown as { full_name: string } | null)?.full_name ?? "";

  return (
    <div className="mx-auto max-w-[640px]">
      <div className="mb-4 flex items-center justify-between">
        <Link href={`${base}?period=${period.slice(0, 7)}`} className="inline-flex min-h-11 items-center gap-1 font-semibold" aria-label="Back to the rent register">
          <Icon name="x" /> <span className="sr-only md:not-sr-only">Close</span>
        </Link>
        <h1 className="font-display text-[1.25rem] font-bold">{entry ? `Edit ${entry.ref}` : "Record payment"}</h1>
        <span className="w-11" />
      </div>
      {entry?.status === "returned" && entry.decision_reason ? (
        <Notice tone="waiting" title="Returned for changes" className="mb-4">
          &quot;{entry.decision_reason}&quot; Edit the entry and submit it again. The history is kept.
        </Notice>
      ) : null}
      {entry && !["draft", "returned"].includes(entry.status) ? (
        <Notice tone="info" title="This entry can't be edited">
          It is {entry.status.replace("_", " ")}. Confirmed entries are corrected with a linked correction instead.
        </Notice>
      ) : (
        <RecordPaymentForm
          userId={user.id}
          orgId={orgId}
          propertyId={propertyId}
          propertyName={property.name}
          unitLabel={unitLabel}
          tenantName={tenantName}
          tenancyId={tId}
          tenancyStart={tenancy.start_date}
          tenancyEnded={tenancy.status === "ended"}
          charges={open}
          currentCharge={current ?? null}
          canConfirm={ws.can_confirm}
          evidenceRequired={property.evidence_policy === "required"}
          periodTotals={summary ? { billed: summary.billed, settled: summary.settled, label: formatPeriod(period) } : null}
          today={currentPeriod()}
          existing={
            entry
              ? {
                  id: entry.id,
                  ref: entry.ref,
                  version: entry.version,
                  clientRequestId: entry.client_request_id,
                  amount: Number(entry.amount),
                  paidOn: entry.paid_on,
                  method: entry.method,
                  reference: entry.reference,
                  notes: entry.notes,
                  allocations: entry.proposed_allocations.map((a) => ({ chargeId: a.charge_id, amount: Number(a.amount) })),
                  attachments: (attachments ?? []) as Array<{ id: string; file_name: string; mime_type: string; size_bytes: number; created_at: string }>,
                }
              : null
          }
        />
      )}
    </div>
  );
}
