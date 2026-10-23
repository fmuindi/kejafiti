import Link from "next/link";
import { Logo } from "@/components/ui/icon";
import { ButtonLink } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-narrow flex-col gap-5 px-4 pt-5">
      <Link href="/" aria-label="nyumbani home">
        <Logo />
      </Link>
      <h1 className="heading-page mt-8">We can&apos;t find that page</h1>
      <p className="text-body text-muted">It may have moved, or you may not have access to it with this account.</p>
      <ButtonLink href="/" className="self-start">Go to Explore</ButtonLink>
    </main>
  );
}
