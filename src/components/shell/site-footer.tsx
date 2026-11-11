import Link from "next/link";
import { Icon, Logo, type IconName } from "@/components/ui/icon";

/**
 * The public site's footer. Desktop: every main page in columns. Phone: the bottom tabs
 * already cover the main pages, so only help, listing and the policies, in one short block.
 */
export function SiteFooter({ listHref, listLabel, signedIn }: { listHref: string; listLabel: string; signedIn: boolean }) {
  const columns: Array<{ title: string; links: Array<[string, string]> }> = [
    { title: "Find a home", links: [["/", "Explore"], ["/search", "All homes"], ["/saved", "Saved"], ["/viewings", "Viewings"], ["/messages", "Messages"]] },
    { title: "Landlords and agents", links: [[listHref, listLabel], ...(signedIn ? [] : [["/sign-in", "Sign in"] as [string, string]])] },
    { title: "Help", links: [["/help", "Help and support"], ["/legal/terms", "Terms"], ["/legal/privacy", "Privacy"]] },
  ];
  const phone: Array<[string, string, IconName]> = [
    ["/help", "Help", "info"],
    [listHref, listLabel, "building"],
  ];
  const year = new Date().getFullYear();
  return (
    <footer className="no-print mt-12 border-t border-line bg-surface">
      <div className="mx-auto hidden max-w-shell grid-cols-[1.4fr_repeat(3,1fr)] gap-x-6 px-6 py-10 md:grid">
        <div className="flex flex-col gap-3">
          <Link href="/" aria-label="nyumbani home" className="self-start">
            <Logo />
          </Link>
          <p className="max-w-narrow text-label text-muted">Rent, charges and move-in total, up front.</p>
        </div>
        <nav aria-label="Footer" className="contents">
          {columns.map((col) => (
            <div key={col.title}>
              <h2 className="heading-group">{col.title}</h2>
              <ul className="mt-2 flex flex-col">
                {col.links.map(([href, label]) => (
                  <li key={label}>
                    <Link href={href} className="inline-flex min-h-10 items-center text-body text-ink hover:text-primary">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <nav aria-label="Footer" className="flex flex-col gap-1 px-4 pt-4 md:hidden">
        {phone.map(([href, label, icon]) => (
          <Link key={href} href={href} className="flex min-h-11 items-center gap-3 text-body font-semibold">
            <Icon name={icon} size={18} className="text-muted" /> {label}
            <Icon name="chevronRight" size={16} className="ml-auto text-muted" />
          </Link>
        ))}
      </nav>
      <div className="border-divider md:border-t">
        <p className="mx-auto flex max-w-shell flex-wrap items-center gap-x-3 gap-y-1 px-4 py-4 text-caption text-muted md:px-6">
          <span>© {year} nyumbani</span>
          <Link href="/legal/terms" className="hover:text-ink md:hidden">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-ink md:hidden">Privacy</Link>
        </p>
      </div>
    </footer>
  );
}
