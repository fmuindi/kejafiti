"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";

// Shared phones: remove recent searches and unsent drafts stored on this device.
export function ClearDeviceData() {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          try {
            for (const k of Object.keys(window.localStorage)) if (k.startsWith("nyumbani.")) window.localStorage.removeItem(k);
          } catch {
            /* storage unavailable */
          }
          setDone(true);
        }}
      >
        Clear searches and drafts on this device
      </Button>
      {done ? <span role="status" className="text-[13.5px] font-semibold text-success">Cleared</span> : null}
    </div>
  );
}
