import { describe, it, expect } from "vitest";
import {
  PROVIDER_PRESETS,
  getPresetById,
  resolvePresetOrCustom,
  isCanonicalPreset,
} from "@/lib/providerPresets";

describe("providerPresets (Card #99 Slice A)", () => {
  it("debe contener exactamente 7 presets oficiales más el preset Custom", () => {
    expect(PROVIDER_PRESETS.length).toBe(8);
    const custom = PROVIDER_PRESETS.find((p) => p.isCustom);
    expect(custom).toBeDefined();
    expect(custom?.id).toBe("custom");

    const nonCustom = PROVIDER_PRESETS.filter((p) => !p.isCustom);
    expect(nonCustom.length).toBe(7);
  });

  it("debe contener los 7 presets requeridos con sus IDs específicos", () => {
    const expectedIds = [
      "openrouter",
      "openai",
      "deepseek",
      "groq",
      "xai",
      "ollama",
      "lmstudio",
    ];

    for (const id of expectedIds) {
      const preset = getPresetById(id);
      expect(preset, `El preset ${id} debe existir`).toBeDefined();
      expect(preset?.id).toBe(id);
      expect(preset?.defaultBaseUrl.length).toBeGreaterThan(0);
    }
  });

  it("OpenRouter debe incluir headers específicos (HTTP-Referer y X-Title)", () => {
    const or = getPresetById("openrouter");
    expect(or).toBeDefined();
    expect(or?.extraHeaders).toBeDefined();
    expect(or?.extraHeaders?.["HTTP-Referer"]).toBe("https://vibes.diy");
    expect(or?.extraHeaders?.["X-Title"]).toBe("Vibes");
  });

  it("DeepSeek debe tener la URL base oficial de DeepSeek", () => {
    const ds = getPresetById("deepseek");
    expect(ds).toBeDefined();
    expect(ds?.defaultBaseUrl).toBe("https://api.deepseek.com/v1");
    expect(ds?.kind).toBe("openai-compatible");
    expect(ds?.requiresApiKey).toBe(true);
  });

  it("Groq debe tener la URL base oficial de Groq OpenAI-compatible", () => {
    const groq = getPresetById("groq");
    expect(groq).toBeDefined();
    expect(groq?.defaultBaseUrl).toBe("https://api.groq.com/openai/v1");
    expect(groq?.kind).toBe("openai-compatible");
    expect(groq?.requiresApiKey).toBe(true);
  });

  it("Ollama y LM Studio deben ser locales y no requerir API Key por defecto", () => {
    const ollama = getPresetById("ollama");
    expect(ollama?.requiresApiKey).toBe(false);
    expect(ollama?.defaultBaseUrl).toBe("http://localhost:11434/v1");

    const lmstudio = getPresetById("lmstudio");
    expect(lmstudio?.requiresApiKey).toBe(false);
    expect(lmstudio?.defaultBaseUrl).toBe("http://localhost:1234/v1");
  });

  describe("resolvePresetOrCustom (migración y fallback)", () => {
    it("proveedores existentes sin presetId se resuelven como 'custom'", () => {
      const legacyProvider = {
        id: "custom::mi-proxy",
        name: "Mi Proxy",
        apiBaseUrl: "https://proxy.local/v1",
      };
      const resolved = resolvePresetOrCustom(legacyProvider);
      expect(resolved.id).toBe("custom");
      expect(resolved.isCustom).toBe(true);
    });

    it("proveedores con presetId válido se resuelven a su preset correspondiente", () => {
      const deepseekProvider = {
        id: "custom::deepseek",
        name: "DeepSeek",
        apiBaseUrl: "https://api.deepseek.com/v1",
        presetId: "deepseek",
      };
      const resolved = resolvePresetOrCustom(deepseekProvider);
      expect(resolved.id).toBe("deepseek");
      expect(resolved.name).toBe("DeepSeek");
    });

    it("proveedores con presetId desconocido hacen fallback a 'custom'", () => {
      const invalidPresetProvider = {
        id: "custom::desconocido",
        name: "Desconocido",
        apiBaseUrl: "https://example.com/v1",
        presetId: "non_existent_preset",
      };
      const resolved = resolvePresetOrCustom(invalidPresetProvider);
      expect(resolved.id).toBe("custom");
    });

    it("sin proveedor retorna 'custom'", () => {
      expect(resolvePresetOrCustom(undefined).id).toBe("custom");
    });
  });

  describe("isCanonicalPreset", () => {
    it("reconoce presets canónicos y rechaza 'custom' o vacíos", () => {
      expect(isCanonicalPreset("deepseek")).toBe(true);
      expect(isCanonicalPreset("openrouter")).toBe(true);
      expect(isCanonicalPreset("custom")).toBe(false);
      expect(isCanonicalPreset(undefined)).toBe(false);
      expect(isCanonicalPreset("inventado")).toBe(false);
    });
  });
});
