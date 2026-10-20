import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/ui/primitives";

// Policy pages (IMP-19). The approved wording comes from the product owner; until it is
// supplied the page says so plainly rather than inventing commitments.
const DOCS: Record<string, string> = { terms: "Terms of use", privacy: "Privacy notice" };

export async function generateMetadata({ params }: PageProps<"/legal/[doc]">): Promise<Metadata> {
  return { title: DOCS[(await params).doc] ?? "Policy" };
}

export default async function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params;
  const title = DOCS[doc];
  if (!title) notFound();
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-5 pb-10">
      <PageTitle>{title}</PageTitle>
      <p className="text-[15px]">The full {title.toLowerCase()} will be published on this page.</p>
      <p className="text-[15px] text-muted">
        If you have a question about how nyumbani handles your account or information in the meantime,{" "}
        <Link href="/help" className="font-semibold text-ink underline">contact support</Link>.
      </p>
      <p className="text-[13px] text-muted">
        <Link href="/legal/terms" className="underline">Terms of use</Link> · <Link href="/legal/privacy" className="underline">Privacy notice</Link>
      </p>
    </div>
  );
}
