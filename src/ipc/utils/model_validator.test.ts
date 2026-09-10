/**
 * Card #242 — Validación de modelos al arranque (detector puro, sin fallbacks ni mutaciones).
 *
 * Testea `validateModelReferences`: valida TODAS las referencias de modelos contra
 * catálogo de models.dev, providers locales, y custom providers con sus listas cacheadas.
 *
 * ⚠️ En piedra:
 * Cero reescritura automática de settings. Si un modelo no existe o su provider fue
 * borrado, se reporta en `invalidSlots` con la razón exacta ('provider_missing' | 'model_not_found').
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fsSync from "fs";
import * as os from "os";
import * as nodePath from "path";
import type { Catalog } from "@opencode-ai/models";
import {
  validateModelReferences,
  buildDisabledProviderIds,
  SLOT_LABEL_KEY_PREFIX,
  type ValidationDeps,
} from "./model_validator";
import type { UserSettings } from "../../lib/schemas";
import sampleFixture from "./__fixtures__/models-dev-sample.json";

const CATALOG = sampleFixture as unknown as Catalog;

const base = (patch: Record<string, unknown> = {}): UserSettings =>
  ({
    selectedModel: { name: "aion-labs/aion-2.0", provider: "openrouter" },
    executorModel: "aion-labs/aion-2.0",
    strategistModel: "aion-labs/aion-2.0",
    fallbackModel: null,
    memoriesRouterModelV2: null,
    ...patch,
  }) as unknown as UserSettings;

const deps: ValidationDeps = {
  catalog: CATALOG,
  customModelNames: new Set<string>(),
  configuredProviderIds: new Set<string>(["openrouter", "paretoinference", "box1"]),
};

/// ─── selectedModel (excluido por diseño del validador bloqueante) ──────────

describe("selectedModel — excluido del validador bloqueante", () => {
  it("selectedModel nulo o con modelo inexistente NO bloquea (el chat tiene su propio selector)", () => {
    const s = base({
      selectedModel: null,
      executorModel: "aion-labs/aion-2.0",
      strategistModel: "aion-labs/aion-2.0",
    });
    const r = validateModelReferences(s, deps);
    expect(r.isValid).toBe(true);
    expect(r.invalidSlots).toHaveLength(0);
  });

  it("selectedModel con provider inexistente o desactivado NO añade slot inválido", () => {
    const s = base({
      selectedModel: { name: "fantasma", provider: "custom::inexistente" },
      executorModel: "aion-labs/aion-2.0",
      strategistModel: "aion-labs/aion-2.0",
    });
    const r = validateModelReferences(s, deps);
    expect(r.isValid).toBe(true);
    expect(r.invalidSlots).toHaveLength(0);
  });

  it("local provider (ollama/lmstudio) → no añade slot inválido", () => {
    const s = base({
      selectedModel: { name: "qwen2.5-coder:7b", provider: "ollama" },
      executorModel: "aion-labs/aion-2.0",
      strategistModel: "aion-labs/aion-2.0",
    });
    const r = validateModelReferences(s, deps);
    expect(r.isValid).toBe(true);
    expect(r.invalidSlots).toHaveLength(0);
  });
});

// ─── Referencias de string (executor, strategist, etc.) ────────────────────

describe("referencias de string (executor, strategist, fallback, memories)", () => {
  it("executorModel con custom::id::modelo válido → no bloquea", () => {
    const customDeps: ValidationDeps = {
      ...deps,
      configuredProviderIds: new Set(["paretoinference"]),
      providerModelMap: new Map([["custom::paretoinference", new Set(["z-ai"])]]),
    };
    const s = base({
      executorModel: "custom::paretoinference::z-ai",
    });
    const r = validateModelReferences(s, customDeps);
    expect(r.isValid).toBe(true);
  });

  it("executorModel con custom provider ausente → reporta provider_missing", () => {
    const s = base({
      executorModel: "custom::inexistente::z-ai",
    });
    const r = validateModelReferences(s, deps);
    expect(r.isValid).toBe(false);
    expect(r.invalidSlots.some((slot) => slot.slotKey === "executorModel" && slot.reason === "provider_missing")).toBe(true);
  });

  it("strategistModel inválido en OpenRouter → reporta model_not_found", () => {
    const s = base({
      strategistModel: "vendor/fantasma",
    });
    const r = validateModelReferences(s, deps);
    expect(r.isValid).toBe(false);
    expect(r.invalidSlots.some((slot) => slot.slotKey === "strategistModel" && slot.reason === "model_not_found")).toBe(true);
  });

  it("catálogo vacío (offline sin snapshot) → no bloquea", () => {
    const emptyDeps: ValidationDeps = {
      catalog: { providers: {}, models: {} } as Catalog,
      customModelNames: new Set(),
      configuredProviderIds: new Set(),
    };
    const s = base({
      selectedModel: { name: "vendor/jetado", provider: "openrouter" },
      executorModel: "otro/jetado",
    });
    const r = validateModelReferences(s, emptyDeps);
    expect(r.isValid).toBe(true);
    expect(r.invalidSlots).toHaveLength(0);
  });
});

// ─── Custom Agents ─────────────────────────────────────────────────────────

describe("customAgents con modelo estático", () => {
  it("agente con modelo estático de provider inexistente → reporta slot customAgent:ID", () => {
    const customDeps: ValidationDeps = {
      ...deps,
      customAgents: [
        {
          id: 42,
          name: "Agente Auditor",
          modelSource: "static",
          model: "custom::borrado::modelo-x",
        },
      ],
    };
    const s = base();
    const r = validateModelReferences(s, customDeps);
    expect(r.isValid).toBe(false);
    expect(r.invalidSlots.some((slot) => slot.slotKey === "customAgent:42" && slot.reason === "provider_missing")).toBe(true);
  });

  it("agente con modelSource auto o default_model → no valida slot estático", () => {
    const customDeps: ValidationDeps = {
      ...deps,
      customAgents: [
        {
          id: 99,
          name: "Agente Auto",
          modelSource: "auto",
          model: null,
        },
      ],
    };
    const s = base();
    const r = validateModelReferences(s, customDeps);
    expect(r.isValid).toBe(true);
  });
});

// ─── Invariancia ───────────────────────────────────────────────────────────

describe("invariantes", () => {
  it("NO muta el objeto settings original bajo ninguna circunstancia", () => {
    const s = base({
      selectedModel: { name: "vendor/jetado", provider: "openrouter" },
      executorModel: "custom::borrado::algo",
    });
    const originalClone = JSON.parse(JSON.stringify(s));
    validateModelReferences(s, deps);
    expect(s).toEqual(originalClone);
  });
});

// ─── Etiquetas: frontera P1 (el backend no traduce) ────────────────────────

describe("labelKey — el backend nombra, la carcasa traduce", () => {
  it("todo slot inválido emite una clave i18n, nunca texto en español", () => {
    const customDeps: ValidationDeps = {
      ...deps,
      customAgents: [
        { id: 7, name: "Auditor", modelSource: "static", model: "vendor/roto" },
      ],
    };
    const s = base({
      selectedModel: { name: "vendor/jetado", provider: "openrouter" },
      executorModel: "otro/jetado",
    });
    const r = validateModelReferences(s, customDeps);

    expect(r.invalidSlots.length).toBeGreaterThan(0);
    for (const slot of r.invalidSlots) {
      expect(slot.labelKey.startsWith(SLOT_LABEL_KEY_PREFIX)).toBe(true);
      // Guard anti-regresión: ni una tilde ni una palabra en español.
      expect(slot.labelKey).not.toMatch(/[áéíóúñ¿¡]/i);
      expect(slot.labelKey).not.toContain(" ");
    }
  });

  it("el agente personalizado viaja como parámetro, no interpolado en la clave", () => {
    const customDeps: ValidationDeps = {
      ...deps,
      customAgents: [
        { id: 7, name: "Auditor", modelSource: "static", model: "vendor/roto" },
      ],
    };
    const r = validateModelReferences(base(), customDeps);
    const agentSlot = r.invalidSlots.find((s) => s.slotKey === "customAgent:7");

    expect(agentSlot?.labelKey).toBe(`${SLOT_LABEL_KEY_PREFIX}.customAgent`);
    expect(agentSlot?.labelParams).toEqual({ name: "Auditor" });
  });
});

// ─── Nombres de modelo con separadores (hallazgo del vet) ──────────────────

describe("nombres de modelo con / y :", () => {
  it("custom::id::vendor/model valida contra la caché sin romper el nombre", () => {
    // Caso real: la caché guarda "deepseek/deepseek-v4-flash" con barra.
    // parseModelReference usa lastIndexOf(::), así que el nombre se conserva
    // entero. Este test fija ese comportamiento.
    const customDeps: ValidationDeps = {
      ...deps,
      configuredProviderIds: new Set(["custom::minube"]),
      providerModelMap: new Map([
        ["custom::minube", new Set(["deepseek/deepseek-v4-flash"])],
      ]),
    };
    const s = base({
      executorModel: "custom::minube::deepseek/deepseek-v4-flash",
    });
    const r = validateModelReferences(s, customDeps);
    expect(r.isValid).toBe(true);
  });

  it("nombre con dos puntos (ollama-style) sobre custom provider", () => {
    const customDeps: ValidationDeps = {
      ...deps,
      configuredProviderIds: new Set(["custom::minube"]),
      providerModelMap: new Map([
        ["custom::minube", new Set(["qwen2.5-coder:7b"])],
      ]),
    };
    const s = base({ executorModel: "custom::minube::qwen2.5-coder:7b" });
    const r = validateModelReferences(s, customDeps);
    expect(r.isValid).toBe(true);
  });

  it("el mapa se indexa canónicamente: id pelado en deps también resuelve", () => {
    // configuredProviderIds puede traer la forma pelada; el lookup debe
    // canonicalizar y encontrar igualmente la entrada.
    const customDeps: ValidationDeps = {
      ...deps,
      configuredProviderIds: new Set(["minube"]),
      providerModelMap: new Map([["custom::minube", new Set(["z-ai"])]]),
    };
    const s = base({ executorModel: "custom::minube::z-ai" });
    const r = validateModelReferences(s, customDeps);
    expect(r.isValid).toBe(true);
  });
});

// ─── Caché REAL en disco — el test que habría cazado el bug D1 ─────────────
//
// Los tests de arriba construyen `providerModelMap` a mano, así que validan la
// IDEA pero no la REALIDAD. El bug de la card #242 (el validador inventaba el
// nombre del fichero y nunca encontraba la caché) pasó por verde precisamente
// por eso. Estos tests escriben ficheros de verdad y ejercitan la lectura.

describe("loadCachedCustomProviderModels — lectura real de disco", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fsSync.mkdtempSync(
      nodePath.join(os.tmpdir(), `vibes-modelcache-${process.pid}-`),
    );
    // `getCacheFilePath` resuelve contra app.getPath("userData").
    vi.doMock("electron", () => ({
      app: { getPath: () => tmpDir },
      BrowserWindow: { getAllWindows: () => [] },
    }));
  });

  afterEach(() => {
    vi.doUnmock("electron");
    vi.resetModules();
    fsSync.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Escribe una caché con el MISMO formato que produce el servicio real. */
  const writeCache = (fileName: string, models: string[], version = 3) => {
    fsSync.writeFileSync(
      nodePath.join(tmpDir, fileName),
      JSON.stringify({
        models: models.map((name) => ({ name, displayName: name })),
        fetchedAt: Date.now(),
        cacheVersion: version,
      }),
      "utf-8",
    );
  };

  /** Recarga el validador con el mock de electron activo. */
  const loadValidator = async () => {
    vi.resetModules();
    return await import("./model_validator");
  };

  it("encuentra la caché escrita por el servicio (nombre con prefijo custom__)", async () => {
    // Nombre EXACTO verificado en disco de producción.
    writeCache("custom__minube-models-cache.json", ["z-ai", "deepseek/v4"]);

    const mod = await loadValidator();
    const s = base({ executorModel: "custom::minube::z-ai" });
    const r = mod.validateModelReferences(s, {
      ...deps,
      configuredProviderIds: new Set(["custom::minube"]),
      providerModelMap: await mod.loadCachedCustomProviderModels(
        new Set(["custom::minube"]),
      ),
    });

    expect(r.isValid).toBe(true);
  });

  it("un modelo ausente de la caché real se reporta como model_not_found", async () => {
    writeCache("custom__minube-models-cache.json", ["z-ai"]);

    const mod = await loadValidator();
    const map = await mod.loadCachedCustomProviderModels(
      new Set(["custom::minube"]),
    );
    const s = base({ executorModel: "custom::minube::modelo-fantasma" });
    const r = mod.validateModelReferences(s, {
      ...deps,
      configuredProviderIds: new Set(["custom::minube"]),
      providerModelMap: map,
    });

    expect(r.isValid).toBe(false);
    expect(r.invalidSlots[0].reason).toBe("model_not_found");
  });

  it("NO lee un fichero con el nombre viejo (sin prefijo) — anti-regresión D1", async () => {
    // Éste es el nombre que el validador buscaba erróneamente.
    writeCache("minube-models-cache.json", ["z-ai"]);

    const mod = await loadValidator();
    const map = await mod.loadCachedCustomProviderModels(
      new Set(["custom::minube"]),
    );

    expect(map.size).toBe(0);
  });

  it("descarta cachés de una cacheVersion antigua (no bloquea con datos obsoletos)", async () => {
    writeCache("custom__minube-models-cache.json", ["z-ai"], 1);

    const mod = await loadValidator();
    const map = await mod.loadCachedCustomProviderModels(
      new Set(["custom::minube"]),
    );

    expect(map.size).toBe(0);
  });

  it("deduplica: las dos variantes del mismo provider producen UNA entrada canónica", async () => {
    writeCache("custom__minube-models-cache.json", ["z-ai"]);

    const mod = await loadValidator();
    // Tal cual las mete validateModelSettings: con y sin prefijo.
    const map = await mod.loadCachedCustomProviderModels(
      new Set(["custom::minube", "minube"]),
    );

    expect(map.size).toBe(1);
    expect(map.has("custom::minube")).toBe(true);
  });

  it("sin fichero de caché → mapa vacío y NO bloquea (decisión en piedra)", async () => {
    const mod = await loadValidator();
    const map = await mod.loadCachedCustomProviderModels(
      new Set(["custom::recien-anadido"]),
    );

    expect(map.size).toBe(0);

    const s = base({ executorModel: "custom::recien-anadido::lo-que-sea" });
    const r = mod.validateModelReferences(s, {
      ...deps,
      configuredProviderIds: new Set(["custom::recien-anadido"]),
      providerModelMap: map,
    });
    expect(r.isValid).toBe(true);
  });
});

// ─── Slots nulos / vacíos: bloqueantes por diseño ─────────────────────────

describe("slots nulos o vacíos son bloqueantes (model_unspecified)", () => {
  it("strategistModel en null → reporta model_unspecified", () => {
    const s = base({ strategistModel: null });
    const r = validateModelReferences(s, deps);
    expect(r.isValid).toBe(false);
    expect(
      r.invalidSlots.some(
        (slot) =>
          slot.slotKey === "strategistModel" &&
          slot.reason === "model_unspecified",
      ),
    ).toBe(true);
  });

  it("executorModel en string vacío o whitespace → reporta model_unspecified", () => {
    const s = base({ executorModel: "   " });
    const r = validateModelReferences(s, deps);
    expect(r.isValid).toBe(false);
    expect(
      r.invalidSlots.some(
        (slot) =>
          slot.slotKey === "executorModel" &&
          slot.reason === "model_unspecified",
      ),
    ).toBe(true);
  });
});

// ─── buildDisabledProviderIds & provider_disabled ─────────────────────────

describe("buildDisabledProviderIds & provider_disabled", () => {
  it("buildDisabledProviderIds añade ambas variantes (con y sin custom::)", () => {
    const disabled = buildDisabledProviderIds({
      disabledProviders: ["openrouter", "custom::mi-proxy"],
      ollamaEnabled: true,
    });
    expect(disabled.has("openrouter")).toBe(true);
    expect(disabled.has("custom::mi-proxy")).toBe(true);
    expect(disabled.has("mi-proxy")).toBe(true);
    expect(disabled.has("ollama")).toBe(false);
  });

  it("buildDisabledProviderIds incluye ollama cuando ollamaEnabled es false", () => {
    const disabled = buildDisabledProviderIds({
      disabledProviders: [],
      ollamaEnabled: false,
    });
    expect(disabled.has("ollama")).toBe(true);
  });

  it("provider deshabilitado reporta provider_disabled en slots internos", () => {
    const customDeps: ValidationDeps = {
      ...deps,
      configuredProviderIds: new Set(["openrouter"]),
      disabledProviders: new Set(["openrouter"]),
    };
    const s = base({
      executorModel: "openrouter::aion-labs/aion-2.0",
      strategistModel: "openrouter::aion-labs/aion-2.0",
    });
    const r = validateModelReferences(s, customDeps);
    expect(r.isValid).toBe(false);
    expect(r.invalidSlots.length).toBeGreaterThanOrEqual(1);
    expect(
      r.invalidSlots.find((slot) => slot.slotKey === "executorModel"),
    ).toMatchObject({
      slotKey: "executorModel",
      providerId: "openrouter",
      reason: "provider_disabled",
    });
  });

  it("ollama deshabilitado explícitamente reporta provider_disabled en string reference", () => {
    const customDeps: ValidationDeps = {
      ...deps,
      configuredProviderIds: new Set(["ollama"]),
      disabledProviders: new Set(["ollama"]),
    };
    const s = base({
      executorModel: "ollama::qwen2.5-coder:7b",
    });
    const r = validateModelReferences(s, customDeps);
    expect(r.isValid).toBe(false);
    expect(r.invalidSlots).toHaveLength(1);
    expect(r.invalidSlots[0]).toMatchObject({
      slotKey: "executorModel",
      providerId: "ollama",
      reason: "provider_disabled",
    });
  });
});
