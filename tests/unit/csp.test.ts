import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("content security policy", () => {
  const prod = buildCsp({ nonce: "abc", dev: false, supabaseUrl: "https://xyz.supabase.co" });

  it("only runs scripts carrying this request's nonce", () => {
    expect(directive(prod, "script-src")).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(prod).not.toContain("unsafe-eval");
  });
  it("lets the browser reach Supabase over https and secure websockets", () => {
    expect(directive(prod, "connect-src")).toBe("connect-src 'self' https://xyz.supabase.co wss://xyz.supabase.co");
    expect(directive(prod, "img-src")).toContain("https://xyz.supabase.co");
  });
  it("blocks framing, plugins and foreign form posts", () => {
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("form-action 'self'");
    expect(prod).toContain("upgrade-insecure-requests");
  });
  it("relaxes only what local development needs", () => {
    const dev = buildCsp({ nonce: "n", dev: true, supabaseUrl: "http://127.0.0.1:54321" });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toBe("connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321 ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
    expect(buildCsp({ nonce: "n", dev: false, supabaseUrl: "http://127.0.0.1:54321" })).not.toContain("upgrade-insecure-requests");
  });
  it("still builds a policy when Supabase isn't configured", () => {
    expect(directive(buildCsp({ nonce: "n", dev: false, supabaseUrl: "" }), "connect-src")).toBe("connect-src 'self'");
  });
});
