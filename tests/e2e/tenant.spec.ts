import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { latestEmail, mailMark, signIn } from "./helpers";

// A tenant saves a search, chooses how they hear about new homes, and the alert job emails them.
const TENANT = "achieng@nyumbani.test";

test("saved-search alerts and email settings", async ({ page, request }) => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false },
  });
  const { data: profile } = await admin.from("profiles").select("id").eq("email", TENANT).single();
  // Start from the defaults so the test can be rerun.
  await admin.from("notification_settings").delete().eq("user_id", profile!.id);
  await admin.from("saved_searches").delete().eq("user_id", profile!.id);

  await signIn(page, TENANT, "/search");

  // Save the search (no filters: every published home matches).
  await page.goto("/search");
  await page.getByRole("button", { name: "Save search" }).click();
  await expect(page.getByText("Search saved")).toBeVisible();

  // Make it instant from Saved.
  await page.goto("/saved");
  await page.getByRole("combobox", { name: /^Alerts for/ }).first().selectOption("instant");
  await expect(page.getByRole("combobox", { name: /^Alerts for/ }).first()).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("combobox", { name: /^Alerts for/ }).first()).toHaveValue("instant");

  // Home alerts by email are on; switching another category off sticks.
  await page.goto("/account#notifications");
  await expect(page.getByRole("checkbox", { name: /^Home alerts/ })).toBeChecked();
  await page.getByRole("checkbox", { name: /^Support/ }).uncheck();
  await expect(page.locator("#notifications").getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /^Support/ })).not.toBeChecked();
  await page.getByRole("checkbox", { name: /^Support/ }).check();
  await expect(page.locator("#notifications").getByRole("status")).toHaveText("Saved");

  // Pretend the search was last alerted a month ago, then run the scheduled job.
  await admin
    .from("saved_searches")
    .update({ last_alerted_at: new Date(Date.now() - 30 * 864e5).toISOString(), last_checked_at: null })
    .eq("user_id", profile!.id)
    .eq("alert_frequency", "instant");
  const since = await mailMark(TENANT);
  const job = await request.post("/api/jobs/deliver", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(job.status()).toBe(200);
  expect((await job.json()).alerts.alerted).toBeGreaterThan(0);

  const mail = await latestEmail(TENANT, { subject: /new homes? for/, since });
  expect(mail.Text).toMatch(/KES [\d,]+ \/ month/);
  expect(mail.Text).toContain("/account#notifications");
  await page.goto("/updates");
  await expect(page.getByText(/new homes? for/).first()).toBeVisible();
});
