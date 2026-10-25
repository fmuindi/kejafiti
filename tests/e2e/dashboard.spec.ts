import { expect, test, type Browser } from "@playwright/test";
import { signIn } from "./helpers";

// The workspace home (blueprint pages 7-8): owners see the rent position and can open every
// figure; managers see their queue, search, and record from it; a follow-up added on a unit
// shows up in the queue; every role's home fits a phone screen.

async function home(browser: Browser, email: string, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await signIn(page, email, "/w");
  await page.waitForURL(/\/w\/[0-9a-f-]{36}/);
  const org = page.url().match(/\/w\/([0-9a-f-]{36})/)![1];
  return { ctx, page, org };
}

test("every role's home fits a phone screen", async ({ browser }) => {
  for (const email of ["felix@nyumbani.test", "esther@nyumbani.test", "joseph@nyumbani.test", "ruth@nyumbani.test"]) {
    const { ctx, page, org } = await home(browser, email);
    for (const path of [`/w/${org}`, `/w/${org}/owing`, `/w/${org}/search?q=a2`]) {
      await page.goto(path);
      // Against the screen width: in phone emulation the layout viewport widens to fit overflowing
      // content, so comparing with window.innerWidth would hide the problem.
      const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, page.viewportSize()!.width);
      expect(overflow, `${path} as ${email} scrolls sideways`).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  }
});

test("the owner's position matches Performance and opens the records behind it", async ({ browser }) => {
  const { ctx, page, org } = await home(browser, "felix@nyumbani.test", { width: 1366, height: 860 });
  await page.goto(`/w/${org}?property=`);
  const position = page.getByRole("region", { name: /Rent position/ }).or(page.locator("section[aria-labelledby=position-h]"));
  const billed = (await position.getByRole("link", { name: /rent billed/ }).innerText()).match(/KSh [\d,]+/)![0];
  const covered = (await position.getByRole("link", { name: /covered/ }).first().innerText()).match(/KSh [\d,]+/)![0];
  await page.goto(`/w/${org}/dashboard`);
  const figures = page.getByRole("list", { name: "Key figures" });
  await expect(figures.getByText(billed.replace("KSh ", ""), { exact: true }).first()).toBeVisible();
  await expect(figures.getByText(covered.replace("KSh ", ""), { exact: true }).first()).toBeVisible();

  // "Overdue across all months" opens who owes; each row opens the unit.
  await page.goto(`/w/${org}`);
  await page.getByRole("link", { name: /overdue across all months/ }).click();
  await page.waitForURL("**/owing");
  await expect(page.getByRole("heading", { name: "Who owes", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: /Grace Atieno/ }).click();
  await expect(page.getByRole("heading", { name: "Unit A2" })).toBeVisible();
  await ctx.close();
});

test("a manager finds a tenant, adds a promise to pay, and it lands in their queue", async ({ browser }) => {
  const { ctx, page, org } = await home(browser, "esther@nyumbani.test", { width: 1366, height: 860 });
  await expect(page.getByRole("link", { name: "Record payment" })).toBeVisible();
  await page.getByRole("searchbox", { name: /Search unit, tenant/ }).fill("Kevin");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: /Unit B3 · Kevin Mutua/ }).click();
  await expect(page.getByRole("heading", { name: "Unit B3" })).toBeVisible();

  const note = `Promised by phone ${Date.now().toString(36)}`;
  const fu = page.locator("#follow-ups");
  await fu.getByRole("button", { name: "Add follow-up" }).click();
  await fu.getByRole("radio", { name: "Promised to pay" }).check({ force: true });
  await fu.getByLabel("Promised to pay by").fill(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date()));
  await fu.getByRole("textbox", { name: /^Note/ }).fill(note);
  await fu.getByRole("button", { name: "Add follow-up" }).click();
  await expect(fu.getByText(note)).toBeVisible();

  await page.goto(`/w/${org}`);
  const item = page.locator("#queue").getByRole("link", { name: new RegExp(note) });
  await expect(item).toBeVisible();
  await expect(item).toContainText("due today");

  // Closing it takes it off the queue; the balance never changed.
  await item.click();
  await fu.getByText(note).locator("xpath=ancestor::li[1]").getByRole("button", { name: "Mark done" }).click();
  await fu.getByLabel("Outcome").fill("Paid; entry submitted");
  await fu.getByRole("button", { name: "Mark done" }).click();
  await expect(fu.getByText(note)).toBeHidden();
  await page.goto(`/w/${org}`);
  await expect(page.locator("#queue").getByText(note)).toBeHidden();
  await ctx.close();
});
