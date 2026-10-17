"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateOnboarding } from "@/app/admin/actions";
import { Button } from "@/components/ui/primitives";

export function OnboardingQuick({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="secondary" pending={pending} onClick={() => start(async () => { await updateOnboarding(orgId, { assignToMe: true, status: "in_review" }); router.refresh(); })}>
      Assign to me
    </Button>
  );
}
