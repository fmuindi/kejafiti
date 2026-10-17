"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { startConversation } from "@/lib/messaging-actions";
import { Field, TextArea } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";

export function NewMessageForm({ refId }: { refId: string }) {
  const router = useRouter();
  const clientRef = useRef<string>(crypto.randomUUID());
  const [body, setBody] = useState("Hello, is this home still available?");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          try {
            const r = await startConversation(refId, body, clientRef.current);
            if (!r.ok) return setError(r.message);
            router.replace(`/messages/${r.data.conversationId}`);
          } catch {
            setError("Your message has not sent. Check your connection and try again; it won't be sent twice.");
          }
        });
      }}
    >
      <Field label="Your message" htmlFor="body">
        <TextArea id="body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
      </Field>
      {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
      <Button type="submit" size="lg" pending={pending} pendingLabel="Sending">Send message</Button>
    </form>
  );
}
