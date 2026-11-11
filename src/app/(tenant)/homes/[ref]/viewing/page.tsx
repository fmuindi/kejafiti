import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ViewingRequestForm } from "@/components/messaging/viewing-request";
import { getSessionUser } from "@/lib/auth";
import { formatAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/shell/back-link";

export const metadata: Metadata = { title: "Request a viewing" };

// The chosen time is held in the URL, so signing in returns here with it intact.
export default async function ViewingPage({ params, searchParams }: PageProps<"/homes/[ref]/viewing">) {
  const { ref } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_listing", { p_ref: ref });
  const l = data as unknown as { id?: string; title: string | null; rent_amount: number; advertiser?: { name: string } } | null;
  if (!l?.id) notFound();
  const user = await getSessionUser();
  return (
    <div className="mx-auto flex max-w-narrow flex-col gap-5 px-4 pt-5 pb-10">
      <BackLink href={`/homes/${ref}`}>The home</BackLink>
      <h1 className="heading-page">Request a viewing</h1>
      <p className="text-label text-muted">
        {l.title} · KES {formatAmount(l.rent_amount)} · with {l.advertiser?.name}
      </p>
      <ViewingRequestForm
        refId={ref}
        signedIn={!!user}
        initialTime={typeof sp.time === "string" ? sp.time : ""}
        initialNote={typeof sp.note === "string" ? sp.note : ""}
      />
    </div>
  );
}
