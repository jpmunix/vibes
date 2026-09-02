import { describe, expect, it } from "vitest";
import {
  parseModelReference,
  serializeModelReference,
  type ModelReference,
} from "./model_reference";

describe("model_reference — card #VIBES-229", () => {
  it.each<[string, ModelReference]>([
    ["deepseek/deepseek-v4-flash", { provider: "openrouter", model: "deepseek/deepseek-v4-flash" }],
    ["openrouter::anthropic/claude-4", { provider: "openrouter", model: "anthropic/claude-4" }],
    ["ollama::qwen2.5-coder:7b", { provider: "ollama", model: "qwen2.5-coder:7b" }],
    ["lmstudio::local/model", { provider: "lmstudio", model: "local/model" }],
    [
      "custom::command-code::xiaomi/mimo-v2.5",
      { provider: "custom::command-code", model: "xiaomi/mimo-v2.5" },
    ],
    [
      "custom::custom::minube::deepseek/model",
      { provider: "custom::custom::minube", model: "deepseek/model" },
    ],
    ["custom::legacy-model", { provider: "custom", model: "legacy-model" }],
  ])("parsea %s sin mezclar provider y modelo", (raw, expected) => {
    expect(parseModelReference(raw)).toEqual(expected);
  });

  it("permite un provider fallback explícito para strings legacy pelados", () => {
    expect(parseModelReference("claude-4", "anthropic")).toEqual({
      provider: "anthropic",
      model: "claude-4",
    });
  });

  it.each(["", "   ", "ollama::", "::model", "custom::id::"]) (
    "rechaza una referencia vacía o incompleta: %j",
    (raw) => expect(parseModelReference(raw)).toBeNull(),
  );

  it.each<[ModelReference, string]>([
    [{ provider: "openrouter", model: "deepseek/deepseek-v4-flash" }, "deepseek/deepseek-v4-flash"],
    [{ provider: "ollama", model: "qwen3" }, "ollama::qwen3"],
    [
      { provider: "custom::command-code", model: "xiaomi/mimo-v2.5" },
      "custom::command-code::xiaomi/mimo-v2.5",
    ],
  ])("serializa %j al formato compatible de settings", (reference, expected) => {
    expect(serializeModelReference(reference)).toBe(expected);
  });

  it("hace round-trip sin perder barras o dos puntos del nombre", () => {
    const raw = "custom::command-code::xiaomi/mimo-v2.5:free";
    const parsed = parseModelReference(raw);
    expect(parsed).not.toBeNull();
    expect(serializeModelReference(parsed!)).toBe(raw);
  });

  it("no serializa referencias incompletas", () => {
    expect(() => serializeModelReference({ provider: "", model: "qwen3" })).toThrow(
      /non-empty provider and model/,
    );
    expect(() => serializeModelReference({ provider: "ollama", model: "" })).toThrow(
      /non-empty provider and model/,
    );
  });
});
