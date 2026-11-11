import { expect, test } from "@playwright/test";

// The signed-out marketplace: search, a listing, the security policy, and what search engines
// and share previews read.

test("search, open a listing and see its full costs, with the security policy enforced", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
  });

  const res = await page.goto("/search");
  expect(res?.headers()["content-security-policy"]).toContain("'strict-dynamic'");
  const first = page.locator("article").first().getByRole("link").first();
  await expect(first).toBeVisible();
  await first.click();
  await page.waitForURL(/\/homes\/L-/);
  await expect(page.getByText(/move-in total/i).first()).toBeVisible();
  // Client JS runs under the policy: the gallery's buttons respond.
  const next = page.getByRole("button", { name: "Next photo" });
  if (await next.isVisible()) {
    await next.click();
    await expect(page.getByText(/photo 2 of/)).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("search engines and share previews get what they need", async ({ page, request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /w/");
  expect(robots).toContain("Sitemap:");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toMatch(/\/homes\/L-\d+/);
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.short_name).toBe("nyumbani");
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src);
    expect(r.headers()["content-type"]).toBe("image/png");
  }
  const ref = sitemap.match(/\/homes\/(L-\d+)/)![1];
  await page.goto(`/homes/${ref}`);
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toBeTruthy();
  const img = await request.get(og!);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
});

test("pages still fit a phone screen at 200% text size", async ({ page }) => {
  for (const path of ["/", "/search", "/help", "/sign-in"]) {
    await page.goto(path);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    // Against the screen width: phone emulation widens the layout viewport to fit overflow.
    const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, page.viewportSize()!.width);
    expect(overflow, `${path} scrolls sideways at 200% text`).toBeLessThanOrEqual(1);
  }
});
