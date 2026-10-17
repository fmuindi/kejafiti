"use client";

import { useEffect } from "react";
import { rememberSearch } from "./recent-searches";

export function RememberSearch({ label, query }: { label: string; query: string }) {
  useEffect(() => {
    if (query) rememberSearch({ label, query });
  }, [label, query]);
  return null;
}
