"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createTicket, registerTicketFile } from "@/app/(tenant)/help/actions";
import { ErrorSummary, Field, Select, TextArea, TextInput } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";
import { MAX_UPLOAD_BYTES, safeFileName } from "@/lib/image";
import { SUPPORT_CATEGORIES } from "@/lib/support";
import { getBrowserClient } from "@/lib/supabase/browser";

const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// Contact support (IMP-19). Asks only for what's needed; a file is optional. The page the
// person came from is attached as context, never anything from their records.
export function SupportForm({ contextLink }: { contextLink?: string }) {
  const router = useRouter();
  const [category, setCategory] = useState("other");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const clientRef = useRef<string>(crypto.randomUUID());
  return (
    <form
      noValidate
      className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setErrors({});
          setMessage(undefined);
          if (file && (!TYPES.includes(file.type) || file.size > MAX_UPLOAD_BYTES)) {
            setErrors({ file: "Attach a photo (JPG, PNG, WEBP) or a PDF up to 15 MB." });
            return;
          }
          const r = await createTicket({ category: category as "other", subject, description, context_link: contextLink, client_ref: clientRef.current });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            setMessage(r.message);
            return;
          }
          if (file) {
            const path = `${r.data.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
            const up = await getBrowserClient().storage.from("support-files").upload(path, file, { contentType: file.type, upsert: false });
            if (!up.error) await registerTicketFile(r.data.id, { path, name: safeFileName(file.name), mime: file.type, size: file.size });
          }
          router.push(`/help/tickets/${r.data.id}?new=1`);
        });
      }}
    >
      <ErrorSummary errors={errors} message={message} />
      <Field label="What is it about?" htmlFor="category">
        <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {SUPPORT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
      </Field>
      <Field label="Subject" htmlFor="subject" error={errors.subject}>
        <TextInput id="subject" value={subject} maxLength={140} onChange={(e) => setSubject(e.target.value)} error={errors.subject} />
      </Field>
      <Field label="What happened?" htmlFor="description" error={errors.description} hint="Don't include passwords, sign-in codes or full payment details. Support can't see your messages or rent records unless you write them here.">
        <TextArea id="description" rows={5} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
      </Field>
      <Field label="Screenshot or document" htmlFor="file" optional error={errors.file} hint="JPG, PNG, WEBP or PDF up to 15 MB. Only you and the support team can open it.">
        <input id="file" type="file" accept={TYPES.join(",")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[14px]" />
      </Field>
      {contextLink ? <Notice tone="info">We&apos;ll include the page you came from ({contextLink}) so support knows where to look.</Notice> : null}
      <Button type="submit" size="lg" pending={pending} pendingLabel="Sending" className="self-start">Send to support</Button>
    </form>
  );
}
