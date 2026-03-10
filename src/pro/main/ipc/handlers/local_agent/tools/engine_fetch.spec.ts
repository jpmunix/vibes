import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { engineFetch } from "./engine_fetch";

vi.mock("@/main/settings", () => ({
  readSettings: () => ({
    selectedModel: {
      name: "google/gemini-3-flash-preview",
      provider: "openrouter",
    },
    providerSettings: {
      openrouter: {
        apiKey: {
          value: "test-openrouter-key",
        },
      },
      auto: {
        apiKey: {
          value: "vibes-api-key",
        },
      },
    },
  }),
}));

vi.mock("@/ipc/utils/read_env", () => ({
  getEnvVar: () => undefined,
}));

describe("engineFetch", () => {
  const ctx = { dyadRequestId: "test-request-id" };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("routes turbo file edits through OpenRouter and returns result", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "updated file content" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await engineFetch(ctx, "/tools/turbo-file-edit", {
      method: "POST",
      body: JSON.stringify({
        path: "src/example.ts",
        content: "// ... existing code ...\nconst x = 2;",
        originalContent: "const x = 1;",
        instructions: "Update the constant.",
      }),
    });

    const payload = await response.json();

    expect(payload).toEqual({ result: "updated file content" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-openrouter-key",
        }),
      }),
    );

    const requestBody = JSON.parse(
      (fetchMock.mock.calls[0]?.[1]?.body as string) ?? "{}",
    );
    expect(requestBody.model).toBe("openai/gpt-5.1-codex-mini");
  });
});
