"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { inviteTenants } from "@/app/w/[orgId]/rent/actions";
import { SendToTenants } from "@/components/rent/send-to-tenants";
import { Icon } from "@/components/ui/icon";
import { Button, EmptyState, InlineError, Notice, StatusBadge, cx } from "@/components/ui/primitives";
import { formatDate, timeAgo } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { KIND_LABEL, SKIP_REASON, type MessageKind } from "@/lib/tenant-messages";

export type TenantRow = {
  tenancy_id: string;
  status: "active" | "ended";
  start_date: string;
  end_date: string | null;
  unit_id: string;
  unit_label: string;
  tenant_id: string;
  tenant_name: string;
  email: string | null;
  phone: string | null;
  access: "linked" | "invited" | "none";
  balance: number;
  last_message_at: string | null;
  last_message_kind: MessageKind | null;
};

type Filter = "current" | "owing" | "no_email" | "offline" | "former";
const FILTERS: Array<{ key: Filter; label: string; test: (r: TenantRow) => boolean }> = [
  { key: "current", label: "Current", test: (r) => r.status === "active" },
  { key: "owing", label: "Owe rent", test: (r) => r.balance > 0 },
  { key: "no_email", label: "No email", test: (r) => r.status === "active" && !r.email },
  { key: "offline", label: "Not online yet", test: (r) => r.status === "active" && r.access !== "linked" },
  { key: "former", label: "Former", test: (r) => r.status === "ended" },
];

/** Every tenant of a property: contact, online access, balance and when they were last contacted. */
export function TenantsBoard({
  orgId,
  propertyId,
  rows,
  periods,
  defaultPeriod,
  canManage,
}: {
  orgId: string;
  propertyId: string;
  rows: TenantRow[];
  periods: string[];
  defaultPeriod: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("current");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composing, setComposing] = useState(false);
  const [inviting, startInvite] = useTransition();
  const [invite, setInvite] = useState<{ title: string; skipped: string[]; ok: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => rows.filter(FILTERS.find((f) => f.key === filter)!.test), [rows, filter]);
  const chosen = rows.filter((r) => selected.has(r.tenancy_id));
  const allOn = visible.length > 0 && visible.every((r) => selected.has(r.tenancy_id));

  const choose = (f: Filter) => {
    setFilter(f);
    setSelected(new Set());
    setComposing(false);
  };
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const inviteChosen = () =>
    startInvite(async () => {
      setError(null);
      setInvite(null);
      const res = await inviteTenants(orgId, propertyId, [...new Set(chosen.map((r) => r.tenant_id))]);
      if (!res.ok) return setError(res.message);
      const n = res.data.sent;
      setInvite({
        title: n === 0 ? "No invitations sent." : n === 1 ? "1 tenant invited to see their records online." : `${n} tenants invited to see their records online.`,
        skipped: res.data.skipped.map((s) => `${s.name}: ${SKIP_REASON[s.reason] ?? "skipped"}`),
        ok: n > 0,
      });
      router.refresh();
    });

  const recipients = chosen.length === 1 ? chosen[0].tenant_name.split(" ")[0] : `${chosen.length} tenants`;

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n = rows.filter(f.test).length;
          const on = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => choose(f.key)}
              className={cx("min-h-10 rounded-full border-strong px-3.5 text-label font-semibold", on ? "border-ink bg-ink text-white" : "border-line bg-surface")}
            >
              {f.label} {n}
            </button>
          );
        })}
      </div>

      {canManage && visible.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="mr-2 inline-flex min-h-11 cursor-pointer items-center gap-2 text-label font-semibold">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={allOn}
              onChange={() => setSelected(allOn ? new Set() : new Set(visible.map((r) => r.tenancy_id)))}
            />
            {selected.size ? `${selected.size} selected` : "Select all"}
          </label>
          <Button size="sm" icon="mail" disabled={!selected.size} onClick={() => setComposing(true)}>
            Send invoice, reminder or message
          </Button>
          <Button size="sm" variant="secondary" icon="user" disabled={!selected.size} pending={inviting} onClick={inviteChosen}>
            Invite to see records online
          </Button>
        </div>
      ) : null}

      {error ? <InlineError>{error}</InlineError> : null}
      {invite ? (
        <Notice tone={invite.ok ? "success" : "waiting"} role="status" title={invite.title}>
          {invite.skipped.length ? (
            <>
              Not invited:
              <ul className="mt-1 list-disc pl-5">{invite.skipped.map((s) => <li key={s}>{s}</li>)}</ul>
            </>
          ) : null}
        </Notice>
      ) : null}

      {composing && chosen.length ? (
        <section aria-labelledby="compose-h" className="surface flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id="compose-h" className="heading-compact">Send to {recipients}</h2>
            <button type="button" aria-label="Close" onClick={() => setComposing(false)} className="grid size-11 place-items-center rounded-full hover:bg-cool">
              <Icon name="x" />
            </button>
          </div>
          <SendToTenants
            orgId={orgId}
            propertyId={propertyId}
            tenancyIds={chosen.map((r) => r.tenancy_id)}
            recipients={recipients}
            periods={periods}
            defaultPeriod={defaultPeriod}
          />
        </section>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState title={filter === "current" ? "No current tenants" : "Nobody here"} icon="user">
          {filter === "current" ? "Set up tenancies from the unit pages or import them from a spreadsheet." : "No tenants match this filter."}
        </EmptyState>
      ) : (
        <ul className="surface-list">
          {visible.map((r) => (
            <li key={r.tenancy_id} className="flex items-start gap-3 px-4 py-3">
              {canManage ? (
                <input
                  type="checkbox"
                  aria-label={`Select ${r.tenant_name}, unit ${r.unit_label}`}
                  className="mt-1 size-5 shrink-0 accent-primary"
                  checked={selected.has(r.tenancy_id)}
                  onChange={() => toggle(r.tenancy_id)}
                />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <Link href={`/w/${orgId}/rent/${propertyId}/units/${r.unit_id}`} className="font-semibold hover:underline">
                    {r.tenant_name}
                  </Link>
                  <p className="text-caption text-muted">
                    Unit {r.unit_label} · {r.status === "active" ? `since ${formatDate(r.start_date)}` : `ended ${formatDate(r.end_date)}`}
                  </p>
                  <p className={cx("truncate text-caption", r.email ? "text-muted" : "font-semibold text-waiting-strong")}>
                    {r.email ?? "No email on file"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
                  <span className={cx("text-label font-semibold tabular-nums", r.balance > 0 ? "text-error" : r.balance < 0 ? "text-success" : "text-muted")}>
                    {r.balance > 0 ? `Owes ${formatMoney(r.balance)}` : r.balance < 0 ? `Credit ${formatMoney(-r.balance)}` : "Paid up"}
                  </span>
                  {r.access === "linked" ? (
                    <StatusBadge tone="success">Online</StatusBadge>
                  ) : r.access === "invited" ? (
                    <StatusBadge tone="waiting">Link sent</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral" icon={null}>Not online</StatusBadge>
                  )}
                  <span className="text-caption text-muted">
                    {r.last_message_at && r.last_message_kind ? `${KIND_LABEL[r.last_message_kind]} ${timeAgo(r.last_message_at)}` : "Not contacted yet"}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
