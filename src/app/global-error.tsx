"use client";

import { useEffect } from "react";
import "./globals.css";

// Last-resort boundary: replaces the root layout when the layout itself fails, so it renders its
// own document. Plain markup and the global styles only; nothing here may depend on app data.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en-KE">
      <body className="min-h-dvh antialiased">
        <title>Something went wrong · KejaFiti</title>
        <main role="alert" className="mx-auto flex max-w-narrow flex-col items-start gap-4 px-4 py-12">
          <h1 className="heading-page">KejaFiti didn&apos;t load</h1>
          <p className="text-body text-muted">
            Check your connection and try again. Nothing you already saved was lost.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => reset()} className="rounded-control bg-ink px-4 py-3 text-white">
              Try again
            </button>
            {/* A full page load, not client navigation: the app shell is what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="rounded-control border border-line px-4 py-3">
              Go to the home page
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
