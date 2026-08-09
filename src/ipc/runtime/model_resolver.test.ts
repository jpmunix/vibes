/**
 * B6: Unit tests for model_resolver.ts — settings → openai-compatible target.
 *
 * The resolver is the single place that decides which endpoint/model the
 * runtime bridge talks to, so its precedence rules are contract-grade:
 * custom static model > selectedModel; customProviders > ollama > lmstudio >
 * openrouter native; non-compatible providers route via OpenRouter with the
 * `provider/model` gateway prefix.
 */

import { describe, it, expect, vi } from "vitest";

// Mock the electron-touching imports BEFORE importing the module under test.
vi.mock("../../main/settings", () => ({
  readSettings: vi.fn(() => ({})),
}));
vi.mock("../utils/read_env", () => ({
  getEnvVar: vi.fn(() => undefined),
}));

import {
  resolveRuntimeModelTarget,
  resolveRuntimeModelTargetFromSettings,
} from "./model_resolver";
import { readSettings } from "../../main/settings";
import { getEnvVar } from "../utils/read_env";

type AnySettings = Parameters<typeof resolveRuntimeModelTargetFromSettings>[0];

const settings = (patch: Record<string, unknown> = {}): AnySettings =>
  ({
    selectedModel: null,
    providerSettings: {},
    customProviders: [],
    ...patch,
  }) as unknown as AnySettings;

describe("resolveRuntimeModelTargetFromSettings — precedence", () => {
  it("returns null when no selectedModel is configured", () => {
    expect(resolveRuntimeModelTargetFromSettings(settings())).toBeNull();
  });

  it("custom providers resolve to their apiBaseUrl", () => {
    const target = resolveRuntimeModelTargetFromSettings(
      settings({
        selectedModel: { provider: "mybox", name: "llama3" },
        customProviders: [
          { id: "mybox", apiBaseUrl: "http://10.0.0.5:8000/v1", apiKey: { value: "k1" } },
        ],
      }),
    );
    expect(target).toEqual({
      protocol: "openai-compatible",
      baseUrl: "http://10.0.0.5:8000/v1",
      apiKey: "k1",
      defaultModel: "llama3",
    });
  });

  it("ollama uses the default localhost base with /v1", () => {
    const target = resolveRuntimeModelTargetFromSettings(
      settings({ selectedModel: { provider: "ollama", name: "qwen3" } }),
    );
    expect(target?.baseUrl).toBe("http://localhost:11434/v1");
    expect(target?.apiKey).toBe("");
    expect(target?.defaultModel).toBe("qwen3");
  });

  it("ollama honors a custom ollamaBaseUrl (trailing slashes stripped)", () => {
    const target = resolveRuntimeModelTargetFromSettings(
      settings({
        selectedModel: { provider: "ollama", name: "m" },
        ollamaBaseUrl: "http://192.168.1.20:11434///",
      } as Record<string, unknown>),
    );
    expect(target?.baseUrl).toBe("http://192.168.1.20:11434/v1");
  });

  it("lmstudio resolves to localhost:1234/v1", () => {
    const target = resolveRuntimeModelTargetFromSettings(
      settings({ selectedModel: { provider: "lmstudio", name: "m" } }),
    );
    expect(target?.baseUrl).toBe("http://localhost:1234/v1");
  });

  it("openrouter resolves to the native endpoint with the settings key", () => {
    const target = resolveRuntimeModelTargetFromSettings(
      settings({
        selectedModel: { provider: "openrouter", name: "anthropic/claude-4" },
        providerSettings: { openrouter: { apiKey: { value: "or-key" } } },
      }),
    );
    expect(target).toEqual({
      protocol: "openai-compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "or-key",
      defaultModel: "anthropic/claude-4",
    });
  });

  it("openrouter without any key returns null", () => {
    const target = resolveRuntimeModelTargetFromSettings(
      settings({ selectedModel: { provider: "openrouter", name: "m" } }),
    );
    expect(target).toBeNull();
  });

  it("openrouter multi-key: selectedKeyId picks the right key", () => {
    const target = resolveRuntimeModelTargetFromSettings(
      settings({
        selectedModel: { provider: "openrouter", name: "m" },
        providerSettings: {
          openrouter: {
            selectedKeyId: "k2",
            keys: [
              { id: "k1", key: { value: "first" } },
              { id: "k2", key: { value: "second" } },
            ],
          },
        },
      }),
    );
    expect(target?.apiKey).toBe("second");
  });

  it("non-compatible providers route via OpenRouter with the gateway prefix", () => {
    const target = resolveRuntimeModelTargetFromSettings(
      settings({
        selectedModel: { provider: "anthropic", name: "claude-4-opus" },
        providerSettings: { openrouter: { apiKey: { value: "or-key" } } },
      }),
    );
    expect(target?.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(target?.defaultModel).toBe("anthropic/claude-4-opus");
  });

  it("non-compatible providers without an OpenRouter fallback return null", () => {
    const target = resolveRuntimeModelTargetFromSettings(
      settings({ selectedModel: { provider: "anthropic", name: "claude-4-opus" } }),
    );
    expect(target).toBeNull();
  });

  it("a custom agent static model beats the selectedModel", () => {
    const target = resolveRuntimeModelTargetFromSettings(
      settings({
        selectedModel: { provider: "openrouter", name: "main-model" },
        providerSettings: { openrouter: { apiKey: { value: "or-key" } } },
      }),
      { customAgentModelSource: "static", customAgentModel: "ollama/custom-agent-model" },
    );
    expect(target?.defaultModel).toBe("custom-agent-model");
    expect(target?.baseUrl).toBe("http://localhost:11434/v1");
  });

  it("an unparseable static model (no slash) falls back to selectedModel", () => {
    const target = resolveRuntimeModelTargetFromSettings(
      settings({
        selectedModel: { provider: "ollama", name: "fallback-model" },
      }),
      { customAgentModelSource: "static", customAgentModel: "no-slash-here" },
    );
    expect(target?.defaultModel).toBe("fallback-model");
  });
});

describe("resolveRuntimeModelTarget — env var fallback", () => {
  it("falls back to the shell env var when settings have no key", () => {
    vi.mocked(getEnvVar).mockReturnValueOnce("env-or-key");
    vi.mocked(readSettings).mockReturnValueOnce(
      settings({
        selectedModel: { provider: "openrouter", name: "m" },
      }) as any,
    );

    const target = resolveRuntimeModelTarget();
    expect(getEnvVar).toHaveBeenCalledWith("OPENROUTER_API_KEY");
    expect(target?.apiKey).toBe("env-or-key");
  });
});
