"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptTenantAccess } from "@/app/tenant-invite/actions";
import { Button, Notice } from "@/components/ui/primitives";

export function AcceptTenantAccess({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
      <Button
        size="lg"
        pending={pending}
        pendingLabel="Opening"
        onClick={() =>
          start(async () => {
            const r = await acceptTenantAccess(token);
            if (!r.ok) return setError(r.message);
            router.replace("/my-rent");
            router.refresh();
          })
        }
      >
        Open my tenancy
      </Button>
    </div>
  );
}
