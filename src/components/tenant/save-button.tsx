"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toggleSaved } from "@/app/(tenant)/actions";
import { cx } from "@/components/ui/primitives";

export function SaveButton({
  refId,
  saved,
  signedIn,
  returnTo,
  className,
}: {
  refId: string;
  saved: boolean;
  signedIn: boolean;
  returnTo: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(saved);

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? "Saved. Remove from saved homes" : "Save this home"}
      disabled={pending}
      onClick={() => {
        if (!signedIn) {
          router.push(`/sign-in?next=${encodeURIComponent(returnTo)}&reason=save`);
          return;
        }
        start(async () => {
          setOptimistic(!optimistic);
          const res = await toggleSaved(refId, !optimistic);
          if (!res.ok) router.refresh();
        });
      }}
      className={cx(
        "relative z-10 grid size-11 place-items-center rounded-full border border-line bg-surface",
        optimistic ? "text-primary" : "text-ink",
        className,
      )}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
          fill={optimistic ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only">{pending ? "Saving" : ""}</span>
    </button>
  );
}
