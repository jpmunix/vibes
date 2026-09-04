import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CHAT_MESSAGE_PATH = resolve(
  process.cwd(),
  "src/components/chat/ChatMessage.tsx",
);
const MESSAGES_LIST_PATH = resolve(
  process.cwd(),
  "src/components/chat/MessagesList.tsx",
);

describe("sticky user message visual contract", () => {
  it("keeps the sticky wrapper opaque without an overlay below the bubble", () => {
    const chatMessage = readFileSync(CHAT_MESSAGE_PATH, "utf8");
    const messagesList = readFileSync(MESSAGES_LIST_PATH, "utf8");

    expect(messagesList).toContain('"sticky top-0 z-10 bg-background"');
    expect(chatMessage).not.toContain("-bottom-3 h-3");
    expect(chatMessage).not.toContain(
      "bg-gradient-to-b from-[var(--background)] to-transparent",
    );
  });
});

import { computeStickyScrollTop } from "./ChatMessage";

describe("computeStickyScrollTop (column-reverse chat container)", () => {
  it("scrolls to the message start for an older message", () => {
    // 1200px of content, 400px viewport → maxScroll = 800.
    // An older message sitting 700px into the flow (from the top) should land
    // at scrollTop = 700 - 800 = -100.
    expect(computeStickyScrollTop(700, 1200, 400)).toBe(-100);
  });

  it("scrolls to 0 when the message start is the newest content", () => {
    expect(computeStickyScrollTop(1200, 1200, 400)).toBe(0);
  });

  it("clamps into [-maxScroll, 0] and is monotonic in the offset", () => {
    const sh = 1200;
    const ch = 400;
    const maxScroll = sh - ch;

    // Any offset must always land within the container's scroll range.
    for (const offset of [-5000, -50, 0, 100, 700, 1200, 5000]) {
      const result = computeStickyScrollTop(offset, sh, ch);
      expect(result).toBeGreaterThanOrEqual(-maxScroll);
      expect(result).toBeLessThanOrEqual(0);
    }

    // Moving up in the flow (larger offsetTop) must be monotonic non-decreasing:
    // it can never scroll further toward the chat start than its neighbour.
    const a = computeStickyScrollTop(0, sh, ch);
    const b = computeStickyScrollTop(700, sh, ch);
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it("handles a container with no overflow", () => {
    expect(computeStickyScrollTop(300, 300, 400)).toBe(0);
  });
});
