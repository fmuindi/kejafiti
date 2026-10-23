"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSearch } from "@/app/(tenant)/actions";
import { Icon } from "@/components/ui/icon";

// Saving a search stores the filters with a daily alert: new matching homes arrive in Updates
// and, unless the person turned it off in Account, by email. Saved can change the pace.
export function SaveSearchButton({ label, query, signedIn }: { label: string; query: string; signedIn: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");

  if (state === "saved") {
    return (
      <span role="status" className="inline-flex items-center gap-1 text-label font-semibold text-success">
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
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control border border-line bg-surface px-3 text-label font-semibold"
    >
      <Icon name="bell" size={18} />
      <span className="hidden sm:inline">{state === "error" ? "Try again" : "Save search"}</span>
      <span className="sr-only sm:hidden">Save search</span>
    </button>
  );
}
