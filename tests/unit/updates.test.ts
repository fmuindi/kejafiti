import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({}));
vi.mock("@/lib/supabase/server", () => ({}));
const { categoryOf, safeInternalLink } = await import("@/lib/updates");

describe("updates (IMP-08)", () => {
  it("matches the database's categories, which decide the optional emails", () => {
    // Same kinds and answers as supabase/tests/12_notification_email_and_alerts.test.sql.
    const kinds = ["entry_submitted", "message", "viewing_confirmed", "invite_accepted", "listing_report", "support_reply", "saved_search_alert", "registration", "status"];
    expect(kinds.map(categoryOf)).toEqual(["rent", "enquiries", "enquiries", "team", "listings", "support", "alerts", "admin", "other"]);
  });
  it("groups every notification kind the database sends", () => {
    expect(categoryOf("entry_submitted")).toBe("rent");
    expect(categoryOf("entry_return")).toBe("rent");
    expect(categoryOf("message")).toBe("enquiries");
    expect(categoryOf("viewing_requested")).toBe("enquiries");
    expect(categoryOf("invite_accepted")).toBe("team");
    expect(categoryOf("access_changed")).toBe("team");
    expect(categoryOf("listing_reviewed")).toBe("listings");
    expect(categoryOf("registration")).toBe("admin");
    expect(categoryOf("something_new")).toBe("other");
  });
  it("follows internal links only", () => {
    expect(safeInternalLink("/w/abc/enquiries")).toBe("/w/abc/enquiries");
    expect(safeInternalLink("https://evil.example")).toBeNull();
    expect(safeInternalLink("//evil.example")).toBeNull();
    expect(safeInternalLink(String.raw`/\evil.example`)).toBeNull();
    expect(safeInternalLink(null)).toBeNull();
  });
});
