"use client";

import { useEffect } from "react";
import { Button, ButtonLink, LoadingBlock } from "./primitives";

export function PageLoading({ label }: { label: string }) {
  return (
    <div className="mx-auto flex w-full max-w-standard flex-col gap-4 px-4 py-6">
      <div className="skeleton h-9 w-2/3" aria-hidden="true" />
      <LoadingBlock label={label} rows={4} />
    </div>
  );
}

// Errors never expose internals. The user's work in forms is kept on the device where it
// matters (payment entries, messages), so retrying is safe.
export function PageError({ error, reset, home = "/" }: { error: Error & { digest?: string }; reset: () => void; home?: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-narrow flex-col items-start gap-4 px-4 py-12">
      <h1 className="heading-page">This page didn&apos;t load</h1>
      <p className="text-body text-muted">
        Check your connection and try again. Nothing you already saved was lost.{error.digest ? ` Reference: ${error.digest}` : ""}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <ButtonLink href={home} variant="secondary">Go back</ButtonLink>
      </div>
    </div>
  );
}
