"use client";

import { useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

const EVERY_MS = 60_000;

/**
 * Records that the signed-in person is using the app (for "Online" and "Active 5 min ago" in
 * conversations). Only while the tab is in view; the server keeps at most one write per 30 s.
 */
export function ActivityPing() {
  useEffect(() => {
    const supabase = getBrowserClient();
    const ping = () => {
      if (document.visibilityState === "visible") void supabase.rpc("touch_activity");
    };
    ping();
    const timer = setInterval(ping, EVERY_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);
  return null;
}
