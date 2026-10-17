import type { Metadata } from "next";
import Link from "next/link";
import { AcceptInvite } from "@/components/team/accept-invite";
import { Logo } from "@/components/ui/icon";
import { ButtonLink, Notice } from "@/components/ui/primitives";
import { getSessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/rent/status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Accept invitation", robots: { index: false } };

type Preview = {
  state: "pending" | "expired" | "used" | "invalid";
  org_name?: string;
  role?: string;
  display_name?: string;
  email_hint?: string;
  expires_at?: string;
  properties?: string[];
  can_confirm?: boolean;
};

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("invitation_preview", { p_token: token });
  const p = (data ?? { state: "invalid" }) as Preview;
  const user = await getSessionUser();
  const next = `/invite/${token}`;

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-[520px] flex-col gap-6 px-4 pt-5 pb-10">
      <Link href="/" aria-label="nyumbani home" className="self-start">
        <Logo />
      </Link>
      {p.state === "pending" ? (
        <>
          <div>
            <h1 className="font-display text-[32px] leading-[1.05] font-bold tracking-[-1px]">Join {p.org_name}</h1>
            <p className="mt-2 text-[15px] text-muted">
              {p.display_name}, you&apos;re invited as <strong className="text-ink">{ROLE_LABEL[p.role ?? ""] ?? p.role}</strong>.
            </p>
          </div>
          <dl className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-4 text-[14.5px]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Properties</dt>
              <dd className="text-right font-semibold">{p.properties?.length ? p.properties.join(", ") : "All properties"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Can confirm rent records</dt>
              <dd className="font-semibold">{p.can_confirm ? "Yes" : "No"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Invitation for</dt>
              <dd className="font-mono">{p.email_hint}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Expires</dt>
              <dd>{formatDate(p.expires_at)}</dd>
            </div>
          </dl>
          {user ? (
            <AcceptInvite token={token} />
          ) : (
            <>
              <ButtonLink href={`/sign-in?next=${encodeURIComponent(next)}&reason=invite`} size="lg">
                Sign in with {p.email_hint} to accept
              </ButtonLink>
              <p className="text-[13px] text-muted">
                New to nyumbani? Signing in with that email creates your account. You set your own sign-in; the person who invited you
                never sees it.
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <h1 className="font-display text-[30px] font-bold">
            {p.state === "expired" ? "This invitation has expired" : p.state === "used" ? "This invitation was already used" : "This invitation link isn't valid"}
          </h1>
          <Notice tone="info">
            {p.state === "expired"
              ? "Ask the person who invited you to resend it. A new link replaces this one."
              : p.state === "used"
                ? "If you accepted it, sign in to open your workspace."
                : "Check that you used the full link from the most recent invitation, or ask for a new one."}
          </Notice>
          <ButtonLink href={user ? "/account" : "/sign-in"} variant="secondary" size="lg">
            {user ? "Go to my account" : "Sign in"}
          </ButtonLink>
        </>
      )}
    </main>
  );
}
