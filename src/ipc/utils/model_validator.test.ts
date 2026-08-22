/**
 * Card #87 — Slice D: validator multi-proveedor (boot).
 *
 * Testea `validateModelReferences` (función pura, sin I/O): valida TODAS las
 * referencias de modelos contra el catálogo de models.dev y migra las muertas
 * con un fallback del MISMO provider (o universal de OpenRouter).
 *
 * Formato de los IDs (verificado en ProviderSwitchDialog + model_resolver):
 *   - openrouter  → name = "vendor/model" (con /), provider = "openrouter"
 *   - nativo      → name = "claude-opus-4-5" (PELADO), provider = "anthropic"
 *   - cross/local → "ollama::qwen2.5-coder" (separador ::)
 *   - custom      → provider = "custom::id", name = apiName (validado en DB)
 */
import { describe, it, expect } from "vitest";
import type { Catalog } from "@opencode-ai/models";
import { validateModelReferences } from "./model_validator";
import type { UserSettings } from "../../lib/schemas";
import sampleFixture from "./__fixtures__/models-dev-sample.json";

const CATALOG = sampleFixture as unknown as Catalog;

/** ¿Algún elemento de la lista contiene el substring? (Vitest no anida matchers en toContain). */
const containsAny = (arr: string[], sub: string) => arr.some((e) => e.includes(sub));

const base = (patch: Record<string, unknown> = {}): UserSettings =>
  ({
    selectedModel: { name: "anthropic/claude-opus-4.6", provider: "openrouter" },
    executorModel: null,
    strategistModel: null,
    enabledOpenRouterModels: [],
    ...patch,
  }) as unknown as UserSettings;

const deps = { catalog: CATALOG, customModelNames: new Set<string>() };

// ─── selectedModel ─────────────────────────────────────────────────────────

describe("selectedModel", () => {
  it("openrouter válido → no migra (preserva name+provider)", () => {
    const s = base({ selectedModel: { name: "aion-labs/aion-2.0", provider: "openrouter" } });
    const r = validateModelReferences(s, deps);
    expect(r.settings.selectedModel).toEqual({ name: "aion-labs/aion-2.0", provider: "openrouter" });
    expect(containsAny(r.migrated, "selectedModel")).toBe(false);
  });

  it("nativo válido (name PELADO) → no migra", () => {
    const s = base({ selectedModel: { name: "claude-opus-4-5", provider: "anthropic" } });
    const r = validateModelReferences(s, deps);
    expect(r.settings.selectedModel?.name).toBe("claude-opus-4-5");
    expect(r.settings.selectedModel?.provider).toBe("anthropic");
  });

  it("openrouter muerto → fallback universal de OpenRouter", () => {
    const s = base({ selectedModel: { name: "vendor/model-jetado", provider: "openrouter" } });
    const r = validateModelReferences(s, deps);
    // El fallback es un vendor/model conocido de OR (google/gemini-3-flash-preview).
    expect(r.settings.selectedModel?.provider).toBe("openrouter");
    expect(r.settings.selectedModel?.name).toMatch(/google\//);
    expect(containsAny(r.migrated, "selectedModel")).toBe(true);
  });

  it("nativo muerto → fallback del MISMO provider (id pelado)", () => {
    const s = base({ selectedModel: { name: "modelo-inexistente", provider: "deepseek" } });
    const r = validateModelReferences(s, deps);
    expect(r.settings.selectedModel?.provider).toBe("deepseek");
    // id pelado de deepseek (key del catálogo), no un vendor/model.
    expect(r.settings.selectedModel?.name).not.toContain("/");
    expect(containsAny(r.migrated, "selectedModel")).toBe(true);
  });

  it("nativo sin candidatos viables (openai fixture: deprecated/ctx<32k) → fallback universal OR", () => {
    const s = base({ selectedModel: { name: "modelo-inexistente", provider: "openai" } });
    const r = validateModelReferences(s, deps);
    expect(r.settings.selectedModel?.provider).toBe("openrouter");
  });

  it("nativo deprecated → SOLO aviso (no auto-migra)", () => {
    const s = base({ selectedModel: { name: "gpt-4", provider: "openai" } });
    const r = validateModelReferences(s, deps);
    expect(r.settings.selectedModel?.name).toBe("gpt-4"); // intacto
    expect(containsAny(r.deprecated, "gpt-4")).toBe(true);
    expect(containsAny(r.migrated, "selectedModel")).toBe(false);
  });

  it("custom muerto pero en la DB → no toca", () => {
    const withCustom = { catalog: CATALOG, customModelNames: new Set(["mi-modelo"]) };
    const s = base({ selectedModel: { name: "mi-modelo", provider: "custom::box1" } });
    const r = validateModelReferences(s, withCustom);
    expect(r.settings.selectedModel?.name).toBe("mi-modelo");
    expect(containsAny(r.migrated, "selectedModel")).toBe(false);
  });

  it("custom model de la DB sobre OpenRouter (builtinProviderId=OR) → no toca", () => {
    // Regresión del fix: el original cargaba solo customs con
    // builtinProviderId === "openrouter"; ahora cuentan para cualquier provider.
    const withCustom = { catalog: CATALOG, customModelNames: new Set(["mi-custom-or"]) };
    const s = base({ selectedModel: { name: "mi-custom-or", provider: "openrouter" } });
    const r = validateModelReferences(s, withCustom);
    expect(r.settings.selectedModel?.name).toBe("mi-custom-or");
    expect(r.settings.selectedModel?.provider).toBe("openrouter");
    expect(containsAny(r.migrated, "selectedModel")).toBe(false);
  });
});

// ─── Referencias de string (executor/strategist/memories) ──────────────────

describe("referencias de string", () => {
  it("custom::id::nombre (doble separador) válido en DB → no migra", () => {
    // Formato real que escribe useMultiProviderModels / StrategistModelSelector.
    const withCustom = { catalog: CATALOG, customModelNames: new Set(["mi-modelo"]) };
    const s = base({ strategistModel: "custom::cortecs::mi-modelo" });
    const r = validateModelReferences(s, withCustom);
    expect(r.settings.strategistModel).toBe("custom::cortecs::mi-modelo");
    expect(containsAny(r.migrated, "strategistModel")).toBe(false);
  });

  it("custom::id::nombre muerto → fallback OR y NO deja el nombre mal parseado", () => {
    const s = base({ strategistModel: "custom::cortecs::modelo-jetado" });
    const r = validateModelReferences(s, deps);
    // El fallback es un vendor/model de openrouter (sin separador ::).
    expect(r.settings.strategistModel).toMatch(/google\//);
    expect(r.settings.strategistModel).not.toContain("::");
  });

  it("catálogo vacío → no valida nada (guard anti-falso-positivo)", () => {
    const empty = { catalog: { providers: {}, models: {} } as Catalog, customModelNames: new Set<string>() };
    const s = base({
      selectedModel: { name: "vendor/jetado", provider: "openrouter" },
      executorModel: "otro/jetado",
    });
    const r = validateModelReferences(s, empty);
    expect(r.migrated).toEqual([]);
    expect(r.deprecated).toEqual([]);
    expect(r.settings.selectedModel?.name).toBe("vendor/jetado");
  });
  it("openrouter válido (vendor/model) → no migra", () => {
    const s = base({ executorModel: "aion-labs/aion-2.0" });
    const r = validateModelReferences(s, deps);
    expect(r.settings.executorModel).toBe("aion-labs/aion-2.0");
  });

  it("openrouter muerto → fallback OR (vendor/model)", () => {
    const s = base({ executorModel: "vendor/model-jetado" });
    const r = validateModelReferences(s, deps);
    expect(r.settings.executorModel).toMatch(/google\//);
    expect(containsAny(r.migrated, "executorModel")).toBe(true);
  });

  it("cross-provider local válido (ollama::...) → no migra (runtime)", () => {
    const s = base({ executorModel: "ollama::qwen2.5-coder" });
    const r = validateModelReferences(s, deps);
    expect(r.settings.executorModel).toBe("ollama::qwen2.5-coder");
  });

  it("cross-provider nativo muerto (anthropic::jetado) → fallback del mismo provider", () => {
    const s = base({ executorModel: "anthropic::modelo-jetado" });
    const r = validateModelReferences(s, deps);
    // El fallback de un nativo con candidatos → anthropic::<id pelado>.
    expect(r.settings.executorModel).toMatch(/^anthropic::/);
  });
});

// ─── enabledOpenRouterModels (picker) ──────────────────────────────────────

describe("enabledOpenRouterModels", () => {
  it("prune modelos muertos + deprecated, conserva los vivos", () => {
    const s = base({
      enabledOpenRouterModels: [
        "aion-labs/aion-2.0", // vivo en el catálogo OR
        "vendor/model-jetado", // muerto
      ],
    });
    const r = validateModelReferences(s, deps);
    expect(r.settings.enabledOpenRouterModels).toContain("aion-labs/aion-2.0");
    expect(r.settings.enabledOpenRouterModels).not.toContain("vendor/model-jetado");
  });

  it("si todo queda pruned → DEFAULT_ENABLED_MODELS", () => {
    const s = base({ enabledOpenRouterModels: ["muerto/1", "muerto/2"] });
    const r = validateModelReferences(s, deps);
    expect(r.settings.enabledOpenRouterModels?.length).toBeGreaterThan(0);
    expect(r.settings.enabledOpenRouterModels).not.toContain("muerto/1");
  });

  it("no toca la lista si todos son vivos", () => {
    const s = base({ enabledOpenRouterModels: ["aion-labs/aion-2.0"] });
    const r = validateModelReferences(s, deps);
    expect(r.settings.enabledOpenRouterModels).toEqual(["aion-labs/aion-2.0"]);
    expect(containsAny(r.migrated, "enabledOpenRouterModels")).toBe(false);
  });
});

// ─── Invariancia general ───────────────────────────────────────────────────

describe("invariantes", () => {
  it("NO muta el settings original", () => {
    const s = base({ selectedModel: { name: "vendor/jetado", provider: "openrouter" } });
    const original = JSON.parse(JSON.stringify(s));
    validateModelReferences(s, deps);
    expect(s).toEqual(original);
  });

  it("settings sin selectedModel → no rompe", () => {
    const s = base({ selectedModel: null });
    const r = validateModelReferences(s, deps);
    expect(r.settings.selectedModel).toBeNull();
  });
});
