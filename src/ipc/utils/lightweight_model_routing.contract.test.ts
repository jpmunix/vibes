import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");

const LIGHTWEIGHT_CALLERS = [
  "src/ipc/handlers/chat_handlers.ts",
  "src/ipc/handlers/app_handlers.ts",
  "src/ipc/handlers/github_handlers.ts",
  "src/ipc/handlers/playground_handlers.ts",
  "src/ipc/handlers/design_handlers.ts",
  "src/ipc/utils/auto_commit_message.ts",
  "src/ipc/utils/memory_context_builder.ts",
] as const;

function source(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("lightweight model routing — card #VIBES-229", () => {
  it("el módulo específico de OpenRouter quedó extirpado (sin callers ni helpers globales)", () => {
    expect(existsSync(resolve(ROOT, "src/ipc/utils/openrouter.ts"))).toBe(false);
  });

  it.each([
    "src/ipc/handlers/chat_stream_handlers.ts",
    "src/ipc/utils/vision_preprocessor.ts",
    "src/hooks/useSelectedModelSupportsImages.ts",
  ])("%s ya no usa el parser legacy de schemas", (relativePath) => {
    const content = source(relativePath);
    expect(content).not.toMatch(/parseModelString\s*\(/);
  });
  it.each(LIGHTWEIGHT_CALLERS)(
    "%s no depende de completions ni guards globales de OpenRouter",
    (relativePath) => {
      const content = source(relativePath);
      expect(content).not.toMatch(/\bopenRouterCompletion\s*\(/);
      expect(content).not.toMatch(/\bopenRouterStreamCompletion\s*\(/);
      expect(content).not.toMatch(/\bhasOpenRouterApiKey\s*\(/);
    },
  );

  it("chat enruta título y resumen por modelCompletion", () => {
    expect(source("src/ipc/handlers/chat_handlers.ts").match(/modelCompletion\s*\(/g)).toHaveLength(2);
  });

  it("app enruta ambos generadores de nombre por modelCompletion", () => {
    expect(source("src/ipc/handlers/app_handlers.ts").match(/modelCompletion\s*\(/g)).toHaveLength(2);
  });

  it("GitHub enruta squash y stream de commit por la frontera común", () => {
    const content = source("src/ipc/handlers/github_handlers.ts");
    expect(content.match(/modelCompletion\s*\(/g)).toHaveLength(1);
    expect(content.match(/modelStreamCompletion\s*\(/g)).toHaveLength(1);
  });

  it("memoria conserva structured output JSON en la frontera neutral", () => {
    const content = source("src/ipc/utils/memory_context_builder.ts");
    expect(content).toContain('output: "json"');
    expect(content).toMatch(/modelCompletion\s*\(modelReference, settings/);
  });

  it("diseño transporta provider y model separados por IPC", () => {
    const contract = source("src/ipc/types/design.ts");
    const renderer = source("src/components/DesignPicker.tsx");
    const handler = source("src/ipc/handlers/design_handlers.ts");

    expect(contract).toMatch(/provider:\s*z\.string\(\)/);
    expect(contract).toMatch(/model:\s*z\.string\(\)/);
    expect(renderer).toContain("provider: modelReference.provider");
    expect(renderer).toContain("model: modelReference.name");
    expect(handler).toMatch(/modelCompletion\s*\(\s*\{\s*provider,\s*model\s*\}/);
  });

  it("ningún ID interno (custom::/ollama::/lmstudio::/vibes:) llega al wire del provider", async () => {
    const {
      resolveRuntimeModelTargetFromSettings,
      resolveRuntimeFallbackTarget,
    } = await import("../runtime/model_resolver");
    const settings = {
      selectedModel: null,
      customProviders: [
        { id: "my-provider", apiBaseUrl: "http://localhost:4321/v1" },
        { id: "custom::legacy-provider", apiBaseUrl: "http://localhost:4322/v1" },
      ],
      providerSettings: { openrouter: { apiKey: { value: "sk-or" } } },
    } as any;

    // selectedModel (settings) usa ids pelados → defaultModel pelado.
    const fromSelected = [
      resolveRuntimeModelTargetFromSettings({
        ...settings,
        selectedModel: { provider: "my-provider", name: "my-model" },
      } as never),
      resolveRuntimeModelTargetFromSettings({
        ...settings,
        selectedModel: { provider: "ollama", name: "llama3" },
      } as never),
      resolveRuntimeModelTargetFromSettings({
        ...settings,
        selectedModel: { provider: "lmstudio", name: "local-model" },
      } as never),
      resolveRuntimeModelTargetFromSettings({
        ...settings,
        selectedModel: { provider: "openrouter", name: "anthropic/claude-4" },
      } as never),
    ];

    // Referencias persistidas (string con ::) pasan por el codec → defaultModel pelado.
    const fromFallback = [
      resolveRuntimeFallbackTarget("custom::legacy-provider::my-model", settings as never),
      resolveRuntimeFallbackTarget("ollama::llama3", settings as never),
      resolveRuntimeFallbackTarget("lmstudio::local-model", settings as never),
    ];

    for (const target of [...fromSelected, ...fromFallback]) {
      expect(target).not.toBeNull();
      expect(target?.defaultModel).not.toContain("vibes:");
      expect(target?.defaultModel).not.toMatch(/(^|::)(vibes|custom|ollama|lmstudio)(::|$)/);
    }
  });
});
