import { describe, expect, it, vi } from "vitest";
import { supabaseProxyRewrites } from "@/lib/dev-proxy";

describe("supabaseProxyRewrites (/supabase tunnel forwarding)", () => {
  it("is off unless a target is set", () => {
    expect(supabaseProxyRewrites(undefined)).toEqual([]);
    expect(supabaseProxyRewrites("")).toEqual([]);
  });

  it("forwards to a local Supabase", () => {
    expect(supabaseProxyRewrites("http://127.0.0.1:54321")).toEqual([{ source: "/supabase/:path*", destination: "http://127.0.0.1:54321/:path*" }]);
    expect(supabaseProxyRewrites("http://localhost:54321/")).toEqual([{ source: "/supabase/:path*", destination: "http://localhost:54321/:path*" }]);
  });

  it("refuses any non-local target, so production can never become an open proxy", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const t of ["https://abc.supabase.co", "http://169.254.169.254", "http://127.0.0.1.evil.com", "http://localhost@evil.com", "file:///etc/passwd", "not a url"]) {
      expect(supabaseProxyRewrites(t), t).toEqual([]);
    }
    warn.mockRestore();
  });
});
