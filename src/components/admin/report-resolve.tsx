"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resolveReport } from "@/app/admin/actions";
import { TextInput } from "@/components/ui/form";
import { Button } from "@/components/ui/primitives";

export function ReportResolve({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const act = (s: "reviewing" | "resolved" | "dismissed") => start(async () => { await resolveReport(reportId, s, note); router.refresh(); });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution note" aria-label="Resolution note" className="min-w-0 flex-1" />
      <Button size="sm" variant="secondary" pending={pending} onClick={() => act("reviewing")}>Reviewing</Button>
      <Button size="sm" pending={pending} onClick={() => act("resolved")}>Resolved</Button>
      <Button size="sm" variant="quiet" pending={pending} onClick={() => act("dismissed")}>Dismiss</Button>
    </div>
  );
}
