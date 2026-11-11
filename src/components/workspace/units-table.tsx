"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmStillAvailable } from "@/app/w/[orgId]/listings/actions";
import { bulkPause } from "@/app/w/[orgId]/properties/actions";
import { Button, Notice, StatusBadge, cx } from "@/components/ui/primitives";
import { layoutLabel } from "@/lib/listing/catalog";
import { daysSince, formatDate } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { OCCUPANCY, type Occupancy } from "@/lib/rent/status";

export type UnitRow = {
  id: string;
  label: string;
  layout: string;
  bedrooms: number | null;
  rent: number | null;
  occupancy: string;
  occupancyDate: string | null;
  listing: null | { id: string; status: string; confirmedAt: string | null; ref: string; enquiries: number };
};

const LISTING: Record<string, { text: string; tone: "success" | "waiting" | "error" | "neutral" }> = {
  draft: { text: "Draft", tone: "neutral" },
  under_review: { text: "Under review", tone: "waiting" },
  published: { text: "Published", tone: "success" },
  paused: { text: "Paused", tone: "neutral" },
  needs_correction: { text: "Needs correction", tone: "error" },
};

// Occupancy and listing publication are separate columns; selecting rows enables explicit
// bulk actions with a per-unit result.
export function UnitsTable({ orgId, propertyId, rows, canListings, canTenancies }: { orgId: string; propertyId: string; rows: UnitRow[]; canListings: boolean; canTenancies: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sorted = [...rows].sort((a, b) => Number(b.occupancy === "vacant") - Number(a.occupancy === "vacant") || a.label.localeCompare(b.label));
  const selectable = sorted.filter((r) => r.listing && ["published", "paused"].includes(r.listing.status));
  const chosen = selectable.filter((r) => selected.has(r.id));

  return (
    <section aria-labelledby="units" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="units" className="heading-section">Units</h2>
        {canListings && chosen.length ? (
          <div className="flex flex-wrap items-center gap-2 rounded-control bg-ink p-1.5 text-white">
            <span className="px-2 text-label font-semibold">{chosen.length} selected</span>
            <Button size="sm" variant="secondary" pending={pending} onClick={() => start(async () => {
              const r = await confirmStillAvailable(orgId, chosen.map((c) => c.listing!.id));
              setResult(r.ok ? `${r.data.filter((x) => x.ok).length} of ${chosen.length} confirmed still available` : r.message);
              setSelected(new Set());
              router.refresh();
            })}>Confirm still available</Button>
            <Button size="sm" variant="dark" className="border border-white/40" pending={pending} onClick={() => start(async () => {
              const r = await bulkPause(orgId, chosen.filter((c) => c.listing!.status === "published").map((c) => c.listing!.id));
              setResult(r.ok ? `${r.data.ok} paused${r.data.failed ? `, ${r.data.failed} not paused` : ""}` : r.message);
              setSelected(new Set());
              router.refresh();
            })}>Pause listings</Button>
          </div>
        ) : null}
      </div>
      {result ? <Notice tone="success" role="status">{result}</Notice> : null}
      {rows.length === 0 ? (
        <p className="surface-empty p-6 text-center">No units yet. Add them below.</p>
      ) : (
        <div className="surface overflow-x-auto" tabIndex={0} role="region" aria-label="Units (scrolls sideways)">
          <table className="w-full min-w-[720px] text-body">
            <caption className="sr-only">Units, occupancy and listing status</caption>
            <thead>
              <tr className="border-b border-line text-left font-mono text-micro tracking-caps text-muted uppercase">
                <th scope="col" className="w-10 px-3 py-2.5"><span className="sr-only">Select</span></th>
                <th scope="col" className="px-3 py-2.5 font-medium">Unit</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Layout</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Rent KES</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Occupancy</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Listing</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Confirmed</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const age = daysSince(r.listing?.confirmedAt);
                const stale = r.listing?.status === "published" && (age ?? 99) > 10;
                const canSelect = selectable.includes(r);
                const ls = r.listing ? LISTING[r.listing.status] : null;
                return (
                  <tr key={r.id} className={cx("border-b border-divider last:border-0", selected.has(r.id) && "bg-pink")}>
                    <td className="px-3 py-3">
                      {canSelect && canListings ? (
                        <input type="checkbox" aria-label={`Select unit ${r.label}`} checked={selected.has(r.id)} onChange={(e) => { const n = new Set(selected); if (e.target.checked) n.add(r.id); else n.delete(r.id); setSelected(n); }} className="size-5 accent-primary" />
                      ) : null}
                    </td>
                    <td className="px-3 py-3 font-mono font-medium">{r.label}</td>
                    <td className="px-3 py-3">{layoutLabel(r)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.rent ? formatAmount(r.rent) : "—"}</td>
                    <td className="px-3 py-3">{OCCUPANCY[r.occupancy as Occupancy]}{r.occupancyDate && r.occupancy !== "occupied" ? ` · ${formatDate(r.occupancyDate, { year: false })}` : ""}</td>
                    <td className="px-3 py-3">{ls ? <StatusBadge tone={ls.tone}>{ls.text}</StatusBadge> : <span className="text-muted">Not listed</span>}</td>
                    <td className={cx("px-3 py-3", stale && "font-semibold text-waiting")}>
                      {r.listing?.confirmedAt ? `${formatDate(r.listing.confirmedAt, { year: false })}${stale ? " · reconfirm" : ""}` : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-3 text-label font-semibold">
                        {r.listing && canListings ? (
                          <Link href={`/w/${orgId}/listings/${r.listing.id}`} className="link-action">
                            {r.listing.status === "draft" ? "Finish draft" : r.listing.status === "needs_correction" ? "Fix listing" : "Listing"}
                          </Link>
                        ) : canListings && r.occupancy !== "occupied" ? (
                          <Link href={`/w/${orgId}/listings/new?unit=${r.id}`} className="link-action">List it</Link>
                        ) : null}
                        {r.listing?.enquiries ? <Link href={`/w/${orgId}/enquiries`} className="text-waiting underline">{r.listing.enquiries} enquir{r.listing.enquiries === 1 ? "y" : "ies"}</Link> : null}
                        <Link href={`/w/${orgId}/rent/${propertyId}/units/${r.id}`} className="link-action">{canTenancies ? "Tenancy" : "Rent"}</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
