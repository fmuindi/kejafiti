import { expect, test } from "@playwright/test";
import { latestEmail, mailMark, runId, signIn } from "./helpers";

// A landlord emails a tenant an invoice and a message from the unit page, a reminder from the
// Tenants page, and invites them online; the tenant accepts and finds all three in My rent.
const OWNER = "felix@nyumbani.test";

test("invoice, message and reminder by email, then the tenant sees them online", async ({ page, browser }) => {
  await signIn(page, OWNER, "/w");
  await page.waitForURL(/\/w\/[0-9a-f-]{36}/);
  const org = page.url().match(/\/w\/([0-9a-f-]{36})/)![1];
  await page.goto(`/w/${org}/properties`);
  await page.getByRole("link", { name: /Sunrise Apartments/ }).first().click();
  await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);

  // A tenant who started this month with KSh 1,500 brought forward.
  const unit = `C${runId}`.toUpperCase();
  const name = `Comms ${runId}`;
  const email = `comms-${runId}@example.test`;
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date()).split("-");
  await page.getByText("Import units and tenants from a spreadsheet").click();
  await page.getByLabel("Or paste the cells here").fill(
    ["Unit\tTenant name\tEmail\tStart date\tRent\tOpening balance", `${unit}\t${name}\t${email}\t01/${m}/${y}\t9000\t1500`].join("\n"),
  );
  await page.getByRole("button", { name: "Check rows" }).click();
  await page.getByRole("button", { name: "Import 1 row" }).click();
  await expect(page.getByText(/Imported: 1 new unit and 1 tenancy/)).toBeVisible();
  await page.getByRole("row", { name: new RegExp(unit) }).getByRole("link", { name: "Tenancy" }).click();
  await expect(page.getByText(email)).toBeVisible();

  // Invoice for this month from the unit page.
  await page.getByText(/an invoice, reminder or message/).click();
  let since = await mailMark(email);
  await page.getByRole("button", { name: /^Send invoice to/ }).click();
  await expect(page.getByText("1 invoice sent.")).toBeVisible();
  const invoice = await latestEmail(email, { subject: /^Invoice for/, since });
  expect(invoice.Text).toMatch(/invoice INV-\d{6} from Felix Properties/);
  expect(invoice.Text).toContain("Balance brought forward: KSh 1,500");
  expect(invoice.Text).toMatch(/Amount due by .*: KSh 1,500/);

  // A message.
  await page.getByRole("radio", { name: "Message" }).check({ force: true });
  await page.getByLabel("Subject").fill("Water off on Friday");
  await page.getByRole("textbox", { name: "Message" }).fill("The county is repairing the main line, 9am to 3pm.");
  since = await mailMark(email);
  await page.getByRole("button", { name: /^Send message to/ }).click();
  await expect(page.getByText("1 message sent.")).toBeVisible();
  const notice = await latestEmail(email, { subject: /Water off on Friday/, since });
  expect(notice.Text).toContain("The county is repairing the main line");

  // Both are in the unit's history; the invoice opens as sent.
  await page.reload();
  await expect(page.getByRole("link", { name: /Water off on Friday/ })).toBeVisible();
  await page.getByRole("link", { name: /^Invoice for/ }).click();
  await expect(page.getByText(/Invoice · INV-\d{6}/)).toBeVisible();
  await expect(page.getByText(`to ${email}`)).toBeVisible();

  // A reminder and an online-access invitation from the Tenants page.
  const property = page.url().match(/\/rent\/([0-9a-f-]{36})\//)![1];
  await page.goto(`/w/${org}/rent/${property}/tenants`);
  await page.getByRole("button", { name: /^Owe rent/ }).click();
  await page.getByRole("checkbox", { name: `Select ${name}, unit ${unit}` }).check();
  await page.getByRole("button", { name: "Send invoice, reminder or message" }).click();
  await page.getByRole("radio", { name: "Reminder" }).check({ force: true });
  since = await mailMark(email);
  await page.getByRole("button", { name: /^Send reminder to/ }).click();
  await expect(page.getByText("1 reminder sent.")).toBeVisible();
  const reminder = await latestEmail(email, { subject: /^Rent reminder: KSh 1,500/, since });
  expect(reminder.Text).toContain("Total due: KSh 1,500");

  since = await mailMark(email);
  await page.getByRole("button", { name: "Invite to see records online" }).click();
  await expect(page.getByText("1 tenant invited to see their records online.")).toBeVisible();
  const invite = await latestEmail(email, { subject: /online/, since });
  const link = invite.Text.match(/https?:\/\/\S+\/tenant-invite\/\S+/)![0];

  // The tenant accepts and finds everything in My rent.
  const tenantContext = await browser.newContext();
  const tenant = await tenantContext.newPage();
  const path = new URL(link).pathname;
  await signIn(tenant, email, path);
  await tenant.goto(path);
  await tenant.getByRole("button", { name: "Open my tenancy" }).click();
  await tenant.waitForURL("**/my-rent");
  await tenant.getByText(`Sunrise Apartments · Unit ${unit}`).click();
  await expect(tenant.getByRole("heading", { name: "From Felix Properties" })).toBeVisible();
  await expect(tenant.getByRole("link", { name: /Rent reminder: KSh 1,500/ })).toBeVisible();
  await expect(tenant.getByRole("link", { name: /Water off on Friday/ })).toBeVisible();
  await tenant.getByRole("link", { name: /^Invoice for/ }).click();
  await expect(tenant.getByText(/Invoice · INV-\d{6}/)).toBeVisible();
  await expect(tenant.getByText("Balance brought forward")).toBeVisible();
  await tenantContext.close();
});
