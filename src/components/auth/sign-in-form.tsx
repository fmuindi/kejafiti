"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Field, TextInput, describedBy } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";
import { getBrowserClient } from "@/lib/supabase/browser";

// Email one-time code sign-in. Supabase Auth sends the code (configure production SMTP
// before launch). Phone codes are available when an SMS provider is configured.

type Step = { kind: "contact" } | { kind: "code"; destination: string; channel: "email" | "phone" };

const RESEND_SECONDS = 60;

function maskEmail(e: string) {
  const [u, d] = e.split("@");
  return `${u.slice(0, 1)}•••@${d}`;
}

export function SignInForm({ next, phoneEnabled }: { next: string; phoneEnabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "contact" });
  const [channel, setChannel] = useState<"email" | "phone">("email");
  const [contact, setContact] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step.kind === "code") codeRef.current?.focus();
  }, [step.kind]);

  const normalizedPhone = () => {
    const digits = contact.replace(/\D/g, "");
    if (digits.startsWith("254")) return `+${digits}`;
    if (digits.startsWith("0")) return `+254${digits.slice(1)}`;
    return `+254${digits}`;
  };

  async function sendCode() {
    setError(null);
    const supabase = getBrowserClient();
    const value = channel === "email" ? contact.trim().toLowerCase() : normalizedPhone();
    if (channel === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setError("Enter your email address, like name@example.co.ke.");
      return;
    }
    if (channel === "phone" && !/^\+2547\d{8}$|^\+2541\d{8}$/.test(value)) {
      setError("Enter a Kenyan mobile number, like 0712 345 678.");
      return;
    }
    setPending(true);
    const { error: err } =
      channel === "email"
        ? await supabase.auth.signInWithOtp({ email: value, options: { shouldCreateUser: true, data: name ? { full_name: name.trim() } : undefined } })
        : await supabase.auth.signInWithOtp({ phone: value, options: { shouldCreateUser: true, data: name ? { full_name: name.trim() } : undefined } });
    setPending(false);
    if (err) {
      setError(
        err.status === 429
          ? "Too many codes were requested. Wait a minute, then try again."
          : "We couldn't send the code. Check the address and your connection, then try again.",
      );
      return;
    }
    setStep({ kind: "code", destination: value, channel });
    setResendIn(RESEND_SECONDS);
  }

  async function verify() {
    if (step.kind !== "code") return;
    setError(null);
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setPending(true);
    const supabase = getBrowserClient();
    const { error: err } =
      step.channel === "email"
        ? await supabase.auth.verifyOtp({ email: step.destination, token, type: "email" })
        : await supabase.auth.verifyOtp({ phone: step.destination, token, type: "sms" });
    setPending(false);
    if (err) {
      setError("That code doesn't match or has expired. Check the latest message, or resend a new code. Anything you were doing is still held.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (step.kind === "code") {
    return (
      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
        noValidate
      >
        <p className="text-body">
          Sent to <strong>{step.channel === "email" ? maskEmail(step.destination) : step.destination.replace(/(\+254\d)\d{5}(\d{3})/, "$1•• ••• $2")}</strong>.{" "}
          <button type="button" className="link-action" onClick={() => { setStep({ kind: "contact" }); setCode(""); setError(null); }}>
            Change
          </button>
        </p>
        <Field label="6-digit code" htmlFor="code" error={error ?? undefined} hint="Paste works too. Your device may fill it in automatically.">
          <TextInput
            ref={codeRef}
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={error ?? undefined}
            aria-describedby={describedBy("code", { error: error ?? undefined, hint: true })}
            className="font-mono text-title tracking-[8px]"
          />
        </Field>
        <Button type="submit" size="lg" pending={pending} pendingLabel="Checking">
          Verify and continue
        </Button>
        <div className="flex items-center justify-between text-label">
          <span className="text-muted">Didn&apos;t get it?</span>
          <button type="button" disabled={resendIn > 0 || pending} onClick={() => void sendCode()} className="link-action">
            {resendIn > 0 ? `Resend in 0:${String(resendIn).padStart(2, "0")}` : "Resend code"}
          </button>
        </div>
        <p className="text-caption text-muted">The code expires 10 minutes after it was sent. We never ask for it by phone or WhatsApp.</p>
      </form>
    );
  }

  return (
    <form
      className="mt-6 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void sendCode();
      }}
      noValidate
    >
      {error ? (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      ) : null}
      {channel === "email" ? (
        <Field label="Email address" htmlFor="contact" hint="We'll email you a 6-digit code. No password needed.">
          <TextInput id="contact" type="email" autoComplete="email" inputMode="email" value={contact} onChange={(e) => setContact(e.target.value)} required aria-describedby="contact-hint" />
        </Field>
      ) : (
        <Field label="Mobile number" htmlFor="contact" hint="We'll text you a 6-digit code. Standard SMS rates may apply.">
          <div className="flex min-h-field items-center rounded-control border border-input bg-surface focus-within:ring-2 focus-within:ring-deep/40">
            <span className="border-r border-divider px-3.5 text-base font-semibold">+254</span>
            <input id="contact" type="tel" autoComplete="tel-national" inputMode="tel" value={contact} onChange={(e) => setContact(e.target.value)} className="min-w-0 flex-1 bg-transparent px-3 text-base focus:outline-none" aria-describedby="contact-hint" />
          </div>
        </Field>
      )}
      <Field label="Your name" htmlFor="name" optional hint="Only used if this is a new account, so advertisers know who's asking.">
        <TextInput id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-describedby="name-hint" />
      </Field>
      <Button type="submit" size="lg" pending={pending} pendingLabel="Sending code">
        Send code
      </Button>
      {phoneEnabled ? (
        <button type="button" className="link-action text-body" onClick={() => { setChannel(channel === "email" ? "phone" : "email"); setError(null); setContact(""); }}>
          {channel === "email" ? "Use my mobile number instead" : "Use email instead"}
        </button>
      ) : null}
    </form>
  );
}
