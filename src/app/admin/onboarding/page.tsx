import type { Metadata } from "next";
import { OnboardingRow } from "@/components/admin/onboarding-row";
import { EmptyState } from "@/components/ui/primitives";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Landlord onboarding" };

// Registration, contact verification and advertising approval are separate stages; a new
// workspace is never silently marked approved.
export default async function OnboardingPage() {
  // Layouts and pages render in parallel, so every admin page checks for itself.
  await requirePlatformAdmin("/admin");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_onboarding_queue");
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[2.125rem] font-bold tracking-[-1px]">Landlord onboarding</h1>
      {error ? <p role="alert" className="text-error">Couldn&apos;t load the queue.</p> : (data ?? []).length === 0 ? (
        <EmptyState title="No workspaces yet" icon="building">New landlord and agent workspaces appear here.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {(data ?? []).map((o) => <li key={o.org_id}><OnboardingRow org={o} /></li>)}
        </ul>
      )}
    </div>
  );
}
