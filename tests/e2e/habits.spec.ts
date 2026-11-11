import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Payment habits (demo seed: a year of history, Grace often late): the owner sees how tenants pay
// on the home, filters to who is often late, and opens a tenant's twelve months and activity.
test("payment habits from the home to one tenant's year", async ({ page }) => {
  await signIn(page, "felix@nyumbani.test", "/w");
  await page.waitForURL(/\/w\/[0-9a-f-]{36}/);
  const org = page.url().match(/\/w\/([0-9a-f-]{36})/)![1];

  await expect(page.getByRole("heading", { name: "Payment habits" })).toBeVisible();
  await page.getByRole("link", { name: /^All \d+ tenants$/ }).click();
  await page.waitForURL(`**/w/${org}/habits`);
  await page.getByRole("link", { name: /Often late \d+/ }).click();
  await expect(page).toHaveURL(/show=often_late/);
  const grace = page.getByRole("link", { name: /Grace Atieno/ }).filter({ visible: true }).first();
  await expect(grace).toBeVisible();
  await expect(page.getByRole("link", { name: /Peter Mwangi/ }).filter({ visible: true })).toHaveCount(0);

  await grace.click();
  const habits = page.locator("#habits");
  await expect(habits.getByText("Often late")).toBeVisible();
  await expect(habits.getByRole("list", { name: "Rent months, oldest first" }).getByRole("listitem")).toHaveCount(12);
  await habits.getByText("Show as a table").click();
  await expect(habits.getByRole("cell", { name: /Overdue · \d+ days/ })).toBeVisible();
  await expect(page.locator("#activity").getByText(/Payment confirmed · KSh/).first()).toBeVisible();
});
