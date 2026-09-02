import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText, streamText } from "ai";
import { getModelClient } from "./get_model_client";
import { modelCompletion, modelStreamCompletion } from "./model_completion";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  Output: {
    json: vi.fn(() => ({ type: "json" })),
  },
}));
vi.mock("./get_model_client", () => ({
  getModelClient: vi.fn(),
}));

const settings = {} as Parameters<typeof modelCompletion>[1];
const model = { provider: "fake", modelId: "xiaomi/mimo-v2.5" } as any;

describe("model_completion — card #VIBES-229", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getModelClient).mockResolvedValue({
      modelClient: { model },
    } as any);
  });

  it("entrega provider y nombre real por separado a getModelClient", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "ok",
      usage: { inputTokens: 12, outputTokens: 3 },
    } as any);

    const result = await modelCompletion(
      { provider: "custom::command-code", model: "xiaomi/mimo-v2.5" },
      settings,
      { messages: [{ role: "user", content: "hola" }] },
    );

    expect(getModelClient).toHaveBeenCalledWith(
      { provider: "custom::command-code", name: "xiaomi/mimo-v2.5" },
      settings,
      { enableProviderTools: false },
    );
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model }),
    );
    expect(result).toEqual({
      text: "ok",
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it("propaga temperature, maxOutputTokens y abortSignal con los nombres del SDK", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "ok",
      usage: { inputTokens: undefined, outputTokens: undefined },
    } as any);
    const abortSignal = new AbortController().signal;

    await modelCompletion(
      { provider: "ollama", model: "qwen3" },
      settings,
      {
        messages: [{ role: "system", content: "sé breve" }],
        temperature: 0,
        maxOutputTokens: 321,
        abortSignal,
      },
    );

    expect(generateText).toHaveBeenCalledWith({
      model,
      messages: [{ role: "system", content: "sé breve" }],
      temperature: 0,
      maxOutputTokens: 321,
      abortSignal,
    });
  });

  it("no inventa fallbacks ni traga errores del provider", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("HTTP 503 upstream unavailable"));
    await expect(
      modelCompletion(
        { provider: "lmstudio", model: "local-model" },
        settings,
        { messages: [{ role: "user", content: "hola" }] },
      ),
    ).rejects.toThrow("HTTP 503 upstream unavailable");
  });

  it("streaming usa la misma referencia tipada y devuelve el resultado del SDK", async () => {
    const streamResult = { textStream: Symbol("textStream") } as any;
    vi.mocked(streamText).mockReturnValue(streamResult);

    const result = await modelStreamCompletion(
      { provider: "openrouter", model: "deepseek/deepseek-v4-flash" },
      settings,
      {
        messages: [{ role: "user", content: "hola" }],
        temperature: 0.2,
      },
    );

    expect(getModelClient).toHaveBeenCalledWith(
      { provider: "openrouter", name: "deepseek/deepseek-v4-flash" },
      settings,
      { enableProviderTools: false },
    );
    expect(streamText).toHaveBeenCalledWith({
      model,
      messages: [{ role: "user", content: "hola" }],
      temperature: 0.2,
    });
    expect(result).toBe(streamResult);
  });

  it("solicita y expone salida JSON estructurada para el router de memoria", async () => {
    const parsed = { memoryIds: [3, 8] };
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify(parsed),
      output: parsed,
      usage: { inputTokens: 30, outputTokens: 6 },
    } as any);

    const result = await modelCompletion(
      { provider: "custom::command-code", model: "xiaomi/mimo-v2.5" },
      settings,
      {
        messages: [{ role: "user", content: "selecciona" }],
        output: "json",
      },
    );

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
        output: expect.anything(),
      }),
    );
    expect(result).toEqual({
      text: JSON.stringify(parsed),
      output: parsed,
      usage: { inputTokens: 30, outputTokens: 6 },
    });
  });

  it("falla antes de invocar el SDK si no existe configuración del provider", async () => {
    vi.mocked(getModelClient).mockRejectedValue(
      new Error("Configuration not found for provider: custom::missing"),
    );
    await expect(
      modelCompletion(
        { provider: "custom::missing", model: "m" },
        settings,
        { messages: [{ role: "user", content: "hola" }] },
      ),
    ).rejects.toThrow("Configuration not found for provider: custom::missing");
    expect(generateText).not.toHaveBeenCalled();
  });
});
