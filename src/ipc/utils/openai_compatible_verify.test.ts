import { describe, it, expect, vi } from "vitest";
import { verifyCustomProviderEndpoint } from "./openai_compatible_verify";
import { parseModelsResponse } from "./openai_compatible_models_parser";

// ─── Fixtures de /models (OpenAI-style + variantes de proveedor) ───

const openaiStyle = {
  object: "list",
  data: [
    { id: "gpt-4o", object: "model", created: 1715367049, owned_by: "openai" },
    { id: "gpt-4o-mini", object: "model", created: 1720000000 },
  ],
};

const flatArrayObjects = [
  { id: "deepseek-chat", object: "model" },
  { id: "deepseek-reasoner", object: "model" },
];

const flatArrayStrings = ["mistral-small", "mistral-large"];

// ─── Helpers ───

function mockFetch(
  body: unknown,
  status = 200,
  statusText = "OK",
): typeof fetch {
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  })) as unknown as typeof fetch;
  return fn;
}

function mockRejectingFetch(message: string): typeof fetch {
  return vi.fn(async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;
}

// ─── parseModelsResponse ───

describe("parseModelsResponse", () => {
  it("parsea el formato estándar OpenAI { data: [...] }", () => {
    expect(parseModelsResponse(openaiStyle)).toEqual([
      { id: "gpt-4o" },
      { id: "gpt-4o-mini" },
    ]);
  });

  it("tolera array plano de objetos con id", () => {
    expect(parseModelsResponse(flatArrayObjects)).toEqual([
      { id: "deepseek-chat" },
      { id: "deepseek-reasoner" },
    ]);
  });

  it("tolera array plano de strings", () => {
    expect(parseModelsResponse(flatArrayStrings)).toEqual([
      { id: "mistral-small" },
      { id: "mistral-large" },
    ]);
  });

  it("descarta items sin id válido", () => {
    expect(
      parseModelsResponse({ data: [{ id: "ok" }, {}, null, 42, ""] }),
    ).toEqual([{ id: "ok" }]);
  });

  it("devuelve [] si la respuesta es válida pero sin modelos", () => {
    expect(parseModelsResponse({ object: "list", data: [] })).toEqual([]);
    expect(parseModelsResponse({})).toEqual([]);
    expect(parseModelsResponse(null)).toEqual([]);
  });
});

// ─── verifyCustomProviderEndpoint ───

describe("verifyCustomProviderEndpoint", () => {
  it("devuelve ok+count+models con respuesta OpenAI-style", async () => {
    const result = await verifyCustomProviderEndpoint(
      "https://api.example.com/v1/",
      undefined,
      mockFetch(openaiStyle),
    );
    expect(result).toEqual({
      ok: true,
      count: 2,
      models: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }],
    });
  });

  it("tolera la variante de array plano", async () => {
    const result = await verifyCustomProviderEndpoint(
      "https://api.deepseek.com",
      undefined,
      mockFetch(flatArrayObjects),
    );
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(result.models).toEqual([
      { id: "deepseek-chat" },
      { id: "deepseek-reasoner" },
    ]);
  });

  it("empty state: count=0 con models vacío si el endpoint no devuelve modelos", async () => {
    const result = await verifyCustomProviderEndpoint(
      "https://api.example.com/v1",
      undefined,
      mockFetch({ object: "list", data: [] }),
    );
    expect(result).toEqual({ ok: true, count: 0, models: [] });
  });

  it("no rompe el flujo actual: error HTTP devuelve ok=false con el mensaje de siempre", async () => {
    const result = await verifyCustomProviderEndpoint(
      "https://api.example.com/v1",
      "sk-bad",
      mockFetch({ error: "unauthorized" }, 401, "Unauthorized"),
    );
    expect(result).toEqual({ ok: false, error: "401 Unauthorized" });
  });

  it("devuelve ok=false si el fetch falla por red", async () => {
    const result = await verifyCustomProviderEndpoint(
      "https://api.example.com/v1",
      undefined,
      mockRejectingFetch("ECONNREFUSED"),
    );
    expect(result).toEqual({ ok: false, error: "ECONNREFUSED" });
  });

  it("quita las barras finales del base URL y llama a {url}/models", async () => {
    const fetcher = mockFetch(openaiStyle);
    await verifyCustomProviderEndpoint(
      "https://api.example.com/v1///",
      undefined,
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledWith("https://api.example.com/v1/models", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("envía la API key como Bearer cuando se proporciona", async () => {
    const fetcher = mockFetch(openaiStyle);
    await verifyCustomProviderEndpoint(
      "https://api.example.com/v1",
      "sk-secret",
      fetcher,
    );
    const [url, init] = (fetcher as any).mock.calls[0];
    expect(url).toBe("https://api.example.com/v1/models");
    expect(init.headers["Authorization"]).toBe("Bearer sk-secret");
  });

  it("expone la respuesta cruda vía onRawData (para los logs del server)", async () => {
    const onRawData = vi.fn();
    await verifyCustomProviderEndpoint(
      "https://api.example.com/v1",
      undefined,
      mockFetch(openaiStyle),
      onRawData,
    );
    expect(onRawData).toHaveBeenCalledWith(openaiStyle);
  });
});
