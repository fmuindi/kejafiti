import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/safe-path";

// Whatever we return, the browser must resolve it to this site.
function landsOnSite(path: string) {
  return new URL(path, "https://kejafiti.co.ke").origin === "https://kejafiti.co.ke";
}

describe("safeInternalPath (sign-in next, notification and support links)", () => {
  it("keeps ordinary in-app paths with their query and hash", () => {
    expect(safeInternalPath("/auth/continue")).toBe("/auth/continue");
    expect(safeInternalPath("/w/abc/rent/inbox?status=submitted#top")).toBe("/w/abc/rent/inbox?status=submitted#top");
    expect(safeInternalPath("/homes/KF-123/viewing?when=2026-12-01T10:00")).toBe("/homes/KF-123/viewing?when=2026-12-01T10:00");
  });

  it("refuses anything that isn't a site-relative path", () => {
    for (const v of [null, undefined, "", "auth/continue", "https://evil.com", "javascript:alert(1)", "evil.com"]) {
      expect(safeInternalPath(v)).toBeNull();
    }
  });

  it("refuses protocol-relative and slash tricks that browsers turn into another site", () => {
    const attacks = [
      "//evil.com",
      "///evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "/\t/evil.com", // what ?next=/%09/evil.com decodes to
      "/\n/evil.com",
      "/\r\n/evil.com",
      "/\u0000/evil.com",
    ];
    for (const v of attacks) expect(safeInternalPath(v), JSON.stringify(v)).toBeNull();
  });

  it("only ever returns paths that stay on the site", () => {
    const inputs = ["/%09/evil.com", "/%2F%2Fevil.com", "/./evil.com", "/../evil.com", "/a/../../b", "/@evil.com", "/:evil.com"];
    for (const v of inputs) {
      const out = safeInternalPath(v);
      if (out !== null) expect(landsOnSite(out), `${v} -> ${out}`).toBe(true);
    }
  });

  it("refuses absurdly long values", () => {
    expect(safeInternalPath(`/${"a".repeat(3000)}`)).toBeNull();
  });
});
