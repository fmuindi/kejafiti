import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { Logo } from "@/components/ui/icon";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { getProfile, requirePlatformAdmin, requireUser } from "@/lib/auth";
import { getUnreadCount } from "@/lib/updates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "Admin centre", template: "%s · Admin · nyumbani" }, robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requirePlatformAdmin("/admin");
  const supabase = await createClient();
  const [{ data: counts }, profile, unread, user] = await Promise.all([supabase.rpc("admin_queue_counts"), getProfile(), getUnreadCount(), requireUser("/admin")]);
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
        {/* IMP-06/08: updates, the public site and sign-out are reachable from the admin centre too. */}
        <div className="mt-auto flex flex-col gap-1 border-t border-white/15 pt-3 text-[14.5px]">
          <Link href="/updates" className="flex min-h-11 items-center justify-between rounded-[12px] px-3 text-white/85 hover:bg-white/10">
            Updates {unread ? <span className="font-mono text-[12.5px] text-[#ffd59a]" aria-label={`${unread} unread`}>{unread}</span> : null}
          </Link>
          <Link href="/" className="flex min-h-11 items-center rounded-[12px] px-3 text-white/85 hover:bg-white/10">Browse homes</Link>
          <SignOutForm userId={user.id}>
            <button type="submit" className="flex min-h-11 w-full items-center rounded-[12px] px-3 text-left text-white/85 hover:bg-white/10">Sign out</button>
          </SignOutForm>
          <p className="px-3 pt-2 text-[12.5px] text-white/70">Signed in as {profile?.full_name || profile?.email} · Platform admin</p>
        </div>
      </aside>
      <main id="main" className="min-w-0 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
