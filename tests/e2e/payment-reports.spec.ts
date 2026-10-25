import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { runId, signIn } from "./helpers";

// A tenant says a payment is missing from their statement. The landlord sees it on their home
// queue, records it from the report (prefilled), and the tenant sees it found and confirmed. A
// second report can't be found, and the tenant reads why.
const OWNER = "felix@nyumbani.test";

test("a tenant reports a missing payment and sees it found, or why it wasn't", async ({ page, browser }) => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false },
  });
  await signIn(page, OWNER, "/w");
  await page.waitForURL(/\/w\/[0-9a-f-]{36}/);
  const org = page.url().match(/\/w\/([0-9a-f-]{36})/)![1];
  await page.goto(`/w/${org}/properties`);
  await page.getByRole("link", { name: /Sunrise Apartments/ }).first().click();
  await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);

  // A tenant who started this month owing KSh 1,500 brought forward.
  const unit = `R${runId}`.toUpperCase();
  const name = `Report ${runId}`;
  const email = `report-${runId}@example.test`;
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date()).split("-");
  await page.getByText("Import units and tenants from a spreadsheet").click();
  await page.getByLabel("Or paste the cells here").fill(
    ["Unit\tTenant name\tEmail\tStart date\tRent\tOpening balance", `${unit}\t${name}\t${email}\t01/${m}/${y}\t9000\t1500`].join("\n"),
  );
  await page.getByRole("button", { name: "Check rows" }).click();
  await page.getByRole("button", { name: "Import 1 row" }).click();
  await expect(page.getByText(/Imported: 1 new unit and 1 tenancy/)).toBeVisible();

  // The tenant has online access (the invitation flow is covered in communications.spec.ts).
  const tenantContext = await browser.newContext();
  const tenant = await tenantContext.newPage();
  await signIn(tenant, email, "/my-rent");
  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).single();
  await admin.from("tenants").update({ user_id: profile!.id }).eq("email", email);

  // The tenant reports what they paid.
  const ref = `QE${runId}`.toUpperCase();
  await tenant.goto("/my-rent");
  await tenant.getByText(`Sunrise Apartments · Unit ${unit}`).click();
  await tenant.getByRole("button", { name: "Report a missing payment" }).click();
  await tenant.getByLabel("Amount you paid").fill("1500");
  await tenant.getByLabel("Reference").fill(ref.toLowerCase());
  await tenant.getByRole("button", { name: "Send for checking" }).click();
  await expect(tenant.getByText("Sent for checking")).toBeVisible();
  const reports = tenant.locator("#reports");
  await expect(reports.getByText("Being checked")).toBeVisible();
  await expect(reports.getByText(ref)).toBeVisible();

  // The landlord finds it in their queue and records it from the report.
  await page.goto(`/w/${org}`);
  const item = page.locator("#queue").getByRole("link", { name: new RegExp(`${unit} · ${name}.*Missing payment reported`) });
  await expect(item).toBeVisible();
  await item.click();
  const panel = page.locator("#reported");
  await expect(panel.getByText(/Says they paid KSh 1,500/)).toBeVisible();
  await panel.getByRole("link", { name: "Record this payment" }).click();
  await expect(page.getByText(/reported this payment/)).toBeVisible();
  await expect(page.getByLabel("Amount paid")).toHaveValue("1500");
  await expect(page.getByLabel("Reference")).toHaveValue(ref);
  await page.getByRole("checkbox", { name: /I have checked this payment/ }).check();
  await page.getByRole("button", { name: "Save and confirm" }).click();
  await expect(page.getByText(/^Confirmed · PE-/)).toBeVisible();

  // The tenant sees it found and confirmed, and their balance cleared.
  await tenant.reload();
  await expect(reports.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(tenant.getByText("All paid up")).toBeVisible();

  // A second report the landlord can't find: the tenant reads what was checked.
  await tenant.getByRole("button", { name: "Report a missing payment" }).click();
  await tenant.getByLabel("Amount you paid").fill("700");
  await tenant.getByRole("radio", { name: "Cash" }).check({ force: true });
  await tenant.getByRole("button", { name: "Send for checking" }).click();
  await expect(reports.getByText("Being checked")).toBeVisible();

  await page.goto(`/w/${org}`);
  await page.locator("#queue").getByRole("link", { name: new RegExp(`${unit} · ${name}.*KSh 700`) }).click();
  await panel.getByRole("button", { name: "Couldn't find it" }).click();
  await panel.getByLabel("What you checked").fill("No cash receipt for that day. Please send a photo of yours.");
  await panel.getByRole("button", { name: "Send answer" }).click();
  await expect(panel.getByText("No payments reported missing.")).toBeVisible();

  await tenant.reload();
  await expect(reports.getByText("Not found")).toBeVisible();
  await expect(reports.getByText("No cash receipt for that day. Please send a photo of yours.")).toBeVisible();
  await tenantContext.close();
});
