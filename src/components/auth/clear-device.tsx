"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { clearDeviceDataFor } from "@/lib/device-drafts";

// Shared phones: remove this person's recent searches and unsent drafts from this device.
// Other accounts' drafts on the same browser are left alone.
export function ClearDeviceData({ userId }: { userId: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          clearDeviceDataFor(userId);
          setDone(true);
        }}
      >
        Clear my searches and drafts on this device
      </Button>
      {done ? <span role="status" className="text-[13.5px] font-semibold text-success">Cleared</span> : null}
    </div>
  );
}
