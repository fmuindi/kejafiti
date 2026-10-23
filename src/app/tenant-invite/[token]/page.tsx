import type { Metadata } from "next";
import Link from "next/link";
import { AcceptTenantAccess } from "@/components/tenant/accept-tenant-access";
import { Logo } from "@/components/ui/icon";
import { ButtonLink, Notice } from "@/components/ui/primitives";
import { getSessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your tenancy online", robots: { index: false } };

type Preview = {
  state: "pending" | "expired" | "invalid";
  org_name?: string;
  property_name?: string;
  unit_label?: string;
  name?: string;
  email_hint?: string;
  expires_at?: string;
};

// The link a landlord or agent sends so a tenant can see their own rent records (tenant self-view).
export default async function TenantInvitePage({ params }: PageProps<"/tenant-invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("tenant_access_preview", { p_token: token });
  const p = (data ?? { state: "invalid" }) as Preview;
  const user = await getSessionUser();
  const next = `/tenant-invite/${token}`;

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-[520px] flex-col gap-6 px-4 pt-5 pb-10">
      <Link href="/" aria-label="nyumbani home" className="self-start">
        <Logo />
      </Link>
      {p.state === "pending" ? (
        <>
          <div>
            <h1 className="font-display text-[2rem] leading-[1.05] font-bold tracking-[-1px]">Your tenancy, online</h1>
            <p className="mt-2 text-[0.9375rem] text-muted">
              {p.name ? `${p.name}, ` : ""}<strong className="text-ink">{p.org_name}</strong> has shared your rent records with you. See your
              balance and statement any time; payments show once they&apos;re confirmed.
            </p>
          </div>
          <dl className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-4 text-[0.90625rem]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Home</dt>
              <dd className="text-right font-semibold">{[p.property_name, p.unit_label ? `Unit ${p.unit_label}` : null].filter(Boolean).join(" · ")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Link for</dt>
              <dd className="font-mono">{p.email_hint}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Expires</dt>
              <dd>{formatDate(p.expires_at)}</dd>
            </div>
          </dl>
          {user ? (
            <AcceptTenantAccess token={token} />
          ) : (
            <>
              <ButtonLink href={`/sign-in?next=${encodeURIComponent(next)}`} size="lg">
                Sign in with {p.email_hint} to continue
              </ButtonLink>
              <p className="text-[0.8125rem] text-muted">New to nyumbani? Signing in with that email creates your account.</p>
            </>
          )}
        </>
      ) : (
        <>
          <h1 className="font-display text-[1.875rem] font-bold">{p.state === "expired" ? "This link has expired" : "This link isn't valid"}</h1>
          <Notice tone="info">
            {p.state === "expired"
              ? "Ask your landlord or agent to send a new one."
              : "It may have been used already or replaced by a newer link. If you opened it before, your tenancy is in My rent."}
          </Notice>
          <ButtonLink href={user ? "/my-rent" : "/sign-in?next=%2Fmy-rent"} variant="secondary" size="lg">
            {user ? "Go to My rent" : "Sign in"}
          </ButtonLink>
        </>
      )}
    </main>
  );
}
