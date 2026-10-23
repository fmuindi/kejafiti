import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Logo } from "@/components/ui/icon";
import { getSessionUser } from "@/lib/auth";
import { PHONE_AUTH_ENABLED } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const REASONS: Record<string, { title: string; body: string }> = {
  viewing: {
    title: "Sign in to request this viewing",
    body: "So the advertiser can confirm with you, and you can track it. The time you picked is kept.",
  },
  message: { title: "Sign in to message the advertiser", body: "Your conversation stays in one place, with the listing attached." },
  save: { title: "Sign in to save homes", body: "Saved homes sync across your devices. Your search is kept." },
  save_search: { title: "Sign in to save this search", body: "We'll keep your filters and tell you about new matches." },
  report: { title: "Sign in to report a listing", body: "So our team can follow up with you if needed." },
  invite: { title: "Sign in to accept your invitation", body: "Use the email address the invitation was sent to." },
  workspace: { title: "Sign in to your workspace", body: "Manage listings, enquiries and rent records." },
};

/**
 * Only same-site relative paths are allowed as a return destination. Without one, sign-in
 * goes to /auth/continue, which picks the person's workspace, admin centre or home search.
 */
function safeNext(next: string | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/auth/continue";
  return next;
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  if (await getSessionUser()) redirect(next);
  const reason = typeof sp.reason === "string" ? REASONS[sp.reason] : undefined;
  const copy = reason ?? { title: "Sign in or create an account", body: "We'll email you a 6-digit code. No password needed." };

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-[460px] flex-col px-4 pt-5 pb-10">
      <Link href="/" aria-label="nyumbani home" className="self-start">
        <Logo />
      </Link>
      <h1 className="mt-8 font-display text-[2rem] leading-[1.05] font-bold tracking-[-1px]">{copy.title}</h1>
      <p className="mt-2 text-[0.9375rem] text-muted">{copy.body}</p>
      <SignInForm next={next} phoneEnabled={PHONE_AUTH_ENABLED} />
      <Link href={next === "/" || next === "/auth/continue" ? "/" : "/search"} className="mt-4 inline-flex min-h-11 items-center justify-center text-center text-[0.9375rem] font-semibold underline">
        Keep browsing without an account
      </Link>
      <p className="mt-auto pt-10 text-[0.78125rem] text-muted">
        By continuing you agree to the <Link href="/legal/terms" className="underline">Terms</Link> and{" "}
        <Link href="/legal/privacy" className="underline">Privacy notice</Link>. On a shared phone, sign out when you&apos;re done.
      </p>
    </main>
  );
}
