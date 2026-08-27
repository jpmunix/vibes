/**
 * Card #209 — Rama cloud de getLanguageModels vía catálogo.
 *
 * La rama cloud de `getLanguageModels` usa ahora `getCatalogModels(providerId)`
 * (modelos del catálogo models.dev) en lugar del servicio legacy de OpenRouter
 * y del fallback hardcodeado MODEL_OPTIONS (ambos extirpados).
 *
 * Se mockea únicamente la frontera del módulo (getCatalogModels) y las
 * dependencias de entorno (electron app.getPath, settings, electron-log).
 * Con un userId vacío, getCustomModels no toca la base de datos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  catalogModels: [] as Array<{
    name: string;
    displayName?: string;
    contextWindow?: number;
  }>,
}));

vi.mock("../utils/models_dev_service", () => ({
  getCatalogModels: vi.fn(async (_providerId: string) => hoisted.catalogModels),
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp/vibes-test") },
}));

vi.mock("electron-log", () => ({
  default: {
    scope: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  },
}));

vi.mock("@/main/settings", () => ({
  readSettings: () => ({ customProviders: [], disabledProviders: [] }),
}));

import { getLanguageModels } from "./language_model_helpers";

beforeEach(() => {
  hoisted.catalogModels = [];
});

describe("getLanguageModels (cloud, card #209)", () => {
  it("usa el catálogo models.dev para un provider cloud", async () => {
    hoisted.catalogModels = [
      { name: "openai/gpt-4", displayName: "GPT-4", contextWindow: 8192 },
    ];
    const models = await getLanguageModels({ providerId: "openai" });
    expect(models).toHaveLength(1);
    expect(models[0].apiName).toBe("openai/gpt-4");
    expect(models[0].type).toBe("cloud");
  });

  it("devuelve vacío si el catálogo no tiene modelos (sin fallback)", async () => {
    const models = await getLanguageModels({ providerId: "openai" });
    expect(models).toEqual([]);
  });
});
