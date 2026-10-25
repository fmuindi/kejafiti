import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { runId, signIn } from "./helpers";

// Listing another unit in a building that has been listed before: the location step is skipped
// and the building's costs, contact, viewing details and building photos are already filled in.
test("a second unit in the same building starts from the building's details", async ({ page }) => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false },
  });
  // The demo's live listings in Example Court: mark one photo as a building photo.
  const { data: court } = await admin.from("properties").select("id").eq("name", "Example Court").limit(1).single();
  const { data: live } = await admin.from("listings").select("id, viewing_instructions").eq("property_id", court!.id).eq("status", "published").limit(1).single();
  const { data: photo } = await admin.from("listing_photos").select("id").eq("listing_id", live!.id).order("position").limit(1).single();
  await admin.from("listing_photos").update({ media_label: "building" }).eq("id", photo!.id);
  await admin.from("listings").update({ updated_at: new Date().toISOString() }).eq("id", live!.id);

  await signIn(page, "felix@nyumbani.test", "/w");
  await page.waitForURL(/\/w\/[0-9a-f-]{36}/);
  const org = page.url().match(/\/w\/([0-9a-f-]{36})/)![1];
  await page.goto(`/w/${org}/listings/new`);
  // Owners with properties start from an existing building, not a new home.
  await expect(page.getByRole("radio", { name: "A unit in one of my properties" })).toBeChecked();
  await page.getByLabel("Property").selectOption(court!.id);
  const unit = `L${runId}`.toUpperCase();
  await page.getByLabel("New unit reference").fill(unit);
  await expect(page.getByLabel("Fill in from")).toContainText("suggested");
  await page.getByRole("button", { name: "Start listing" }).click();

  // Straight to the Home step, saying what was filled in.
  await page.waitForURL(/\/listings\/[0-9a-f-]{36}$/);
  const listingId = page.url().match(/\/listings\/([0-9a-f-]{36})/)![1];
  await expect(page.getByText("Step 2 of 6 · Home")).toBeVisible();
  await expect(page.getByText(/Filled in from unit .*'s listing/)).toBeVisible();
  await expect(page.getByText(/with 1 building photo/)).toBeVisible();

  await page.goto(`/w/${org}/listings/${listingId}?step=5`);
  await expect(page.getByLabel("Meeting instructions for confirmed viewings")).toHaveValue(live!.viewing_instructions!);
  const { data: copied } = await admin.from("listing_photos").select("storage_path, media_label").eq("listing_id", listingId);
  expect(copied).toHaveLength(1);
  expect(copied![0].media_label).toBe("building");
  expect(copied![0].storage_path.startsWith(`${org}/${listingId}/`)).toBe(true);
  const { count } = await admin.from("listing_charges").select("id", { count: "exact", head: true }).eq("listing_id", listingId);
  expect(count).toBeGreaterThan(0);
  await admin.from("listing_photos").update({ media_label: "sample" }).eq("id", photo!.id);
});
