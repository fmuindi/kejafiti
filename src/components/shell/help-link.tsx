"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Help link that tells support which page the person was on (IMP-19). */
export function HelpLink({ className, children }: { className?: string; children: ReactNode }) {
  const path = usePathname();
  return (
    <Link href={path && path !== "/help" ? `/help?from=${encodeURIComponent(path)}` : "/help"} className={className}>
      {children}
    </Link>
  );
}
