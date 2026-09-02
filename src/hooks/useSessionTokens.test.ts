import { describe, expect, it } from "vitest";
import {
  computeSessionTokens,
  computeGauge,
  formatTokenCount,
  extractMessageTokenUsage,
  resolveGaugeTokens,
  EMPTY_SESSION_TOKENS,
  GAUGE_COMPACT_PCT_USED,
  GAUGE_WARN_PCT_REMAINING,
  DONUT_CIRCUMFERENCE,
  computeDonutDashOffset,
} from "./useSessionTokens";

/**
 * Tests de las funciones puras del context gauge (#207).
 *
 * Patrón del repo (ver TodoList.test.ts): se prueban las funciones exportadas
 * sin montar el componente React — coherente con el resto de tests de UI.
 */

const tag = (attrs: string) => `<vibes-token-usage ${attrs}></vibes-token-usage>`;

const msg = (id: number, role: "user" | "assistant", content: string) => ({
  id,
  role,
  content,
} as any);

describe("extractMessageTokenUsage", () => {
  it("parses input/output/cached from a single tag", () => {
    const usage = extractMessageTokenUsage(
      tag(`input="1000" output="200" cached="300"`),
    );
    expect(usage).toEqual({
      input: 1000,
      output: 200,
      cached: 300,
      total: 1200,
      hasUsage: true,
    });
  });

  it("sums multiple tags (one per turn/iteration)", () => {
    const content =
      tag(`input="1000" output="100"`) + "\n" + tag(`input="500" output="50"`);
    const usage = extractMessageTokenUsage(content);
    expect(usage.input).toBe(1500);
    expect(usage.output).toBe(150);
    expect(usage.total).toBe(1650);
    expect(usage.hasUsage).toBe(true);
  });

  it("returns zero usage without hasUsage for tag-less content", () => {
    const usage = extractMessageTokenUsage("Hola, respuesta normal sin tag");
    expect(usage).toEqual({
      input: 0,
      output: 0,
      cached: 0,
      total: 0,
      hasUsage: false,
    });
  });

  it("ignores zero-valued tags (no usage reported)", () => {
    const usage = extractMessageTokenUsage(tag(`input="0" output="0"`));
    expect(usage.hasUsage).toBe(false);
  });
});

describe("computeSessionTokens", () => {

  it("sums tokens from assistant messages only", () => {
    const messages = [
      msg(1, "user", "¿qué tal?"),
      msg(2, "assistant", tag(`input="800" output="120"`)),
      msg(3, "user", "sigue"),
      msg(4, "assistant", tag(`input="600" output="80"`)),
    ];
    const summary = computeSessionTokens(messages);
    expect(summary.totalInput).toBe(1400);
    expect(summary.totalOutput).toBe(200);
    expect(summary.totalTokens).toBe(1600);
    expect(summary.perMessage).toHaveLength(2);
    expect(summary.hasUsage).toBe(true);
  });

  it("mixes real tags with per-message estimation", () => {
    const messages = [
      msg(1, "assistant", "respuesta sin tag (legacy)"),
      msg(2, "assistant", tag(`input="100" output="10"`)),
    ];
    const summary = computeSessionTokens(messages);
    // El mensaje 2 es real (110); el 1 se estima chars/4 y se suma
    expect(summary.totalTokens).toBe(
      110 + Math.ceil("respuesta sin tag (legacy)".length / 4),
    );
    // Mezcla: hay un real → summary NO es estimado en conjunto
    expect(summary.estimated).toBe(false);
    expect(summary.hasUsage).toBe(true);
    expect(summary.perMessage).toHaveLength(2);
    expect(summary.perMessage[0].estimated).toBe(true); // estimado
    expect(summary.perMessage[1].estimated).toBe(false); // real
  });

  it("uses msg.totalTokens (runtime) when no tag exists — not estimation", () => {
    const messages = [
      msg(1, "assistant", "respuesta runtime sin tag"),
      msg(2, "assistant", "otra respuesta"),
    ];
    // Runtime rellena totalTokens en el message (flujo nuevo)
    messages[0].totalTokens = 5000;
    messages[1].totalTokens = 3000;
    const summary = computeSessionTokens(messages);
    expect(summary.totalTokens).toBe(8000);
    expect(summary.estimated).toBe(false); // dato real, no estimado
    expect(summary.hasUsage).toBe(false); // no vino de tag
    expect(summary.perMessage).toHaveLength(2);
    expect(summary.perMessage[0].estimated).toBe(false);
  });

  it("prefers the tag over msg.totalTokens", () => {
    const messages = [
      msg(1, "assistant", tag(`input="100" output="10"`)),
    ];
    messages[0].totalTokens = 9999; // el tag manda
    const summary = computeSessionTokens(messages);
    expect(summary.totalTokens).toBe(110);
    expect(summary.hasUsage).toBe(true);
  });

  it("falls back to chars/4 estimation only when no real data at all", () => {
    const messages = [
      msg(1, "user", "hola"),
      msg(2, "assistant", "respuesta sin tag (legacy)"),
      msg(3, "user", "sigue por aquí"),
    ];
    const summary = computeSessionTokens(messages);
    // Estima SOLO los assistant (ya no suma user) — y rellena perMessage
    const expected = Math.ceil("respuesta sin tag (legacy)".length / 4);
    expect(summary.totalTokens).toBe(expected);
    expect(summary.hasUsage).toBe(false);
    expect(summary.estimated).toBe(true);
    expect(summary.perMessage).toHaveLength(1);
    expect(summary.perMessage[0].estimated).toBe(true);
  });

  it("returns empty summary when no real data and nothing to estimate", () => {
    // Mensaje user sin contenido, sin assistant con tag/totalTokens → 0
    const summary = computeSessionTokens([msg(1, "user", "")]);
    expect(summary.hasUsage).toBe(false);
    expect(summary.estimated).toBe(false);
    expect(summary.totalTokens).toBe(0);
    expect(summary.perMessage).toEqual([]);
  });

  // ─── #230: contextTokens / contextOutput (gauge vs log) ──────────────

  it("#230: contextTokens = input del último turno, NO la suma acumulada", () => {
    const messages = [
      msg(1, "assistant", tag(`input="100000" output="1000"`)),
      msg(2, "assistant", tag(`input="193000" output="500"`)),
    ];
    const summary = computeSessionTokens(messages);
    // totalInput sigue siendo acumulado (coste, compat): 293k
    expect(summary.totalInput).toBe(293000);
    // contextTokens = 193k (el contexto real del último turno = el del log)
    expect(summary.contextTokens).toBe(193000);
    expect(summary.contextOutput).toBe(500);
  });

  it("#230: contextTokens usa totalTokens del último mensaje si no hay tag", () => {
    const messages = [
      msg(1, "assistant", "respuesta sin tag (legacy)"),
      msg(2, "assistant", "otra respuesta"),
    ];
    messages[0].totalTokens = 100000;
    messages[1].totalTokens = 193000;
    const summary = computeSessionTokens(messages);
    expect(summary.contextTokens).toBe(193000);
  });

  it("#230: contextTokens es 0 si no hay datos reales (solo estimación)", () => {
    const messages = [
      msg(1, "user", "hola"),
      msg(2, "assistant", "respuesta sin tag ni totalTokens"),
    ];
    const summary = computeSessionTokens(messages);
    // totalTokens tiene la estimación chars/4, pero contextTokens es 0
    expect(summary.contextTokens).toBe(0);
    expect(summary.totalTokens).toBeGreaterThan(0);
  });

  it("#230: contextOutput es 0 cuando el último mensaje usa totalTokens (sin tag)", () => {
    const messages = [msg(1, "assistant", "respuesta runtime")];
    messages[0].totalTokens = 50000;
    const summary = computeSessionTokens(messages);
    expect(summary.contextTokens).toBe(50000);
    expect(summary.contextOutput).toBe(0);
  });
});

describe("resolveGaugeTokens (#230 regresión gauge mudo)", () => {
  it("usa contextTokens cuando hay dato real (no estimado)", () => {
    const summary = computeSessionTokens([
      msg(1, "assistant", tag(`input="193000" output="500"`)),
    ]);
    expect(summary.estimated).toBe(false);
    const resolved = resolveGaugeTokens(summary);
    expect(resolved).toEqual({ tokens: 193000, output: 500, estimated: false });
  });

  it("usa totalTokens (suma estimada) cuando solo hay estimación chars/4", () => {
    const summary = computeSessionTokens([
      msg(1, "assistant", "respuesta legacy sin tag ni totalTokens"),
    ]);
    // contextTokens = 0 por diseño (#230) pero hay estimación > 0
    expect(summary.estimated).toBe(true);
    expect(summary.contextTokens).toBe(0);
    expect(summary.totalTokens).toBeGreaterThan(0);
    const resolved = resolveGaugeTokens(summary);
    expect(resolved.tokens).toBe(summary.totalTokens);
    expect(resolved.output).toBe(0);
    expect(resolved.estimated).toBe(true);
  });

  it("devuelve 0/0 cuando no hay nada que mostrar (chat vacío)", () => {
    const resolved = resolveGaugeTokens(EMPTY_SESSION_TOKENS);
    expect(resolved).toEqual({ tokens: 0, output: 0, estimated: false });
  });
});

describe("computeGauge", () => {
  it("computes pct and flags for a healthy context", () => {
    const g = computeGauge({ totalTokens: 10_000, contextWindow: 128_000 });
    expect(g.pctUsed).toBe(8);
    expect(g.pctRemaining).toBe(92);
    expect(g.level).toBe("ok");
    expect(g.showWarning).toBe(false);
    expect(g.showCompact).toBe(false);
  });

  it("warns when remaining is below the warn threshold", () => {
    const g = computeGauge({
      totalTokens: 110_000,
      contextWindow: 128_000,
    });
    expect(g.pctUsed).toBe(86);
    expect(g.pctRemaining).toBe(14);
    expect(g.showWarning).toBe(true);
    expect(g.level).toBe("critical");
  });

  it(`recommends compact at >= ${GAUGE_COMPACT_PCT_USED}% used`, () => {
    const g = computeGauge({
      totalTokens: Math.round(128_000 * (GAUGE_COMPACT_PCT_USED / 100)),
      contextWindow: 128_000,
    });
    expect(g.showCompact).toBe(true);
    expect(g.showWarning).toBe(true);
  });

  it("caps pctUsed at 100 and stays critical past the window", () => {
    const g = computeGauge({ totalTokens: 200_000, contextWindow: 128_000 });
    expect(g.pctUsed).toBe(100);
    expect(g.pctRemaining).toBe(0);
    expect(g.level).toBe("critical");
    expect(g.showCompact).toBe(true);
  });

  it("is inert without a valid contextWindow", () => {
    const g = computeGauge({ totalTokens: 50_000, contextWindow: 0 });
    expect(g.pctUsed).toBe(0);
    expect(g.showWarning).toBe(false);
    expect(g.showCompact).toBe(false);
    expect(g.level).toBe("ok");
  });

  it("is inert with zero tokens (no data yet)", () => {
    const g = computeGauge({ totalTokens: 0, contextWindow: 128_000 });
    expect(g.pctUsed).toBe(0);
    expect(g.showWarning).toBe(false);
    expect(g.showCompact).toBe(false);
  });

  it(`warn threshold constant is ${GAUGE_WARN_PCT_REMAINING}`, () => {
    expect(GAUGE_WARN_PCT_REMAINING).toBe(15);
  });
});

describe("formatTokenCount", () => {
  it("formats thousands as k", () => {
    expect(formatTokenCount(12_400)).toBe("12.4k");
    expect(formatTokenCount(128_000)).toBe("128k");
    expect(formatTokenCount(1_000)).toBe("1k");
  });
  it("formats millions as M", () => {
    expect(formatTokenCount(1_200_000)).toBe("1.2M");
  });
  it("keeps small counts as-is", () => {
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(0)).toBe("0");
  });
});

describe("donut helpers", () => {
  it("exposes a sane circumference for the radius", () => {
    expect(DONUT_CIRCUMFERENCE).toBeCloseTo(2 * Math.PI * 14, 5);
  });

  it("full arc at 100% (offset 0)", () => {
    expect(computeDonutDashOffset(100)).toBeCloseTo(0, 5);
  });

  it("empty arc at 0% (full circumference offset)", () => {
    expect(computeDonutDashOffset(0)).toBeCloseTo(DONUT_CIRCUMFERENCE, 5);
  });

  it("half arc at 50%", () => {
    expect(computeDonutDashOffset(50)).toBeCloseTo(DONUT_CIRCUMFERENCE / 2, 5);
  });

  it("clamps out-of-range percentages", () => {
    expect(computeDonutDashOffset(150)).toBeCloseTo(0, 5);
    expect(computeDonutDashOffset(-10)).toBeCloseTo(DONUT_CIRCUMFERENCE, 5);
  });
});
