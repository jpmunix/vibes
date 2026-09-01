/**
 * Card #223 — getContextWindow: resolución tolerante del context window real.
 *
 * Precedencia testeada:
 *   1. findLanguageModel (tolerante: bare/composite/custom/normalizado) → contextWindow del modelo
 *   2. Fallback directo al catálogo models.dev (findModel: exacto → metadata → normalizado global)
 *   3. null (desconocido) — NUNCA 128k falso
 *
 * Usa el fixture real de models.dev (`__fixtures__/models-dev-sample.json`):
 * deepseek-v4-flash tiene limit.context = 1_000_000.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hoisted = vi.hoisted(() => ({
  tmpRoot: "",
  diskStore: null as Record<string, string> | null,
  selectedModel: { name: "deepseek-v4-flash", provider: "deepseek" } as {
    name: string;
    provider: string;
  },
}));

vi.mock("electron", () => ({ app: { getPath: vi.fn(() => hoisted.tmpRoot) } }));
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(async (p: string) => {
      if (hoisted.diskStore && p in hoisted.diskStore) return hoisted.diskStore[p];
      throw new Error(`ENOENT: ${p}`);
    }),
    writeFile: vi.fn(async (p: string, data: string) => {
      hoisted.diskStore = { ...hoisted.diskStore, [p]: data };
    }),
    unlink: vi.fn(async (p: string) => {
      if (hoisted.diskStore && p in hoisted.diskStore) delete hoisted.diskStore[p];
    }),
  };
});
vi.mock("electron-log", () => {
  const noop = () => {};
  return { default: { scope: () => ({ info: noop, warn: noop, error: noop }), info: noop, warn: noop, error: noop } };
});

// Mock del settings: el selectedModel lo controla cada test.
vi.mock("../../main/settings", () => ({
  readSettings: () => ({ selectedModel: hoisted.selectedModel }),
}));

// El catálogo real (fixture) servido por resolveCatalog (mock parcial del servicio).
import sampleFixture from "./__fixtures__/models-dev-sample.json";
const CATALOG = sampleFixture as unknown as Catalog;

vi.mock("./models_dev_service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./models_dev_service")>();
  return {
    ...actual,
    resolveCatalog: vi.fn(async () => CATALOG),
  };
});

import { getContextWindow } from "./token_utils";
import type { Catalog } from "./models_dev_service";

// findLanguageModel mockeado: devuelve el modelo que diga el test.
const findLanguageModelMock = vi.hoisted(() => vi.fn());
vi.mock("./findLanguageModel", () => ({
  findLanguageModel: (...args: unknown[]) => findLanguageModelMock(...args),
}));

beforeEach(async () => {
  hoisted.tmpRoot = await mkdtemp(join(tmpdir(), "vibes-223-"));
  hoisted.diskStore = null;
  hoisted.selectedModel = { name: "deepseek-v4-flash", provider: "deepseek" };
  findLanguageModelMock.mockReset();
});

afterEach(async () => {
  await rm(hoisted.tmpRoot, { recursive: true, force: true });
});

describe("getContextWindow (#223)", () => {
  it("modelo resuelto con contextWindow real → lo devuelve", async () => {
    findLanguageModelMock.mockResolvedValue({
      apiName: "deepseek-v4-flash",
      displayName: "DeepSeek V4 Flash",
      contextWindow: 1_000_000,
      type: "cloud",
    });
    await expect(getContextWindow()).resolves.toBe(1_000_000);
  });

  it("modelo pelado no encontrado → fallback al catálogo via findModel (suffix match)", async () => {
    findLanguageModelMock.mockResolvedValue(undefined);
    // selectedModel pelado + provider "deepseek" → findModel acierta con el fixture
    await expect(getContextWindow()).resolves.toBe(1_000_000);
  });

  it("provider openrouter con vendor/model → fallback catálogo (bare)", async () => {
    hoisted.selectedModel = { name: "deepseek/deepseek-v4-flash", provider: "openrouter" };
    findLanguageModelMock.mockResolvedValue(undefined);
    await expect(getContextWindow()).resolves.toBe(1_000_000);
  });

  it("modelo desconocido en catálogo → null (nunca 128k)", async () => {
    hoisted.selectedModel = { name: "modelo-inexistente-xyz", provider: "custom::foo" };
    findLanguageModelMock.mockResolvedValue(undefined);
    await expect(getContextWindow()).resolves.toBeNull();
  });

  it("modelo resuelto sin contextWindow → fallback catálogo", async () => {
    findLanguageModelMock.mockResolvedValue({
      apiName: "deepseek-v4-flash",
      displayName: "DeepSeek V4 Flash",
      type: "cloud",
      // sin contextWindow
    });
    await expect(getContextWindow()).resolves.toBe(1_000_000);
  });
});
