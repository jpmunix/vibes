/**
 * Card #87 — Slice B: transform / filtro / lookup / enriquecimiento.
 *
 * Tests de las funciones puras de models_dev_service (no requieren red):
 *   pricingFromCost, toModelOption, isRelevantForCoding, findModel,
 *   enrichModelOption, getFallbackModel, isModelKnown/Deprecated.
 * `getCatalogModels` sí resuelve el catálogo → se inyecta un fetch doble.
 *
 * El catálogo de referencia es el fixture real de models.dev
 * (`__fixtures__/models-dev-sample.json`): 6 providers con datos reales.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Catalog, Model, ModelMetadata } from "@opencode-ai/models";

const hoisted = vi.hoisted(() => ({ tmpRoot: "", diskStore: null as Record<string, string> | null }));

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

import {
  pricingFromCost,
  toModelOption,
  isRelevantForCoding,
  findModel,
  enrichModelOption,
  getFallbackModel,
  isModelKnown,
  isModelDeprecated,
  getCatalogModels,
} from "./models_dev_service";
import type { ModelOption } from "../shared/language_model_constants";
import sampleFixture from "./__fixtures__/models-dev-sample.json";

const CATALOG = sampleFixture as unknown as Catalog;

// Un modelo sintético controlado para el mapeo exacto de toModelOption.
const SYNTH_MODEL: Model = {
  id: "my-model",
  name: "My Model",
  description: "Desc",
  attachment: false,
  reasoning: true,
  tool_call: true,
  structured_output: true,
  temperature: true,
  release_date: "2026-01-01",
  last_updated: "2026-01-02",
  modalities: { input: ["text", "image"], output: ["text"] },
  open_weights: false,
  limit: { context: 200000, output: 16384 },
  // 3/15 USD por 1M → "0.000003"/"0.000015" por token (formato card #209)
  cost: { input: 3, output: 15, cache_read: 0.3 },
} as unknown as Model;

beforeEach(async () => {
  hoisted.tmpRoot = await mkdtemp(join(tmpdir(), "models-dev-b-"));
  hoisted.diskStore = null;
});
afterEach(async () => {
  await rm(hoisted.tmpRoot, { recursive: true, force: true });
});

// ─── pricingFromCost ───────────────────────────────────────────────────────

describe("pricingFromCost", () => {
  it("formatea USD/M y asigna la escala de $ según el output", () => {
    expect(pricingFromCost({ input: 3, output: 15 })).toEqual({
      pricingInput: "0.0000030000",
      pricingOutput: "0.0000150000",
      dollarSigns: 3, // <=15
    });
    expect(pricingFromCost({ input: 1, output: 1 }).dollarSigns).toBe(1);
    expect(pricingFromCost({ input: 1, output: 5 }).dollarSigns).toBe(2);
    expect(pricingFromCost({ input: 1, output: 0 }).dollarSigns).toBe(0); // gratis
    expect(pricingFromCost({ input: 1, output: 40 }).dollarSigns).toBe(4);
  });
});

// ─── toModelOption ─────────────────────────────────────────────────────────

describe("toModelOption", () => {
  it("mapea los campos de un Model del catálogo", () => {
    const opt = toModelOption(SYNTH_MODEL);
    expect(opt.name).toBe("my-model");
    expect(opt.displayName).toBe("My Model");
    expect(opt.contextWindow).toBe(200000);
    expect(opt.maxOutputTokens).toBe(16384);
    expect(opt.inputModalities).toEqual(["text", "image"]);
    expect(opt.outputModalities).toEqual(["text"]);
    expect(opt.supportedParameters).toEqual(
      expect.arrayContaining(["tools", "reasoning", "temperature", "structured_output"]),
    );
    expect(opt.tag).toBe("Reasoning");
    expect(opt.tagColor).toBe("purple");
    expect(opt.pricingInput).toBe("0.0000030000");
    expect(opt.pricingOutput).toBe("0.0000150000");
    expect(opt.dollarSigns).toBe(3);
  });

  it("usa el overrideName para el ID compuesto de Vibes", () => {
    const opt = toModelOption(SYNTH_MODEL, undefined, "anthropic/my-model");
    expect(opt.name).toBe("anthropic/my-model");
    expect(opt.displayName).toBe("My Model");
  });

  it("prioriza la metadata provider-agnóstica para name/description", () => {
    const meta = {
      id: "x/y",
      name: "Meta Name",
      description: "Meta description",
    } as ModelMetadata;
    const opt = toModelOption(SYNTH_MODEL, meta);
    expect(opt.displayName).toBe("Meta Name");
    expect(opt.description).toBe("Meta description");
  });

  it("sin cost no emite precios (nunca 'gratis' falso)", () => {
    const noCost = { ...SYNTH_MODEL, cost: undefined } as unknown as Model;
    const opt = toModelOption(noCost);
    expect(opt.pricingInput).toBeUndefined();
    expect(opt.dollarSigns).toBeUndefined();
  });
});

// ─── isRelevantForCoding ───────────────────────────────────────────────────

describe("isRelevantForCoding", () => {
  it("acepta un modelo GA con tools y contexto amplio", () => {
    const anthropic = Object.values(CATALOG.providers.anthropic.models).find(
      (m) => m.id === "claude-fable-5",
    )!;
    expect(isRelevantForCoding(anthropic)).toBe(true);
  });

  it("descarta modelos deprecated", () => {
    const gpt4 = CATALOG.providers.openai.models["gpt-4"];
    expect(isRelevantForCoding(gpt4)).toBe(false);
  });

  it("descarta contexto < 32k", () => {
    const gpt35 = CATALOG.providers.openai.models["gpt-3.5-turbo"];
    expect(isRelevantForCoding(gpt35)).toBe(false);
  });

  it("descarta sin tool_call", () => {
    const noTools = { ...SYNTH_MODEL, tool_call: false } as unknown as Model;
    expect(isRelevantForCoding(noTools)).toBe(false);
  });
});

// ─── findModel ─────────────────────────────────────────────────────────────

describe("findModel", () => {
  it("encuentra por id exacto en el provider (id pelado)", () => {
    const hit = findModel(CATALOG, "anthropic", "claude-opus-4-5");
    expect(hit.model?.name).toBeDefined();
    expect(hit.canonicalId).toBe("anthropic/claude-opus-4-5");
  });

  it("encuentra por id compuesto del provider (openrouter)", () => {
    const hit = findModel(CATALOG, "openrouter", "aion-labs/aion-2.0");
    expect(hit.model).toBeDefined();
    expect(hit.canonicalId).toBe("openrouter/aion-labs/aion-2.0");
  });

  it("resuelve global por id normalizado cuando no se da el provider", () => {
    const hit = findModel(CATALOG, "", "claude-opus-4-5");
    expect(hit.model?.id).toBe("claude-opus-4-5");
    expect(hit.canonicalId).toBe("anthropic/claude-opus-4-5");
  });

  it("devuelve hit vacío si el modelo no existe", () => {
    const hit = findModel(CATALOG, "anthropic", "no-existe-12345");
    expect(hit.model).toBeUndefined();
    expect(hit.meta).toBeUndefined();
  });
});

// ─── enrichModelOption ─────────────────────────────────────────────────────

describe("enrichModelOption", () => {
  it("rellena los huecos de un modelo pobre con datos del catálogo", () => {
    const poor: ModelOption = { name: "claude-opus-4-5", displayName: "Claude", description: "" };
    const enriched = enrichModelOption(poor, CATALOG, "anthropic/claude-opus-4-5");
    expect(enriched.contextWindow).toBeGreaterThan(0);
    // El pobre no tenía precio → toma el del catálogo.
    expect(enriched.pricingInput).toBeDefined();
  });

  it("NO sobreescribe los valores que ya trae el provider (precedencia)", () => {
    const rich: ModelOption = {
      name: "claude-opus-4-5",
      displayName: "Claude Opus (custom)",
      description: "",
      contextWindow: 12345, // valor del provider, debe ganarle al catálogo
    };
    const enriched = enrichModelOption(rich, CATALOG, "anthropic/claude-opus-4-5");
    expect(enriched.contextWindow).toBe(12345); // no sobreescrito
    expect(enriched.displayName).toBe("Claude Opus (custom)");
  });

  it("devuelve el base intacto si el catálogo no lo conoce", () => {
    const unknown: ModelOption = { name: "foo/bar", displayName: "Foo", description: "" };
    const enriched = enrichModelOption(unknown, CATALOG, "foo/bar");
    expect(enriched).toEqual(unknown);
  });
});

// ─── Fallback + known/deprecated (Slice D preview) ─────────────────────────

describe("getFallbackModel / isModelKnown / isModelDeprecated", () => {
  it("sugiere un modelo GA del MISMO provider (deepseek, 1M ctx)", () => {
    const fb = getFallbackModel(CATALOG, "deepseek");
    // deepseek nativo → id pelado (key del catálogo, formato de Vibes).
    // Sin "actual" dado, el candidato es el deepseek de mayor contexto.
    expect(fb).toBeDefined();
    expect(fb).not.toContain("/");
    expect(["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash", "deepseek-v4-pro"]).toContain(fb);
  });

  it("no sugiere el modelo actual como fallback", () => {
    const fb = getFallbackModel(CATALOG, "deepseek", "deepseek-chat");
    expect(fb).not.toBe("deepseek/deepseek-chat");
  });

  it("devuelve undefined si el provider no tiene candidatos viables (openai fixture: GA sin contexto + deprecated)", () => {
    const fb = getFallbackModel(CATALOG, "openai");
    expect(fb).toBeUndefined();
  });

  it("isModelKnown: true para un modelo real, false para uno inventado", () => {
    expect(isModelKnown(CATALOG, "anthropic", "claude-opus-4-5")).toBe(true);
    expect(isModelKnown(CATALOG, "anthropic", "no-existe-12345")).toBe(false);
  });

  it("isModelDeprecated: true para gpt-4, false para claude-fable-5", () => {
    expect(isModelDeprecated(CATALOG, "openai", "gpt-4")).toBe(true);
    expect(isModelDeprecated(CATALOG, "anthropic", "claude-fable-5")).toBe(false);
  });
});

// ─── getCatalogModels (resuelve catálogo vía fetch inyectado) ─────────────

describe("getCatalogModels", () => {
  it("devuelve modelos filtrados con ID compuesto (anthropic)", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(CATALOG, 200),
    ) as unknown as typeof fetch;
    const models = await getCatalogModels("anthropic", { fetch: fetcher });
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].name).toMatch(/^anthropic\//);
    expect(models[0].contextWindow).toBeGreaterThan(0);
  });

  it("devuelve [] si el provider no tiene modelos relevantes (openai fixture)", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(CATALOG, 200),
    ) as unknown as typeof fetch;
    const models = await getCatalogModels("openai", { fetch: fetcher });
    expect(models).toEqual([]);
  });

  it("mantiene el ID compuesto de openrouter (aion-labs/...)", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(CATALOG, 200),
    ) as unknown as typeof fetch;
    const models = await getCatalogModels("openrouter", { fetch: fetcher });
    if (models.length > 0) {
      expect(models[0].name).toMatch(/^aion-labs\//);
    }
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    body: { cancel: async () => {} },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}
