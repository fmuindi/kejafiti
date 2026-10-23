"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adjustCharge } from "@/app/w/[orgId]/rent/actions";
import { MoneyInput, TextInput } from "@/components/ui/form";
import { Button } from "@/components/ui/primitives";
import { formatMoney, parseAmount } from "@/lib/money";

// Waivers, prorating and voids are explicit decisions with a reason; the charge itself is
// never edited.
export function ChargeAdjust({ orgId, propertyId, chargeId, max }: { orgId: string; propertyId: string; chargeId: string; max: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>
        Adjust
      </Button>
    );
  }
  return (
    <form
      className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end"
      action={(fd) =>
        start(async () => {
          const amount = parseAmount(fd.get("reduce"));
          if (!amount || !Number.isFinite(amount) || amount > max) return setError(`Enter up to ${formatMoney(max)}.`);
          const res = await adjustCharge(orgId, propertyId, chargeId, amount, String(fd.get("reason") ?? ""));
          if (!res.ok) return setError(res.message);
          setOpen(false);
          router.refresh();
        })
      }
    >
      <label className="flex flex-col gap-1 text-[0.8125rem] font-semibold">
        Reduce by
        <MoneyInput name="reduce" className="min-h-11" />
      </label>
      <label className="flex flex-col gap-1 text-[0.8125rem] font-semibold">
        Reason
        <TextInput name="reason" required minLength={3} maxLength={200} className="min-h-11" />
      </label>
      <Button type="submit" size="sm" pending={pending}>
        Save
      </Button>
      <Button type="button" size="sm" variant="quiet" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error ? <p role="alert" className="text-[0.8125rem] font-semibold text-error">{error}</p> : null}
    </form>
  );
}
