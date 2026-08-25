import { describe, it, expect } from "vitest";
import { isLastConfiguredProvider } from "./CustomProviderSection";
import type { UserSettings } from "@/lib/schemas";

// Card #160 — guard D5: no permitir borrar un provider si es el ÚNICO
// configurado (dejaría la app sin ningún proveedor). Ollama cuenta como
// activo salvo que esté explícitamente desactivado (ollamaEnabled === false),
// replicando la convención de useMultiProviderModels.

function baseSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    providerSettings: {},
    customProviders: [],
    ollamaEnabled: true,
    ...overrides,
  } as UserSettings;
}

describe("isLastConfiguredProvider (guard D5)", () => {
  it("1 custom provider y nada más → NO es el último (Ollama activo por defecto)", () => {
    const settings = baseSettings({
      customProviders: [
        {
          id: "custom::mi-proxy",
          name: "Mi Proxy",
          apiBaseUrl: "https://proxy.example.com/v1",
          modelsSource: "openai-compatible",
        },
      ],
    });
    expect(isLastConfiguredProvider(settings)).toBe(false);
  });

  it("1 custom provider + ollamaEnabled:false y sin OpenRouter → ES el último", () => {
    const settings = baseSettings({
      ollamaEnabled: false,
      customProviders: [
        {
          id: "custom::mi-proxy",
          name: "Mi Proxy",
          apiBaseUrl: "https://proxy.example.com/v1",
          modelsSource: "openai-compatible",
        },
      ],
    });
    expect(isLastConfiguredProvider(settings)).toBe(true);
  });

  it("OpenRouter con keys + 1 custom → NO es el último", () => {
    const settings = baseSettings({
      ollamaEnabled: false, // fuerza el caso: OpenRouter + custom siguen contando
      providerSettings: {
        openrouter: {
          keys: [{ id: "k1", key: { value: "sk-or-v1-xxx", encryptionType: "plaintext" } }],
          selectedKeyId: "k1",
        },
      },
      customProviders: [
        {
          id: "custom::mi-proxy",
          name: "Mi Proxy",
          apiBaseUrl: "https://proxy.example.com/v1",
          modelsSource: "openai-compatible",
        },
      ],
    });
    expect(isLastConfiguredProvider(settings)).toBe(false);
  });

  it("settings vacíos (null/undefined) → ES el último (defensivo: no sabemos si hay otros)", () => {
    // Con settings null/undefined no hay forma de saber qué providers existen.
    // El guard es conservador: bloquea el borrado ante la incertidumbre.
    expect(isLastConfiguredProvider(null)).toBe(true);
    expect(isLastConfiguredProvider(undefined)).toBe(true);
  });

  it("ollamaEnabled:false y sin OpenRouter ni customs → ES el último (cero providers)", () => {
    const settings = baseSettings({ ollamaEnabled: false });
    expect(isLastConfiguredProvider(settings)).toBe(true);
  });
});
