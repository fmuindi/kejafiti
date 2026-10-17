import type { Metadata } from "next";
import { formatDateTime } from "@/lib/dates";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  // Layouts and pages render in parallel, so every admin page checks for itself.
  await requirePlatformAdmin("/admin");
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_recent_registrations", { p_limit: 200 });
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[34px] font-bold tracking-[-1px]">Users & advertisers</h1>
      <p className="text-[14px] text-muted">Every account is listed. Admins can see workspaces and listings, but not tenants&apos; rent records or private conversations.</p>
      <div className="overflow-x-auto rounded-[18px] border border-line bg-surface">
        <table className="w-full min-w-[620px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[12px] text-muted uppercase">
              {["Name", "Email", "Registered", "Workspaces"].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((u) => (
              <tr key={u.user_id} className="border-b border-divider last:border-0">
                <td className="px-4 py-3 font-semibold">{u.full_name || "—"}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{formatDateTime(u.created_at)}</td>
                <td className="px-4 py-3 font-mono">{u.workspaces}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
