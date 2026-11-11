import { expect, test } from "@playwright/test";
import { latestEmail, mailMark, runId, signIn } from "./helpers";

// A landlord imports units from a spreadsheet, then gives one tenant online access; the tenant
// opens the link and sees their rent.
const OWNER = "felix@nyumbani.test";

test("import units and tenants, then share a tenancy with the tenant", async ({ page, browser }) => {
  await signIn(page, OWNER, "/w");
  await page.waitForURL(/\/w\/[0-9a-f-]{36}/);
  const org = page.url().match(/\/w\/([0-9a-f-]{36})/)![1];
  await page.goto(`/w/${org}/properties`);
  await page.getByRole("link", { name: /Sunrise Apartments/ }).first().click();
  await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);

  const occupied = `E${runId}A`.toUpperCase();
  const vacant = `E${runId}B`.toUpperCase();
  const tenantEmail = `tenant-${runId}@example.test`;
  await page.getByText("Import units and tenants from a spreadsheet").click();
  await page.getByLabel("Or paste the cells here").fill(
    [
      "Unit\tType\tTenant name\tPhone\tStart date\tRent\tOpening balance",
      `${occupied}\tBedsitter\tE2E Tenant\t0711000000\t01/09/2026\t9000\t1500`,
      `${vacant}\t2 bedroom\t\t\t\t\t`,
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Check rows" }).click();
  await expect(page.getByText("Ready to import")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(page.getByText("Imported: 2 new units and 1 tenancy.")).toBeVisible();

  // Importing a second tenancy onto the same unit is refused, by row.
  await page.getByLabel("Or paste the cells here").fill(`Unit\tTenant name\tStart date\tRent\n${occupied}\tSomeone Else\t01/10/2026\t9000`);
  await page.getByRole("button", { name: "Check rows" }).click();
  await expect(page.getByText(/already has a current tenancy/)).toBeVisible();

  // Give the tenant online access.
  await page.getByRole("row", { name: new RegExp(occupied) }).getByRole("link", { name: "Tenancy" }).click();
  await expect(page.getByText("E2E Tenant").first()).toBeVisible();
  await page.getByRole("button", { name: "Give online access" }).click();
  const since = await mailMark(tenantEmail);
  await page.getByLabel("Tenant's email").fill(tenantEmail);
  await page.getByRole("button", { name: "Send link" }).click();
  const link = (await page.locator("p.font-mono", { hasText: "/tenant-invite/" }).textContent())!.trim();
  const mail = await latestEmail(tenantEmail, { subject: /online/, since });
  expect(mail.Text).toContain(link);

  // The tenant signs in with that email and opens it.
  const tenantContext = await browser.newContext();
  const tenant = await tenantContext.newPage();
  const path = new URL(link).pathname;
  await signIn(tenant, tenantEmail, path);
  await tenant.goto(path);
  await expect(tenant.getByRole("heading", { name: "Your tenancy, online" })).toBeVisible();
  await tenant.getByRole("button", { name: "Open my tenancy" }).click();
  await tenant.waitForURL("**/my-rent");
  const card = tenant.getByText(`Sunrise Apartments · Unit ${occupied}`);
  await expect(card).toBeVisible();
  await card.click();
  await expect(tenant.getByText("Opening balance: Balance carried over at import")).toBeVisible();
  await tenantContext.close();

  // Back on the landlord's side, the tenant shows as linked.
  await page.reload();
  // Scoped to the visible page: Next can keep a hidden copy of the previous render for back-navigation.
  await expect(page.locator("#main").getByText(/can see their rent, balance and statement online/)).toBeVisible();
});
