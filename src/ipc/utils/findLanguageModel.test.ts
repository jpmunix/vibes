/**
 * Card #223 — findLanguageModel: matching tolerante multi-proveedor.
 *
 * El selectedModel.name guardado por ModelPicker es "pelado"
 * ("deepseek-v4-flash"), pero los apiName del catálogo models.dev son
 * compuestos ("deepseek/deepseek-v4-flash"). El matching debe resolver
 * ambos formatos (+ customs con "::" + normalización case/puntuación).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  models: [] as Array<{
    id?: number;
    apiName: string;
    displayName: string;
    contextWindow?: number;
    maxOutputTokens?: number;
    type: "custom" | "local" | "cloud";
  }>,
}));

vi.mock("../shared/language_model_helpers", () => ({
  getLanguageModels: vi.fn(async () => hoisted.models),
}));

import { findLanguageModel } from "./findLanguageModel";

const CATALOG_MODEL = {
  apiName: "deepseek/deepseek-v4-flash",
  displayName: "DeepSeek V4 Flash",
  contextWindow: 1_000_000,
  type: "cloud" as const,
};

beforeEach(() => {
  hoisted.models = [];
});

describe("findLanguageModel (#223 tolerancia multi-proveedor)", () => {
  it("match exacto composite === name (openrouter gateway)", async () => {
    hoisted.models = [CATALOG_MODEL];
    const r = await findLanguageModel({ name: "deepseek/deepseek-v4-flash", provider: "openrouter" } as any);
    expect(r?.apiName).toBe("deepseek/deepseek-v4-flash");
  });

  it("nombre pelado → suffix match contra apiName compuesto (deepseek nativo)", async () => {
    hoisted.models = [CATALOG_MODEL];
    const r = await findLanguageModel({ name: "deepseek-v4-flash", provider: "deepseek" } as any);
    expect(r?.apiName).toBe("deepseek/deepseek-v4-flash");
    expect(r?.contextWindow).toBe(1_000_000);
  });

  it("custom provider con prefijo :: pelado", async () => {
    hoisted.models = [CATALOG_MODEL];
    const r = await findLanguageModel({ name: "custom::cortecs::deepseek-v4-flash", provider: "custom::cortecs" } as any);
    expect(r?.apiName).toBe("deepseek/deepseek-v4-flash");
  });

  it("normalización case/puntuación (DEEPSEEK_V4.FLASH == deepseek-v4-flash)", async () => {
    hoisted.models = [CATALOG_MODEL];
    const r = await findLanguageModel({ name: "DEEPSEEK_V4.FLASH", provider: "deepseek" } as any);
    expect(r?.apiName).toBe("deepseek/deepseek-v4-flash");
  });

  it("custom model por id (customModelId) gana", async () => {
    hoisted.models = [
      { id: 7, apiName: "mi-modelo", displayName: "Mi Modelo", contextWindow: 131_072, type: "custom" as const },
      CATALOG_MODEL,
    ];
    const r = await findLanguageModel({
      name: "deepseek-v4-flash",
      provider: "deepseek",
      customModelId: 7,
    } as any);
    expect(r?.apiName).toBe("mi-modelo");
  });

  it("modelo inexistente → undefined (sin lanzar)", async () => {
    hoisted.models = [CATALOG_MODEL];
    const r = await findLanguageModel({ name: "no-existe-ni-de-lejos", provider: "deepseek" } as any);
    expect(r).toBeUndefined();
  });
});
