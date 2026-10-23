import { expect, type Page } from "@playwright/test";

const MAILPIT = (process.env.MAILPIT_URL ?? "http://127.0.0.1:54324").replace(/\/$/, "");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1")) {
  throw new Error("End-to-end tests only run against a local Supabase");
}

type MailSummary = { ID: string; Subject: string };

async function inbox(to: string): Promise<MailSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=50`);
  return ((await res.json()) as { messages: MailSummary[] }).messages;
}

/** IDs already in the inbox, so a later wait only accepts mail sent after this point. */
export async function mailMark(to: string) {
  return new Set((await inbox(to)).map((m) => m.ID));
}

/**
 * Newest email to `to` (optionally whose subject matches), waiting for it to arrive. With
 * `since` (from mailMark), only a message that wasn't there before counts: Mailpit runs in a
 * container whose clock can drift from this machine's, so timestamps aren't compared.
 */
export async function latestEmail(to: string, opts: { subject?: RegExp; since?: Set<string> } = {}) {
  let found: MailSummary | undefined;
  await expect
    .poll(async () => {
      found = (await inbox(to)).find((m) => (!opts.subject || opts.subject.test(m.Subject)) && !opts.since?.has(m.ID));
      // Do what the scheduler does: app emails wait in the outbox behind any backlog (the demo
      // seed queues plenty), and the instant send after an action only takes the oldest few.
      if (!found) await runJobs();
      return !!found;
    }, { timeout: 20_000, message: `email to ${to}` })
    .toBe(true);
  const res = await fetch(`${MAILPIT}/api/v1/message/${found!.ID}`);
  return (await res.json()) as { Subject: string; Text: string; HTML: string };
}

/** One run of the scheduled jobs (saved-search alerts, then the email outbox). */
export async function runJobs() {
  const res = await fetch("http://localhost:3200/api/jobs/deliver", { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  return (await res.json()) as { alerts: { checked: number; alerted: number } | null; claimed: number; sent: number };
}

/** Signs in with the real email-code flow, reading the code from Mailpit. */
export async function signIn(page: Page, email: string, next = "/account") {
  const since = await mailMark(email);
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  const mail = await latestEmail(email, { since });
  const code = mail.Text.match(/\b(\d{6})\b/)?.[1];
  expect(code, "sign-in email contains a 6-digit code").toBeTruthy();
  await page.getByLabel("6-digit code").fill(code!);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
}

export const runId = Date.now().toString(36);
