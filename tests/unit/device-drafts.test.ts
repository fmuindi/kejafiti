import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_RETENTION_DAYS, clearDeviceDataFor, readDraft, removeDraft, writeDraft } from "@/lib/device-drafts";

// IMP-05: one shared browser, two accounts.
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  keys() { return [...this.m.keys()]; }
}

let store: MemoryStorage;
beforeEach(() => {
  store = new MemoryStorage();
  // Object.keys(localStorage) lists stored keys in browsers; mirror that.
  const ls = new Proxy(store, { ownKeys: () => store.keys(), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
  vi.stubGlobal("window", { localStorage: ls });
});
afterEach(() => vi.unstubAllGlobals());

const scope = { org: "o1", property: "p1", tenancy: "t1", entry: "new" };
const draft = { amount: "10000", clientRequestId: "req-1" };

describe("device drafts", () => {
  it("another account on the same browser cannot see or resume the draft", () => {
    writeDraft("userA", "rentEntry", scope, draft);
    expect(readDraft("userB", "rentEntry", scope)).toBeNull();
    expect(readDraft("userA", "rentEntry", scope)?.data).toEqual(draft);
  });

  it("restores only for the exact same tenancy and entry", () => {
    writeDraft("userA", "rentEntry", scope, draft);
    expect(readDraft("userA", "rentEntry", { ...scope, tenancy: "t2" })).toBeNull();
    expect(readDraft("userA", "rentEntry", { ...scope, entry: "e9" })).toBeNull();
  });

  it("discarding removes only the selected draft", () => {
    writeDraft("userA", "rentEntry", scope, draft);
    writeDraft("userA", "rentEntry", { ...scope, tenancy: "t2" }, { ...draft, amount: "500" });
    writeDraft("userA", "message", { conversation: "c1" }, "hello");
    removeDraft("userA", "rentEntry", scope);
    expect(readDraft("userA", "rentEntry", scope)).toBeNull();
    expect(readDraft("userA", "rentEntry", { ...scope, tenancy: "t2" })?.data.amount).toBe("500");
    expect(readDraft("userA", "message", { conversation: "c1" })?.data).toBe("hello");
  });

  it(`expires after ${DRAFT_RETENTION_DAYS} days`, () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T08:00:00Z"));
    writeDraft("userA", "rentEntry", scope, draft);
    vi.setSystemTime(new Date("2026-10-16T08:00:00Z"));
    expect(readDraft("userA", "rentEntry", scope)).toBeNull();
    expect(store.keys()).toHaveLength(0);
    vi.useRealTimers();
  });

  it("signing out clears that person's drafts and searches, not another account's", () => {
    writeDraft("userA", "rentEntry", scope, draft);
    writeDraft("userB", "rentEntry", scope, { ...draft, amount: "7000" });
    store.setItem("nyumbani.recentSearches", "[]");
    clearDeviceDataFor("userA");
    expect(readDraft("userA", "rentEntry", scope)).toBeNull();
    expect(readDraft("userB", "rentEntry", scope)?.data.amount).toBe("7000");
    expect(store.getItem("nyumbani.recentSearches")).toBeNull();
  });

  it("never restores pre-v2 drafts, which can't be attributed to a person", () => {
    store.setItem("nyumbani.entryDraft.t1", JSON.stringify({ amount: "999" }));
    store.setItem("nyumbani.msgDraft.c1", "old");
    expect(readDraft("userA", "rentEntry", scope)).toBeNull();
    expect(store.keys()).toHaveLength(0);
  });

  it("drops a draft written under a different schema", () => {
    writeDraft("userA", "rentEntry", scope, draft);
    const [k] = store.keys();
    store.setItem(k, JSON.stringify({ ...JSON.parse(store.getItem(k) as string), schema: 1 }));
    expect(readDraft("userA", "rentEntry", scope)).toBeNull();
  });
});
