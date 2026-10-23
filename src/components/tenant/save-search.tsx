"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSearch } from "@/app/(tenant)/actions";
import { Icon } from "@/components/ui/icon";

// Saving a search stores the filters and an alert preference. Alerts are recorded in the
// in-app inbox; email/SMS digests need the delivery worker and a provider configured.
export function SaveSearchButton({ label, query, signedIn }: { label: string; query: string; signedIn: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");

  if (state === "saved") {
    return (
      <span role="status" className="inline-flex items-center gap-1 text-[0.84375rem] font-semibold text-success">
        <Icon name="check" size={16} strokeWidth={2.4} /> Search saved
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!signedIn) {
          router.push(`/sign-in?next=${encodeURIComponent(`/search?${query}`)}&reason=save_search`);
          return;
        }
        start(async () => {
          const res = await saveSearch(label, query, "daily");
          setState(res.ok ? "saved" : "error");
        });
      }}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[12px] border border-line bg-surface px-3 text-[0.875rem] font-semibold"
    >
      <Icon name="bell" size={18} />
      <span className="hidden sm:inline">{state === "error" ? "Try again" : "Save search"}</span>
      <span className="sr-only sm:hidden">Save search</span>
    </button>
  );
}
