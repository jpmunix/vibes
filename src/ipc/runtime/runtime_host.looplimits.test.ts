/**
 * #165 — límites del loop configurables desde Ajustes > Agente (hot-reload).
 *
 * `applyAgentLoopLimits(settings)` muta el LoopConfig del runtime EN CALIENTE
 * (el loop lo lee por referencia en cada iteración, así que el cambio se
 * aplica a la siguiente iteración sin recrear el runtime ni tocar sesiones en
 * curso). `getAgentLoopLimits()` expone el estado actual para diagnóstico y
 * para estos tests.
 *
 * `electron` y `../../main/settings` se mockean (patrón del runtime_host.todo
 * test) porque importar runtime_host arrastra electron + readSettings. Aquí no
 * llamamos a getRuntime(): testear la mutación de límites es suficiente y no
 * requiere abrir SQLite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/vibes-rh-loop-165",
    isPackaged: true,
  },
}));

vi.mock("../../main/settings", () => ({
  readSettings: vi.fn(() => ({})),
}));

vi.mock("./model_resolver", () => ({
  resolveRuntimeModelTarget: vi.fn(() => undefined),
  resolveRuntimeFallbackTarget: vi.fn(() => null),
}));

vi.mock("@vibes/providers/openai-compatible", () => ({
  createOpenAICompatibleProvider: vi.fn((opts: any) => ({ id: opts.id })),
}));

import {
  applyAgentLoopLimits,
  getAgentLoopLimits,
} from "./runtime_host";
import { DEFAULT_LOOP_CONFIG } from "@vibes/runtime";

// Defaults esperados (vibes-core #165): 1000 iteraciones, 4 horas de reloj.
const DEFAULT_ITER = DEFAULT_LOOP_CONFIG.maxIterations; // 1000
const DEFAULT_MS = DEFAULT_LOOP_CONFIG.maxWallClockMs; // 4h en ms

beforeEach(() => {
  // Reset a defaults antes de cada test (loopConfigMutable es a nivel de
  // módulo y persiste entre tests del archivo).
  applyAgentLoopLimits({});
});

describe("applyAgentLoopLimits (165) — hot-reload de límites del loop", () => {
  it("sin settings → defaults de vibes-core (1000 / 4h)", () => {
    applyAgentLoopLimits(undefined);
    const l = getAgentLoopLimits();
    expect(l.maxIterations).toBe(DEFAULT_ITER);
    expect(l.maxWallClockMs).toBe(DEFAULT_MS);
  });

  it("settings vacía → defaults", () => {
    applyAgentLoopLimits({});
    const l = getAgentLoopLimits();
    expect(l.maxIterations).toBe(DEFAULT_ITER);
    expect(l.maxWallClockMs).toBe(DEFAULT_MS);
  });

  it("valores válidos → se aplican (min→ms)", () => {
    applyAgentLoopLimits({
      agentMaxIterations: 5000,
      agentMaxWallClockMinutes: 720, // 12h
    });
    const l = getAgentLoopLimits();
    expect(l.maxIterations).toBe(5000);
    expect(l.maxWallClockMs).toBe(720 * 60 * 1000);
  });

  it("aplica solo iteraciones (wall-clock se resetó al default)", () => {
    applyAgentLoopLimits({ agentMaxIterations: 20000 });
    const l = getAgentLoopLimits();
    expect(l.maxIterations).toBe(20000);
    expect(l.maxWallClockMs).toBe(DEFAULT_MS);
  });

  it("0 / negativos → se caen al default (no permite desactivar)", () => {
    applyAgentLoopLimits({ agentMaxIterations: 0, agentMaxWallClockMinutes: 0 });
    const l = getAgentLoopLimits();
    expect(l.maxIterations).toBe(DEFAULT_ITER);
    expect(l.maxWallClockMs).toBe(DEFAULT_MS);

    applyAgentLoopLimits({ agentMaxIterations: -5 });
    expect(getAgentLoopLimits().maxIterations).toBe(DEFAULT_ITER);
  });

  it("NaN / Infinity → se caen al default", () => {
    applyAgentLoopLimits({
      agentMaxIterations: Number.NaN,
      agentMaxWallClockMinutes: Number.POSITIVE_INFINITY,
    });
    const l = getAgentLoopLimits();
    expect(l.maxIterations).toBe(DEFAULT_ITER);
    expect(l.maxWallClockMs).toBe(DEFAULT_MS);
  });

  it("tipo mal (string) → se caen al default, no crash", () => {
    // @ts-expect-error - probamos la robustez ante un payload corrupto
    applyAgentLoopLimits({ agentMaxIterations: "muchas", agentMaxWallClockMinutes: "mucho" });
    const l = getAgentLoopLimits();
    expect(l.maxIterations).toBe(DEFAULT_ITER);
    expect(l.maxWallClockMs).toBe(DEFAULT_MS);
  });

  it("valores decimales → se truncan a entero (floor)", () => {
    applyAgentLoopLimits({ agentMaxIterations: 123.9, agentMaxWallClockMinutes: 90.9 });
    const l = getAgentLoopLimits();
    expect(l.maxIterations).toBe(123);
    expect(l.maxWallClockMs).toBe(90 * 60 * 1000);
  });

  it("hot-reload: muta el MISMO estado, la siguiente lectura refleja el cambio", () => {
    applyAgentLoopLimits({ agentMaxIterations: 100 });
    expect(getAgentLoopLimits().maxIterations).toBe(100);
    // Segundo cambio: se refleja sobre el mismo objeto.
    applyAgentLoopLimits({ agentMaxIterations: 300 });
    expect(getAgentLoopLimits().maxIterations).toBe(300);
    // El wall-clock se mantiene (no se toca).
    expect(getAgentLoopLimits().maxWallClockMs).toBe(DEFAULT_MS);
  });
});

describe("applyAgentLoopLimits — #215 fallbackModel", () => {
  it("sin fallbackModel → fallbackModel undefined", () => {
    applyAgentLoopLimits({});
    expect(getAgentLoopLimits().fallbackModel).toBeUndefined();
  });

  it("con fallbackModel resoluble → provider aplicado", async () => {
    const { resolveRuntimeFallbackTarget } = vi.mocked(
      await import("./model_resolver"),
    );
    resolveRuntimeFallbackTarget.mockReturnValue({
      protocol: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      defaultModel: "qwen3",
    });
    applyAgentLoopLimits({ fallbackModel: "ollama::qwen3" });
    expect(getAgentLoopLimits().fallbackModel).toBeDefined();
    expect(getAgentLoopLimits().fallbackModel?.id).toBe("vibes:fb:qwen3");
  });

  it("con fallbackModel no resoluble → sin fallback (undefined)", async () => {
    const { resolveRuntimeFallbackTarget } = vi.mocked(
      await import("./model_resolver"),
    );
    resolveRuntimeFallbackTarget.mockReturnValue(null);
    applyAgentLoopLimits({ fallbackModel: "openrouter::no-key" });
    expect(getAgentLoopLimits().fallbackModel).toBeUndefined();
  });
});

describe("applyAgentLoopLimits — #63+#64 compaction", () => {
  it("sin compaction → se conserva el default del runtime (6) y sin summarizerModel", () => {
    applyAgentLoopLimits({});
    expect(getAgentLoopLimits().compaction?.maxRoundsKept).toBe(
      DEFAULT_LOOP_CONFIG.compaction?.maxRoundsKept,
    );
    expect(getAgentLoopLimits().compaction?.summarizerModel).toBeUndefined();
  });

  it("compactionMaxRoundsKept válido → se aplica", () => {
    applyAgentLoopLimits({ compactionMaxRoundsKept: 10 });
    expect(getAgentLoopLimits().compaction?.maxRoundsKept).toBe(10);
  });

  it("compactionMaxRoundsKept decimales → se truncan (floor)", () => {
    applyAgentLoopLimits({ compactionMaxRoundsKept: 7.9 });
    expect(getAgentLoopLimits().compaction?.maxRoundsKept).toBe(7);
  });

  it("con compactionModel resoluble → summarizerModel aplicado", async () => {
    const { resolveRuntimeFallbackTarget } = vi.mocked(
      await import("./model_resolver"),
    );
    resolveRuntimeFallbackTarget.mockReturnValue({
      protocol: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      defaultModel: "qwen3",
    });
    applyAgentLoopLimits({ compactionModel: "ollama::qwen3" });
    expect(getAgentLoopLimits().compaction?.summarizerModel).toBeDefined();
    expect(getAgentLoopLimits().compaction?.summarizerModel?.id).toBe("vibes:compaction:qwen3");
  });

  it("con compactionModel no resoluble → sin summarizerModel (undefined)", async () => {
    const { resolveRuntimeFallbackTarget } = vi.mocked(
      await import("./model_resolver"),
    );
    resolveRuntimeFallbackTarget.mockReturnValue(null);
    applyAgentLoopLimits({ compactionModel: "openrouter::no-key" });
    expect(getAgentLoopLimits().compaction?.summarizerModel).toBeUndefined();
  });
});
