"use client";

import { Button } from "@/components/ui/primitives";

export function PrintButton() {
  return (
    <Button icon="file" onClick={() => window.print()}>
      Save as PDF
    </Button>
  );
}
