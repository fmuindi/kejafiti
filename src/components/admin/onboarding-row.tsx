"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateOnboarding } from "@/app/admin/actions";
import { TextInput } from "@/components/ui/form";
import { Button, StatusBadge } from "@/components/ui/primitives";
import { formatDate, timeAgo, todayEAT } from "@/lib/dates";

type Org = {
  org_id: string; name: string; kind: string; advertiser_role: string; onboarding_status: string; onboarding_note: string | null;
  assignee_name: string | null; assignee_id: string | null; created_at: string; owner_name: string | null; owner_email: string | null;
  owner_phone: string | null; identity_checked_at: string | null; authority_checked_at: string | null; property_count: number; listing_count: number;
};

const TONE: Record<string, "success" | "waiting" | "error" | "neutral"> = { new: "waiting", in_review: "waiting", approved: "success", changes_needed: "error", rejected: "neutral" };

export function OnboardingRow({ org }: { org: Org }) {
  const router = useRouter();
  const [note, setNote] = useState(org.onboarding_note ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (input: Parameters<typeof updateOnboarding>[1]) =>
    start(async () => {
      const r = await updateOnboarding(org.org_id, { note, ...input });
      setMsg(r.ok ? "Saved" : r.message);
      router.refresh();
    });
  return (
    <article className="surface flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{org.name} · {org.kind === "agency" ? "agency" : "landlord"}</p>
          <p className="text-caption text-muted">{org.owner_name} · {org.owner_email}{org.owner_phone ? ` · ${org.owner_phone}` : ""} · registered {timeAgo(org.created_at)}</p>
          <p className="text-caption text-muted">{org.property_count} properties · {org.listing_count} listings{org.assignee_name ? ` · owner: ${org.assignee_name}` : " · unassigned"}</p>
        </div>
        <StatusBadge tone={TONE[org.onboarding_status] ?? "neutral"}>{org.onboarding_status.replace("_", " ")}</StatusBadge>
      </div>
      <p className="text-label">
        Identity checked: <strong>{org.identity_checked_at ? formatDate(org.identity_checked_at) : "no"}</strong> · Authority to advertise checked: <strong>{org.authority_checked_at ? formatDate(org.authority_checked_at) : "no"}</strong>
      </p>
      <label className="flex flex-col gap-1 text-caption font-semibold">
        Internal note
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </label>
      <div className="flex flex-wrap gap-2">
        {!org.assignee_id ? <Button size="sm" variant="secondary" pending={pending} onClick={() => act({ assignToMe: true, status: "in_review" })}>Assign to me</Button> : null}
        <Button size="sm" variant="secondary" pending={pending} onClick={() => act({ identityChecked: todayEAT() })}>Record identity check today</Button>
        <Button size="sm" variant="secondary" pending={pending} onClick={() => act({ authorityChecked: todayEAT() })}>Record authority check today</Button>
        <Button size="sm" pending={pending} onClick={() => act({ status: "approved" })}>Approve</Button>
        <Button size="sm" variant="quiet" pending={pending} onClick={() => act({ status: "changes_needed" })}>Changes needed</Button>
      </div>
      {msg ? <p role="status" className="text-caption font-semibold">{msg}</p> : null}
    </article>
  );
}
