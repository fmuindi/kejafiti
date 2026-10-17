"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInvitation } from "@/app/invite/actions";
import { Button, Notice } from "@/components/ui/primitives";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
      <Button
        size="lg"
        pending={pending}
        pendingLabel="Joining"
        onClick={() =>
          start(async () => {
            const r = await acceptInvitation(token);
            if (!r.ok) return setError(r.message);
            router.replace(`/w/${r.data.orgId}`);
            router.refresh();
          })
        }
      >
        Accept and open workspace
      </Button>
    </div>
  );
}
