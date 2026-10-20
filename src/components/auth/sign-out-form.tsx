"use client";

import type { ReactNode } from "react";
import { clearDeviceDataFor } from "@/lib/device-drafts";

// Shared devices: signing out removes this person's unsent drafts and recent searches from
// the browser before the session ends. Work already saved to the workspace is unaffected.
export function SignOutForm({ userId, children }: { userId: string; children: ReactNode }) {
  return (
    <form action="/auth/sign-out" method="post" onSubmit={() => clearDeviceDataFor(userId)}>
      {children}
    </form>
  );
}
