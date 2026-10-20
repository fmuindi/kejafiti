"use client";

import { Button } from "@/components/ui/primitives";

export function PrintButton({ label = "Save as PDF" }: { label?: string }) {
  return (
    <Button icon="file" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
