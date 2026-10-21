import { beforeEach, describe, expect, it, vi } from "vitest";

// The provider chain: OpenAI first, Claude as backup, then the caller shows ordinary filters.
vi.mock("server-only", () => ({}));
const openai = vi.fn();
const claude = vi.fn();
vi.mock("@/lib/ai/openai", async () => {
  class AiProviderError extends Error {
    constructor(public detail: { kind: string }) {
      super(detail.kind);
    }
  }
  return { AiProviderError, completeJson: (...a: unknown[]) => openai(...a) };
});
vi.mock("@/lib/ai/anthropic", () => ({ completeJsonClaude: (...a: unknown[]) => claude(...a) }));

const { AiProviderError } = await import("@/lib/ai/openai");
const ok = (model: string) => ({ value: { ok: true }, inputTokens: 1, outputTokens: 1, model });
const fail = (kind: string) => new (AiProviderError as unknown as new (d: { kind: string }) => Error)({ kind });
const opts = { system: "s", user: "u", schemaName: "x", schema: {} };

async function freshChain() {
  vi.resetModules();
  return (await import("@/lib/ai/providers")).completeIntentJson;
}

beforeEach(() => {
  openai.mockReset();
  claude.mockReset();
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  vi.stubEnv("AI_INTENT_PROVIDERS", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("AI provider chain", () => {
  it("uses OpenAI when it works and never calls Claude", async () => {
    openai.mockResolvedValue(ok("gpt"));
    const r = await (await freshChain())(opts);
    expect(r.provider).toBe("openai");
    expect(claude).not.toHaveBeenCalled();
  });

  it("falls back to Claude when OpenAI is out of credit", async () => {
    openai.mockRejectedValue(fail("quota"));
    claude.mockResolvedValue(ok("claude"));
    const r = await (await freshChain())(opts);
    expect(r.provider).toBe("anthropic");
  });

  it("skips a provider that just ran out of credit on the next request", async () => {
    const chain = await freshChain();
    openai.mockRejectedValue(fail("quota"));
    claude.mockResolvedValue(ok("claude"));
    await chain(opts);
    await chain(opts);
    expect(openai).toHaveBeenCalledTimes(1);
    expect(claude).toHaveBeenCalledTimes(2);
  });

  it("when both fail, the error reaches the caller (which shows ordinary filters)", async () => {
    openai.mockRejectedValue(fail("unavailable"));
    claude.mockRejectedValue(fail("quota"));
    await expect((await freshChain())(opts)).rejects.toThrow("quota");
  });

  it("only configured providers take part", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    claude.mockResolvedValue(ok("claude"));
    const r = await (await freshChain())(opts);
    expect(r.provider).toBe("anthropic");
    expect(openai).not.toHaveBeenCalled();
  });

  it("the order can be changed without a code change", async () => {
    vi.stubEnv("AI_INTENT_PROVIDERS", "anthropic,openai");
    claude.mockResolvedValue(ok("claude"));
    const r = await (await freshChain())(opts);
    expect(r.provider).toBe("anthropic");
    expect(openai).not.toHaveBeenCalled();
  });
});
