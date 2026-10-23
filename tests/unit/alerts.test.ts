import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/auth", () => ({}));
vi.mock("@/lib/supabase/server", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({}));
const { alertSearchParams, newMatches } = await import("@/lib/search-alerts");
const { renderEmail } = await import("@/lib/delivery");

const home = (ref: string, published_at: string | null) => ({ ref, title: `Home ${ref}`, area: "Ruaka", rent_amount: 14000, price_period: "month", published_at });

describe("saved-search alerts", () => {
  it("alerts only on homes published since the last alert, newest first", () => {
    const rows = [
      home("OLD", "2026-10-20T08:00:00Z"),
      home("A", "2026-10-23T09:00:00Z"),
      home("B", "2026-10-23T11:00:00Z"),
      home("LATER", "2026-10-23T13:00:00Z"), // published after this check started: next check's
      home("NONE", null),
    ];
    expect(newMatches(rows, "2026-10-23T07:00:00Z", "2026-10-23T12:00:00Z").map((h) => h.ref)).toEqual(["B", "A"]);
  });
  it("never repeats a home on the boundary of two checks", () => {
    const rows = [home("EDGE", "2026-10-23T12:00:00Z")];
    expect(newMatches(rows, "2026-10-23T07:00:00Z", "2026-10-23T12:00:00Z")).toHaveLength(1);
    expect(newMatches(rows, "2026-10-23T12:00:00Z", "2026-10-23T17:00:00Z")).toHaveLength(0);
  });
  it("re-runs the saved filters the way the search page reads them, newest first", () => {
    const p = alertSearchParams("q=Ruaka&max=15000&type=1_bedroom&must=parking&sort=lowest_total&page=3");
    expect(p).toMatchObject({ q: "Ruaka", max_rent: 15000, home_types: ["1_bedroom"], must_haves: ["parking"], sort: "newest", limit: 60, offset: 0 });
  });
  it("tolerates an empty or junk query", () => {
    expect(alertSearchParams("")).toMatchObject({ q: null, sort: "newest" });
    expect(alertSearchParams("max=abc&type=castle")).toMatchObject({ max_rent: null, home_types: [] });
  });
});

describe("optional emails", () => {
  it("emails an update with a link into the app and a way to switch it off", () => {
    const m = renderEmail({ id: "t", channel: "email", destination: "x@example.test", template: "notification",
      payload: { title: "New reply about L-4001", body: "Yes, water is included", link: "/messages/abc", category: "enquiries" } })!;
    expect(m.subject).toBe("New reply about L-4001");
    expect(m.text).toContain("/messages/abc");
    expect(m.text).toContain("email for enquiries and viewings is on");
    expect(m.html).toContain("/account#notifications");
  });
  it("never links outside the app, and escapes what people typed", () => {
    const m = renderEmail({ id: "t", channel: "email", destination: "x@example.test", template: "notification",
      payload: { title: "<b>Hi</b>", body: "<script>x</script>", link: "//evil.example/phish", category: "support" } })!;
    expect(m.text).not.toContain("evil.example");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;b&gt;Hi&lt;/b&gt;");
  });
  it("lists alert homes with their rent and says how many more there are", () => {
    const m = renderEmail({ id: "t", channel: "email", destination: "x@example.test", template: "saved_search_alert",
      payload: { label: "Ruaka bedsitters", query: "q=Ruaka", total: 3, homes: [home("L-1", null), home("L-2", null)] } })!;
    expect(m.subject).toBe("3 new homes for Ruaka bedsitters");
    expect(m.text).toContain("Home L-1 · Ruaka · KES 14,000 / month");
    expect(m.text).toContain("/homes/L-2");
    expect(m.text).toContain("And 1 more.");
    expect(m.text).toContain("/search?q=Ruaka");
  });
});
