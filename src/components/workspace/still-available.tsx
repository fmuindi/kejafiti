"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmStillAvailable } from "@/app/w/[orgId]/listings/actions";
import { Button } from "@/components/ui/primitives";

export function StillAvailableButton({ orgId, listingIds, label = "Still available" }: { orgId: string; listingIds: string[]; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  if (result) return <span role="status" className="text-[0.84375rem] font-semibold text-success">{result}</span>;
  return (
    <Button
      size="sm"
      pending={pending}
      disabled={listingIds.length === 0}
      onClick={() =>
        start(async () => {
          const r = await confirmStillAvailable(orgId, listingIds);
          if (!r.ok) return setResult(r.message);
          const ok = r.data.filter((x) => x.ok).length;
          setResult(ok === listingIds.length ? "Confirmed today" : `${ok} of ${listingIds.length} confirmed`);
          router.refresh();
        })
      }
    >
      {label}
    </Button>
  );
}
