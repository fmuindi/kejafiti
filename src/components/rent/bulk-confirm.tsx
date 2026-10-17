"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmEntries } from "@/app/w/[orgId]/rent/actions";
import { Checkbox } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";
import { formatMoney, sumAmounts } from "@/lib/money";

// Confirm several entries at once, only after checking each externally. Shows unit count,
// individual amounts, total and periods before applying; reports individual failures.
export function BulkConfirm({ orgId, entries }: { orgId: string; entries: Array<{ id: string; ref: string; unitLabel: string; amount: number; periods: string[] }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ack, setAck] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; ok: boolean; error?: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const chosen = entries.filter((e) => selected.has(e.id));
  const total = sumAmounts(chosen.map((e) => e.amount));

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="self-start">
        Confirm several at once
      </Button>
    );
  }
  return (
    <section aria-labelledby="bulk" className="flex flex-col gap-3 rounded-[20px] border border-ink bg-surface p-4">
      <h2 id="bulk" className="font-semibold">
        Confirm several entries
      </h2>
      <ul className="flex flex-col gap-1">
        {entries.map((e) => (
          <li key={e.id}>
            <Checkbox
              checked={selected.has(e.id)}
              onChange={(ev) => {
                const n = new Set(selected);
                if (ev.target.checked) n.add(e.id);
                else n.delete(e.id);
                setSelected(n);
              }}
              label={`${e.unitLabel} · ${formatMoney(e.amount)}`}
              description={`${e.ref} · ${e.periods.join(", ") || "tenant credit"}`}
            />
          </li>
        ))}
      </ul>
      {chosen.length ? (
        <p className="rounded-[12px] bg-cool p-3 text-[14px]">
          <strong>{chosen.length}</strong> unit{chosen.length === 1 ? "" : "s"} · total <strong>{formatMoney(total)}</strong> · periods:{" "}
          {[...new Set(chosen.flatMap((c) => c.periods))].join(", ") || "credit"}
        </p>
      ) : null}
      <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} label="I have checked each of these payments using our property's external records and confirm the entries are accurate." />
      {error ? <p role="alert" className="text-[14px] font-semibold text-error">{error}</p> : null}
      {results ? (
        <Notice tone={results.every((r) => r.ok) ? "success" : "waiting"} role="status" title={`${results.filter((r) => r.ok).length} confirmed, ${results.filter((r) => !r.ok).length} not confirmed`}>
          <ul className="list-disc pl-5">
            {results.filter((r) => !r.ok).map((r) => (
              <li key={r.id}>
                {entries.find((e) => e.id === r.id)?.ref}: {r.error}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1">
          Cancel
        </Button>
        <Button
          className="flex-[1.5]"
          disabled={!chosen.length}
          pending={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              if (!ack) {
                setError("Tick the box to confirm you checked these payments externally.");
                return;
              }
              const res = await confirmEntries(orgId, chosen.map((c) => c.id), true);
              if (!res.ok) {
                setError(res.message);
                return;
              }
              setResults(res.data);
              router.refresh();
            })
          }
        >
          Confirm {chosen.length || ""} {chosen.length ? `· ${formatMoney(total)}` : ""}
        </Button>
      </div>
    </section>
  );
}
