import { describe, expect, it } from "vitest";
import { peerLabel } from "@/lib/presence";

// Online, typing and last-active wording in conversations.

const now = new Date("2026-10-23T12:00:00Z").getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();
const MIN = 60_000;

describe("peerLabel", () => {
  it("shows typing over everything else", () => {
    expect(peerLabel({ typing: true, here: true, lastActive: ago(MIN) }, now)).toEqual({ tone: "typing", text: "Typing…" });
  });
  it("is online while the other side has the conversation open, even with no check-in yet", () => {
    expect(peerLabel({ typing: false, here: true, lastActive: null }, now)?.text).toBe("Online");
  });
  it("is online for two minutes after the last check-in elsewhere in the app", () => {
    expect(peerLabel({ typing: false, here: false, lastActive: ago(90_000) }, now)?.text).toBe("Online");
    expect(peerLabel({ typing: false, here: false, lastActive: ago(3 * MIN) }, now)).toEqual({ tone: "away", text: "Active 3 min ago" });
  });
  it("says when the other side was last active", () => {
    expect(peerLabel({ typing: false, here: false, lastActive: ago(5 * 60 * MIN) }, now)?.text).toBe("Active 5 h ago");
    expect(peerLabel({ typing: false, here: false, lastActive: ago(26 * 60 * MIN) }, now)?.text).toBe("Active yesterday");
    expect(peerLabel({ typing: false, here: false, lastActive: "2026-10-12T09:00:00Z" }, now)?.text).toBe("Active on 12 Oct");
  });
  it("shows nothing when nothing is known", () => {
    expect(peerLabel({ typing: false, here: false, lastActive: null }, now)).toBeNull();
  });
});
