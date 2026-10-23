"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteSavedSearch } from "@/app/(tenant)/actions";
import { Button } from "@/components/ui/primitives";

export function DeleteSavedSearch({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="quiet" icon="trash" aria-label="Remove saved search" title="Remove" pending={pending} onClick={() => start(async () => { await deleteSavedSearch(id); router.refresh(); })} />
  );
}
