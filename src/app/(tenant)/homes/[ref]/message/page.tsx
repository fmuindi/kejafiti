import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { NewMessageForm } from "@/components/messaging/new-message";
import { requireUser } from "@/lib/auth";
import { formatAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/shell/back-link";

export const metadata: Metadata = { title: "Message the advertiser" };

export default async function NewMessagePage({ params }: PageProps<"/homes/[ref]/message">) {
  const { ref } = await params;
  const user = await requireUser(`/homes/${ref}/message`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_listing", { p_ref: ref });
  const l = data as unknown as { id?: string; title: string | null; rent_amount: number; advertiser?: { name: string } } | null;
  if (!l?.id) notFound();
  const { data: existing } = await supabase.from("conversations").select("id").eq("listing_id", l.id).eq("tenant_id", user.id).maybeSingle();
  if (existing) redirect(`/messages/${existing.id}`);
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4 px-4 pt-5 pb-10">
      <BackLink href={`/homes/${ref}`}>The home</BackLink>
      <h1 className="font-display text-[26px] font-bold">Message {l.advertiser?.name}</h1>
      <p className="text-[14px] text-muted">
        About: {l.title} · KES {formatAmount(l.rent_amount)}. The listing is attached to your message.
      </p>
      <NewMessageForm refId={ref} />
    </div>
  );
}
