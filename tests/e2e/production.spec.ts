import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Production hardening, checked against the real `next start` build.

test("the health check reports the database is reachable and is never cached", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  const body = await res.json();
  expect(body).toMatchObject({ status: "ok", database: "ok" });
});

test("production responses tell browsers to stay on HTTPS", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["strict-transport-security"]).toMatch(/max-age=\d{7,}/);
});

test("sign-in never sends people to another site, before or after they sign in", async ({ page }) => {
  // ?next=/%09/evil.com decodes to "/\t/evil.com", which browsers read as //evil.com.
  await signIn(page, "achieng@nyumbani.test", "/\t/evil.com");
  expect(new URL(page.url()).hostname).toBe("localhost");

  // Already signed in: the server redirects straight away, and must still stay here.
  for (const next of ["/%09/evil.com", "/%5Cevil.com", "//evil.com", "https://evil.com"]) {
    await page.goto(`/sign-in?next=${next}`);
    expect(new URL(page.url()).hostname, next).toBe("localhost");
  }
});
