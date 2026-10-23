"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateCharges, setAutoCharges } from "@/app/w/[orgId]/rent/actions";
import { Checkbox } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";
import { formatPeriod } from "@/lib/dates";

export function ChargesActions({
  orgId,
  propertyId,
  period,
  count,
  canCreate,
  autoCharges,
  canToggleAuto,
}: {
  orgId: string;
  propertyId: string;
  period: string;
  count: number;
  canCreate: boolean;
  autoCharges: boolean;
  canToggleAuto: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [auto, setAuto] = useState(autoCharges);

  return (
    <div className="flex flex-col gap-4">
      {msg ? <Notice tone={msg.tone} role="status">{msg.text}</Notice> : null}
      {canCreate && count > 0 ? (
        <Button
          size="lg"
          pending={pending}
          pendingLabel="Creating"
          onClick={() =>
            start(async () => {
              const r = await generateCharges(orgId, propertyId, period);
              setMsg(r.ok ? { tone: "success", text: `${r.data.created} ${formatPeriod(period)} charge${r.data.created === 1 ? "" : "s"} created.` } : { tone: "error", text: r.message });
              router.refresh();
            })
          }
        >
          Create {count} charge{count === 1 ? "" : "s"}
        </Button>
      ) : null}
      {canToggleAuto ? (
        <div className="surface p-4">
          <Checkbox
            checked={auto}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              setAuto(next);
              start(async () => {
                const r = await setAutoCharges(orgId, propertyId, next);
                if (!r.ok) {
                  setAuto(!next);
                  setMsg({ tone: "error", text: r.message });
                }
              });
            }}
            label="Create each month's rent charges automatically"
            description="Runs daily (needs pg_cron, enabled on Supabase). Turn this on only after you've reviewed a month's charges here."
          />
        </div>
      ) : null}
    </div>
  );
}
