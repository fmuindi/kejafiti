import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { Logo } from "@/components/ui/icon";
import { getProfile, requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "Admin centre", template: "%s · Admin · nyumbani" }, robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requirePlatformAdmin("/admin");
  const supabase = await createClient();
  const [{ data: counts }, profile] = await Promise.all([supabase.rpc("admin_queue_counts"), getProfile()]);
  const c = (counts ?? {}) as Record<string, number>;
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-4 bg-ink px-4 py-5 text-white md:sticky md:top-0 md:h-dvh">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="rounded-[8px] bg-white px-1.5 py-1"><Logo withWord={false} /></span>
          <span className="font-display text-[19px] font-bold">nyumbani</span>
          <span className="font-mono text-[11px] text-[#ff8fa6]">ADMIN</span>
        </Link>
        <AdminNav counts={c} />
        <p className="mt-auto text-[12.5px] text-white/70">Signed in as {profile?.full_name || profile?.email} · Platform admin</p>
      </aside>
      <main id="main" className="min-w-0 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
