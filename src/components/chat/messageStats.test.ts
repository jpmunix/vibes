import { describe, expect, it } from "vitest";
import type { Message } from "@/ipc/types";
import {
  extractMessageTokenBreakdown,
  computeMessageCost,
  computeSessionTokens,
  computeSessionCost,
  buildMessageStats,
} from "./messageStats";

/**
 * Tests del helper de estadísticas del mensaje (#221).
 *
 * Funciones puras: se prueban sin montar React ni tocar IPC.
 * Cobertura: [NUEVO] helpers de messageStats — ver docs/TESTING.md.
 */

const tag = (attrs: string) => `<vibes-token-usage ${attrs}></vibes-token-usage>`;

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 1,
    role: "assistant",
    content: "",
    ...overrides,
  } as Message;
}

describe("extractMessageTokenBreakdown", () => {
  it("parses input/output/cached/web-searches/cost from a tag (direct cost)", () => {
    const msg = makeMessage({
      content: tag(`input="1000" output="200" cached="300" web-searches="2" cost="0.05"`),
    });
    const b = extractMessageTokenBreakdown(msg);
    expect(b.input).toBe(1000);
    expect(b.output).toBe(200);
    expect(b.cached).toBe(300);
    expect(b.total).toBe(1200);
    expect(b.webSearches).toBe(2);
    expect(b.directCost).toBe(0.05);
    expect(b.hasUsage).toBe(true);
    expect(b.estimated).toBe(false);
  });

  it("falls back to price-input/price-output when there's no direct cost", () => {
    const msg = makeMessage({
      content: tag(`input="1000" output="200" price-input="0.1" price-output="0.2"`),
    });
    const b = extractMessageTokenBreakdown(msg);
    expect(b.directCost).toBeNull();
    expect(b.priceInput).toBe(0.1);
    expect(b.priceOutput).toBe(0.2);
  });

  it("uses message.totalTokens when there's no tag (runtime flow)", () => {
    const msg = makeMessage({ totalTokens: 5000, content: "hola" });
    const b = extractMessageTokenBreakdown(msg);
    expect(b.input).toBe(5000);
    expect(b.total).toBe(5000);
    expect(b.hasUsage).toBe(true);
  });

  it("estimates chars/4 as last resort when no tag and no totalTokens", () => {
    const msg = makeMessage({ content: "hola".repeat(10) }); // 40 chars
    const b = extractMessageTokenBreakdown(msg);
    expect(b.input).toBe(10);
    expect(b.total).toBe(10);
    expect(b.estimated).toBe(true);
  });

  it("sums multiple tags", () => {
    const msg = makeMessage({
      content: tag(`input="1000" output="100"`) + "\n" + tag(`input="500" output="50"`),
    });
    const b = extractMessageTokenBreakdown(msg);
    expect(b.input).toBe(1500);
    expect(b.output).toBe(150);
  });
});

describe("computeMessageCost", () => {
  it("uses direct cost when present", () => {
    const msg = makeMessage({ content: tag(`input="1000" output="200" cost="0.04"`) });
    const b = extractMessageTokenBreakdown(msg);
    expect(computeMessageCost(b)).toBe(0.04);
  });

  it("computes from price-input/price-output when no direct cost", () => {
    const msg = makeMessage({
      content: tag(`input="1000" output="200" cached="100" price-input="0.1" price-output="0.2"`),
    });
    const b = extractMessageTokenBreakdown(msg);
    const cost = computeMessageCost(b);
    // (1000-100)*0.1 + 100*0.1*0.5 + 200*0.2 = 90 + 5 + 40 = 135
    expect(cost).toBeCloseTo(135, 5);
  });

  it("returns null when no pricing data", () => {
    const msg = makeMessage({ content: tag(`input="1000" output="200"`) });
    const b = extractMessageTokenBreakdown(msg);
    expect(computeMessageCost(b)).toBeNull();
  });
});

describe("computeSessionTokens", () => {
  it("sums tokens across assistant messages", () => {
    const messages = [
      makeMessage({ id: 1, content: tag(`input="1000" output="100"`) }),
      makeMessage({ id: 2, content: tag(`input="500" output="50"`) }),
      makeMessage({ id: 3, role: "user", content: "usuario" }),
    ];
    const s = computeSessionTokens(messages);
    expect(s.totalInput).toBe(1500);
    expect(s.totalOutput).toBe(150);
    expect(s.totalTokens).toBe(1650);
  });
});

describe("computeSessionCost", () => {
  it("sums cost across messages, ignoring user messages", () => {
    const messages = [
      makeMessage({ id: 1, content: tag(`input="1000" output="100" cost="0.02"`) }),
      makeMessage({ id: 2, content: tag(`input="500" output="50" cost="0.01"`) }),
      makeMessage({ id: 3, role: "user", content: "usuario" }),
    ];
    expect(computeSessionCost(messages)).toBeCloseTo(0.03, 5);
  });

  it("returns null if no message has pricing data", () => {
    const messages = [makeMessage({ content: tag(`input="1000" output="100"`) })];
    expect(computeSessionCost(messages)).toBeNull();
  });
});

describe("buildMessageStats", () => {
  it("derives startedAtMs from createdAt - durationMs", () => {
    const messages = [makeMessage({ id: 1, createdAt: new Date("2026-01-01T10:00:10Z"), durationMs: 5000 })];
    const stats = buildMessageStats(messages[0], messages);
    expect(stats.startedAtMs).toBe(
      new Date("2026-01-01T10:00:05Z").getTime(),
    );
    expect(stats.durationMs).toBe(5000);
  });

  it("returns null startedAtMs when durationMs missing", () => {
    const messages = [makeMessage({ id: 1, createdAt: new Date() })];
    const stats = buildMessageStats(messages[0], messages);
    expect(stats.startedAtMs).toBeNull();
  });
});
