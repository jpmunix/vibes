/**
 * Card #209 — Precio puntual vía catálogo (badge <vibes-token-usage>).
 *
 * Testea `getCatalogModelPricing`, la API única de precios del catálogo:
 * models.dev es la única fuente de verdad (el servicio legacy de OpenRouter
 * fue extirpado). Hereda los mocks de los tests de card #87 (electron →
 * tmpdir aislado, fs/promises en memoria, electron-log silencioso) y el
 * fixture real de catálogo.
 *
 * Contrato: NUNCA lanza y siempre devuelve strings (vacías si no hay datos).
 * El consumidor (badge de tokens) hace fallback al recuento sin coste.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── Estado hoisted compartido con los vi.mock factories ────────────────────
const hoisted = vi.hoisted(() => ({
  diskStore: null as Record<string, string> | null, // path → contenido
  tmpRoot: "",
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => hoisted.tmpRoot),
  },
}));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(async (p: string) => {
      if (hoisted.diskStore && p in hoisted.diskStore) {
        return hoisted.diskStore[p];
      }
      throw new Error(`ENOENT: ${p}`);
    }),
    writeFile: vi.fn(async (p: string, data: string) => {
      hoisted.diskStore = { ...hoisted.diskStore, [p]: data };
    }),
    unlink: vi.fn(async (p: string) => {
      if (hoisted.diskStore && p in hoisted.diskStore) {
        delete hoisted.diskStore[p];
      }
    }),
  };
});

vi.mock("electron-log", () => {
  const noop = () => {};
  const logger = {
    scope: () => ({ info: noop, warn: noop, error: noop, debug: noop }),
    info: noop,
    warn: noop,
    error: noop,
  };
  return { default: logger };
});

import {
  getCatalogModelPricing,
  _resetModelsDevCacheForTests,
} from "./models_dev_service";
import sampleFixture from "./__fixtures__/models-dev-sample.json";

// ── Helpers de fetch ────────────────────────────────────────────────────────

/** Response mínimo que el SDK consume (.ok, .text(), .status, .body?.cancel). */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "ERR",
    body: { cancel: async () => {} },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const LIVE_CATALOG = sampleFixture as unknown as {
  providers: Record<string, unknown>;
  models: Record<string, unknown>;
};

function okFetch(): typeof fetch {
  return vi.fn(async () => jsonResponse(LIVE_CATALOG, 200)) as unknown as typeof fetch;
}
function failFetch(): typeof fetch {
  return vi.fn(async () => {
    throw new Error("ECONNREFUSED (no network)");
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  hoisted.tmpRoot = await mkdtemp(join(tmpdir(), "models-dev-pricing-"));
  hoisted.diskStore = null;
  _resetModelsDevCacheForTests();
});

afterEach(async () => {
  await rm(hoisted.tmpRoot, { recursive: true, force: true });
});

// ─── getCatalogModelPricing ─────────────────────────────────────────────────

describe("getCatalogModelPricing", () => {
  it("devuelve precios por-token para un modelo con coste", async () => {
    // anthropic/claude-opus-4-5 → 5/25 USD por 1M.
    const pricing = await getCatalogModelPricing("anthropic/claude-opus-4-5", {
      fetch: okFetch(),
    });
    expect(pricing).toEqual({
      priceIn: "0.0000050000",
      priceOut: "0.0000250000",
    });
  });

  it("devuelve strings vacías si el modelo no existe o no tiene coste", async () => {
    const pricing = await getCatalogModelPricing("openai/no-existe", {
      fetch: okFetch(),
    });
    expect(pricing).toEqual({ priceIn: "", priceOut: "" });
  });

  it("remoto caído → catálogo del snapshot embebido (floor offline)", async () => {
    // Política de fuentes (card #87): fetch falla → snapshot embebido del SDK,
    // nunca vacío. El precio sale del modelo REAL del snapshot.
    const pricing = await getCatalogModelPricing("anthropic/claude-opus-4-5", {
      fetch: failFetch(),
    });
    expect(pricing.priceIn).not.toBe("");
    expect(pricing.priceOut).not.toBe("");
  });

  it("remoto caído → catálogo del snapshot embebido (floor offline)", async () => {
    // Política de fuentes (card #87): fetch falla → snapshot embebido del SDK,
    // nunca vacío. El precio sale del modelo REAL del snapshot.
    const pricing = await getCatalogModelPricing("anthropic/claude-opus-4-5", {
      fetch: failFetch(),
    });
    expect(pricing.priceIn).not.toBe("");
    expect(pricing.priceOut).not.toBe("");
  });
});
