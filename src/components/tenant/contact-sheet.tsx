"use client";

import Link from "next/link";
import { useRef } from "react";
import { logContact } from "@/app/(tenant)/actions";
import { Icon } from "@/components/ui/icon";
import { buttonClass } from "@/components/ui/primitives";

// External handoffs are honest: a Call or WhatsApp tap is logged as a contact attempt only.
// The in-app message thread is the durable record.

export function ContactSheet({
  refId,
  advertiser,
  listingTitle,
  signedIn,
}: {
  refId: string;
  advertiser: { name: string; call: boolean; whatsapp: boolean; phone: string | null };
  listingTitle: string;
  signedIn: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const phone = advertiser.phone?.replace(/[^\d+]/g, "") ?? "";
  const waNumber = phone.replace(/^\+/, "").replace(/^0/, "254");
  const waText = encodeURIComponent(`Hello, I saw your listing on nyumbani (${refId}): ${listingTitle}. Is it still available?`);
  const messageHref = `/homes/${refId}/message`;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => ref.current?.showModal()}
        className={buttonClass("secondary", "lg", "flex-1 md:flex-none")}
      >
        Contact
      </button>
      <dialog
        ref={ref}
        aria-labelledby="contact-title"
        onClose={() => trigger.current?.focus()}
        className="m-0 mt-auto w-full max-w-full rounded-t-panel bg-surface p-0 backdrop:bg-ink/40 md:m-auto md:max-w-narrow md:rounded-panel"
      >
        <div className="safe-bottom flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <h2 id="contact-title" className="heading-section">
              Contact {advertiser.name}
            </h2>
            <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="grid size-11 place-items-center rounded-full hover:bg-cool">
              <Icon name="x" />
            </button>
          </div>
          <Link href={signedIn ? messageHref : `/sign-in?next=${encodeURIComponent(messageHref)}&reason=message`} className={buttonClass("primary", "lg")}>
            <Icon name="message" size={18} /> Message in nyumbani
          </Link>
          <p className="-mt-1 text-caption text-muted">Your conversation and any viewing request stay in one place.</p>
          {advertiser.call && phone ? (
            <a href={`tel:${phone}`} onClick={() => void logContact(refId, "call")} className={buttonClass("secondary", "lg")}>
              <Icon name="phone" size={18} /> Call {advertiser.phone}
            </a>
          ) : null}
          {advertiser.whatsapp && waNumber ? (
            <a
              href={`https://wa.me/${waNumber}?text=${waText}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void logContact(refId, "whatsapp")}
              className={buttonClass("secondary", "lg")}
            >
              <Icon name="whatsapp" size={18} /> WhatsApp the advertiser
            </a>
          ) : null}
          {advertiser.call || advertiser.whatsapp ? (
            <p className="text-caption text-muted">
              Calls and WhatsApp happen outside nyumbani. We can&apos;t see those conversations, so they won&apos;t appear in your messages.
            </p>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
