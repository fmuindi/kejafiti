import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/env";

// Delivery worker. Business actions only write durable delivery_tasks rows (in the same
// transaction as the record); this worker sends them. A provider being down or not
// configured never blocks or undoes the business action.
//
// Email goes to the local Mailpit inbox when MAILPIT_URL is set (development and tests,
// so nobody real is ever emailed), otherwise to Resend. SMS, WhatsApp and push have no
// provider and are reported as switched off, never as sending.

const hasServiceKey = () => !!(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
const mailpitUrl = () => (process.env.MAILPIT_URL ?? "").replace(/\/$/, "");

export type EmailProvider = "mailpit" | "resend" | null;

export function emailProvider(): EmailProvider {
  if (!hasServiceKey()) return null;
  if (mailpitUrl()) return "mailpit";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

export const emailConfigured = () => emailProvider() !== null;

export const PROVIDER_LABEL: Record<Exclude<EmailProvider, null>, string> = {
  mailpit: "Local Mailpit inbox (development; nobody real is emailed)",
  resend: "Resend",
};

/** Channels with a provider. Others are switched off and their tasks say so. */
export function enabledChannels(): string[] {
  return emailConfigured() ? ["email"] : [];
}

type Task = {
  id: string;
  channel: string;
  destination: string;
  template: string;
  payload: Record<string, unknown>;
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function renderEmail(t: Task): { subject: string; text: string; html: string } | null {
  const p = t.payload as Record<string, string>;
  switch (t.template) {
    case "staff_invitation": {
      const link = `${SITE_URL}/invite/${p.token}`;
      const text = `${p.inviter ?? "Your landlord"} invited you to help manage properties for ${p.org_name} on nyumbani.\n\nAccept the invitation: ${link}\n\nYou'll sign in with this email address and set your own sign-in. The invitation expires in 7 days. If you weren't expecting this, you can ignore it.`;
      return {
        subject: `You're invited to ${p.org_name} on nyumbani`,
        text,
        html: `<p>${escapeHtml(p.inviter ?? "Your landlord")} invited you to help manage properties for <strong>${escapeHtml(p.org_name)}</strong> on nyumbani.</p><p><a href="${link}">Accept the invitation</a></p><p>You'll sign in with this email address and set your own sign-in. The invitation expires in 7 days. If you weren't expecting this, you can ignore it.</p>`,
      };
    }
    case "admin_registration": {
      const text = `A new account was registered: ${p.name || "(no name given)"} at ${p.registered_at}.\n\nOpen the admin centre: ${SITE_URL}/admin/onboarding`;
      return { subject: "New nyumbani registration", text, html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` };
    }
    case "admin_onboarding": {
      const text = `A new ${p.kind} workspace needs onboarding review: ${p.name}.\n\nOpen the onboarding queue: ${SITE_URL}/admin/onboarding`;
      return { subject: `New ${p.kind} to onboard: ${p.name}`, text, html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` };
    }
    default:
      return null;
  }
}

// Provider errors can echo the recipient; keep addresses out of stored errors and logs.
export function redactError(message: string) {
  return message.replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[email]").slice(0, 300);
}

type SendResult = { ok: true; ref: string | null } | { ok: false; error: string; retryable: boolean };

async function sendEmail(taskId: string, to: string, msg: { subject: string; text: string; html: string }): Promise<SendResult> {
  const from = process.env.EMAIL_FROM ?? "nyumbani <no-reply@example.com>";
  if (emailProvider() === "mailpit") {
    const [, name = "", email = from] = from.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/) ?? [];
    const res = await fetch(`${mailpitUrl()}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ From: { Email: email, Name: name }, To: [{ Email: to }], Subject: msg.subject, Text: msg.text, HTML: msg.html, Headers: { "X-Delivery-Task": taskId } }),
    });
    const body = (await res.json().catch(() => ({}))) as { ID?: string; Error?: string };
    if (!res.ok) return { ok: false, error: body.Error ?? `Mailpit HTTP ${res.status}`, retryable: res.status >= 500 };
    return { ok: true, ref: body.ID ?? null };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      // Same key on every attempt: a retry after an uncertain outcome isn't sent twice.
      "Idempotency-Key": `delivery-${taskId}`,
    },
    body: JSON.stringify({ from, to: [to], subject: msg.subject, text: msg.text, html: msg.html }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) return { ok: false, error: body.message ?? `HTTP ${res.status}`, retryable: res.status >= 500 || res.status === 429 };
  return { ok: true, ref: body.id ?? null };
}

export async function processDeliveries(limit = 25): Promise<{ claimed: number; sent: number; failed: number; skipped?: string }> {
  if (!emailConfigured()) return { claimed: 0, sent: 0, failed: 0, skipped: "No email provider is configured, so tasks stay queued." };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_delivery_tasks", { p_limit: limit });
  if (error) throw new Error(error.message);
  const tasks = (data ?? []) as unknown as Task[];
  let sent = 0;
  let failed = 0;
  for (const t of tasks) {
    if (t.channel !== "email") {
      await admin.rpc("finish_delivery_task", { p_task: t.id, p_ok: false, p_provider_ref: "", p_error: `${t.channel} is switched off: no provider is configured`, p_retryable: false });
      failed++;
      continue;
    }
    const msg = renderEmail(t);
    if (!msg) {
      await admin.rpc("finish_delivery_task", { p_task: t.id, p_ok: false, p_provider_ref: "", p_error: `Unknown template ${t.template}`, p_retryable: false });
      failed++;
      continue;
    }
    try {
      const r = await sendEmail(t.id, t.destination, msg);
      await admin.rpc("finish_delivery_task", {
        p_task: t.id,
        p_ok: r.ok,
        p_provider_ref: r.ok ? (r.ref ?? "") : "",
        p_error: r.ok ? "" : redactError(r.error),
        p_retryable: r.ok ? true : r.retryable,
      });
      if (r.ok) sent++;
      else failed++;
    } catch (e) {
      // Uncertain outcome (network). Leave it for a bounded retry; the task key prevents a
      // second logical task, though a provider-side duplicate is possible and noted.
      await admin.rpc("finish_delivery_task", { p_task: t.id, p_ok: false, p_provider_ref: "", p_error: redactError((e as Error).message), p_retryable: true });
      failed++;
    }
  }
  return { claimed: tasks.length, sent, failed };
}

/** Best-effort send right after a request finishes; the scheduled worker is the fallback. */
export async function kickDelivery() {
  if (!emailConfigured()) return;
  after(async () => {
    try {
      await processDeliveries(10);
    } catch (e) {
      console.error("[delivery]", redactError((e as Error).message));
    }
  });
}
