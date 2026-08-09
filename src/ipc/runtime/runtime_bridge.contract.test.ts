/**
 * B6: Contract tests for handleRuntimeStream.
 *
 * These tests are the golden guard of the OpenCode → vibes-core swap: they
 * pin the CONTRACT that chat_stream_handlers.ts relies on (return shape,
 * `chat:response:chunk` IPC payloads, `<vibes-*>` tag emission, hydration
 * semantics, cancellation). They run against a REAL in-process vibes-core
 * runtime with a mocked model provider (synthetic fixtures — munix's
 * decision C: "la c, luego ponemos reales").
 *
 * What is mocked and why:
 *   - ./runtime_host    → a test runtime with in-memory storage (Vibes still
 *                         has no better-sqlite3 installed; swap to sqlite
 *                         storage once `npm install` runs).
 *   - ./model_resolver  → fixed OpenAI-compatible target (no settings/env).
 *   - ../../db/remote   → stub DB for the 10s checkpoint writer.
 *   - ../../paths/paths → workspace rooted in a tmp dir (no real ~/vibes-apps).
 * Nothing from the OpenCode adapter is loaded — the bridge is standalone.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  StorageProvider,
  SessionRecord,
  ModelProvider,
} from "@vibes/runtime";
import {
  createRuntime,
  createInMemoryEventBus,
  createNaiveContextEngine,
} from "@vibes/runtime-impl";
import {
  DEFAULT_LOOP_CONFIG,
  NOOP_PLANNER,
  NOOP_LOGGER,
} from "@vibes/runtime";
import { createFsWorkspace } from "@vibes/workspace";
import { createBuiltInRegistry } from "@vibes/tools";
import { createOpenAICompatibleProvider } from "@vibes/providers/openai-compatible";

// ── Hoisted state shared with the vi.mock factories ──────────────────────
const hoisted = vi.hoisted(() => ({
  testRoot: "",
  runtime: null as unknown as import("@vibes/runtime").Runtime,
  responses: [] as unknown[],
}));

vi.mock("../../db/remote", () => ({
  getRemoteDb: () => ({
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  }),
}));

vi.mock("../../paths/paths", () => ({
  getVibesAppPath: (p: string) => join(hoisted.testRoot, p),
}));

vi.mock("./model_resolver", () => ({
  resolveRuntimeModelTarget: vi.fn(() => ({
    protocol: "openai-compatible",
    baseUrl: "https://mock.local/v1",
    apiKey: "test-key",
    defaultModel: "m",
  })),
  resolveRuntimeModelTargetFromSettings: vi.fn(() => null),
}));

vi.mock("./runtime_host", () => ({
  getRuntime: () => hoisted.runtime,
  shutdownRuntime: async () => {},
  hasRuntimeInstance: () => true,
}));

import {
  handleRuntimeStream,
  getActiveRuntimeSession,
  type RuntimeStreamOptions,
} from "./runtime_bridge";
import { resolveRuntimeModelTarget } from "./model_resolver";

// ============================================================================
// Synthetic fixtures (decision C: synthetic first, real captures later)
// ============================================================================

const MOCK_RESPONSES = {
  noTool: {
    id: "x",
    model: "m",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "Hello from mock model." },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  },
  withWriteTool: {
    id: "x",
    model: "m",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content:
            'I will write the file.\n```json\n{"tool":"write_file","args":{"path":"hello.txt","content":"hello world"}}\n```',
        },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 20, total_tokens: 32 },
  },
};

/** SSE-wrapped mock fetch — same protocol as vibes-core's runtime.test.ts. */
function mockFetch(responses: unknown[]): typeof fetch {
  let i = 0;
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.endsWith("/chat/completions")) {
      return new Response("not found", { status: 404 });
    }
    const body = responses[i++] ?? responses[responses.length - 1];
    const sse = `data: ${JSON.stringify(body)}\n\ndata: [DONE]\n\n`;
    return new Response(sse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
}

/** Fetch that hangs until the abort signal fires (cancellation tests). */
function hangingFetch(): typeof fetch {
  return async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        if (signal.aborted) {
          reject(new Error("aborted"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      }
    });
  };
}

/** In-memory StorageProvider (better-sqlite3 is not installed in Vibes yet). */
function createInMemoryStorage(): StorageProvider & {
  records: Map<string, SessionRecord>;
} {
  const records = new Map<string, SessionRecord>();
  return {
    records,
    async init() {},
    async createSession(record: SessionRecord) {
      records.set(record.id, structuredClone(record));
    },
    async getSession(id: string) {
      const r = records.get(id);
      return r ? structuredClone(r) : null;
    },
    async patchSession(id: string, patch: Partial<SessionRecord>) {
      const r = records.get(id);
      if (r) Object.assign(r, structuredClone(patch), { updatedAt: Date.now() });
    },
    async listSessions() {
      return [...records.values()];
    },
  };
}

// ============================================================================
// Test harness
// ============================================================================

let storage: ReturnType<typeof createInMemoryStorage>;

function buildTestRuntime(
  root: string,
  fetchImpl: typeof fetch,
  permissionGate?: import("@vibes/runtime").PermissionGate,
): import("@vibes/runtime").Runtime {
  const workspace = createFsWorkspace({ root });
  const model: ModelProvider = createOpenAICompatibleProvider(
    { id: "mock", baseUrl: "https://mock.local/v1", defaultModel: "m" },
    { httpFetch: fetchImpl },
  );
  storage = createInMemoryStorage();
  return createRuntime(
    {
      eventBus: createInMemoryEventBus(),
      loopConfig: DEFAULT_LOOP_CONFIG,
      workspace,
      providers: { model, storage },
      context: createNaiveContextEngine(workspace),
      planner: NOOP_PLANNER,
      tools: createBuiltInRegistry(),
      logger: NOOP_LOGGER,
      permissionGate,
    },
    { id: "contract-test" },
  );
}

type SentCall = { channel: string; args: unknown[] };

function makeFakeSender() {
  const calls: SentCall[] = [];
  const sender = {
    isDestroyed: () => false,
    send: (channel: string, ...args: unknown[]) => {
      calls.push({ channel, args });
    },
  };
  return { calls, sender };
}

function makeOptions(overrides: Partial<RuntimeStreamOptions> = {}): RuntimeStreamOptions {
  return {
    placeholderMessageId: 42,
    appPath: "my-app",
    chatMessages: [
      { id: 1, role: "user", content: "say hi" },
      { id: 42, role: "assistant", content: "" },
    ],
    agentId: "build",
    ...overrides,
  };
}

beforeEach(async () => {
  hoisted.testRoot = await mkdtemp(join(tmpdir(), "vibes-contract-"));
});

afterEach(async () => {
  if (hoisted.runtime) await hoisted.runtime.shutdown();
  await rm(hoisted.testRoot, { recursive: true, force: true });
});

// ============================================================================
// Contract: return shape
// ============================================================================

describe("handleRuntimeStream contract — return shape", () => {
  it("returns the exact 7-field shape chat_stream_handlers destructures", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { calls, sender } = makeFakeSender();
    const event = { sender } as any;

    const result = await handleRuntimeStream(
      event,
      { chatId: 1, prompt: "say hi" },
      new AbortController(),
      makeOptions(),
    );

    expect(Object.keys(result).sort()).toEqual(
      ["cachedTokens", "costUsd", "fullResponse", "inputTokens", "outputTokens", "reasoningTokens", "success"].sort(),
    );
    expect(result.success).toBe(true);
    expect(result.fullResponse).toContain("Hello from mock model.");
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
    expect(result.costUsd).toBeNull(); // v1 has no cost accounting (post-MVP)
    expect(calls.length).toBeGreaterThan(0);
  });

  it("fails fast with a friendly message when no model target is configured", async () => {
    vi.mocked(resolveRuntimeModelTarget).mockReturnValueOnce(null);
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();

    const result = await handleRuntimeStream(
      { sender } as any,
      { chatId: 1, prompt: "say hi" },
      new AbortController(),
      makeOptions(),
    );

    expect(result.success).toBe(false);
    expect(result.fullResponse).toMatch(/modelo/i);
  });
});

// ============================================================================
// Contract: IPC chunks
// ============================================================================

describe("handleRuntimeStream contract — IPC chunks", () => {
  it("sends chat:response:chunk with the placeholder assistant filled", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { calls, sender } = makeFakeSender();

    const result = await handleRuntimeStream(
      { sender } as any,
      { chatId: 7, prompt: "say hi" },
      new AbortController(),
      makeOptions(),
    );

    const chunkCalls = calls.filter((c) => c.channel === "chat:response:chunk");
    expect(chunkCalls.length).toBeGreaterThan(0);

    const last = chunkCalls[chunkCalls.length - 1]!.args[0] as {
      chatId: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(last.chatId).toBe(7);
    const lastAssistant = [...last.messages].reverse().find((m) => m.role === "assistant");
    expect(lastAssistant?.content).toBe(result.fullResponse);
  });
});

// ============================================================================
// Contract: tool execution → <vibes-*> tags
// ============================================================================

describe("handleRuntimeStream contract — tool tags", () => {
  it("emits <vibes-write> + <vibes-files-changed> and actually writes the file", async () => {
    hoisted.runtime = buildTestRuntime(
      hoisted.testRoot,
      mockFetch([MOCK_RESPONSES.withWriteTool, MOCK_RESPONSES.noTool]),
    );
    const { sender } = makeFakeSender();

    const result = await handleRuntimeStream(
      { sender } as any,
      { chatId: 2, prompt: "write hello.txt" },
      new AbortController(),
      makeOptions(),
    );

    expect(result.success).toBe(true);
    expect(result.fullResponse).toContain('<vibes-write path="hello.txt"');
    expect(result.fullResponse).toContain("<vibes-files-changed");
    expect(result.fullResponse).toContain('paths="hello.txt"');
    expect(result.fullResponse).toContain("<vibes-token-usage");

    // The tool REALLY ran against the session workspace (tmp dir).
    const written = await readFile(join(hoisted.testRoot, "my-app", "hello.txt"), "utf8");
    expect(written).toBe("hello world");
  });
});

// ============================================================================
// Contract: hydration (DP-4 — Vibes owns the history)
// ============================================================================

describe("handleRuntimeStream contract — hydration", () => {
  it("hydrates history once, scrubs vibes tags, and never duplicates the current prompt", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();

    await handleRuntimeStream(
      { sender } as any,
      { chatId: 3, prompt: "say hi" },
      new AbortController(),
      makeOptions({
        chatMessages: [
          { id: 1, role: "user", content: "pregunta anterior" },
          {
            id: 2,
            role: "assistant",
            content: 'respuesta anterior <vibes-read path="a.ts">file contents</vibes-read>',
          },
          { id: 3, role: "user", content: "say hi" }, // current prompt (already in DB)
          { id: 42, role: "assistant", content: "" }, // placeholder
        ],
      }),
    );

    const sessions = await storage.listSessions();
    expect(sessions.length).toBe(1);
    const record = sessions[0]!;

    const texts = record.messages.map((m) => ({
      role: m.role,
      text: m.content.map((p) => (p.type === "text" ? p.text : "")).join(""),
    }));

    // History hydrated in order, vibes tag scrubbed from assistant history.
    expect(texts[0]).toEqual({ role: "user", text: "pregunta anterior" });
    expect(texts[1]).toEqual({ role: "assistant", text: "respuesta anterior" });

    // The current prompt appears EXACTLY once (no duplication).
    const promptTurns = texts.filter((t) => t.role === "user" && t.text === "say hi");
    expect(promptTurns.length).toBe(1);
  });

  it("composes systemPrompt from contextInstructions + custom prompt", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();

    await handleRuntimeStream(
      { sender } as any,
      { chatId: 4, prompt: "say hi" },
      new AbortController(),
      makeOptions({
        contextInstructions: ["IDIOMA: responde siempre en español"],
        customSystemPrompt: "CUSTOM AGENT PROMPT",
        customPromptMode: "replace",
      }),
    );

    const sessions = await storage.listSessions();
    const record = sessions[0]!;
    expect(record.systemPrompt).toContain("IDIOMA: responde siempre en español");
    expect(record.systemPrompt).toContain("CUSTOM AGENT PROMPT");
    expect(record.systemPrompt).toContain("\n\n---\n\n");
  });

  it("restricts explore agents to read-only tools", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();

    await handleRuntimeStream(
      { sender } as any,
      { chatId: 5, prompt: "look around" },
      new AbortController(),
      makeOptions({ agentId: "explore" }),
    );

    const sessions = await storage.listSessions();
    const record = sessions[0]!;
    expect(record.enabledTools).toEqual(["read_file", "glob", "grep"]);
  });
});

// ============================================================================
// Contract: cancellation
// ============================================================================

describe("handleRuntimeStream contract — cancellation", () => {
  it("aborts mid-stream and returns success=false with cancelled markers", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, hangingFetch());
    const { sender } = makeFakeSender();
    const abortController = new AbortController();

    const runPromise = handleRuntimeStream(
      { sender } as any,
      { chatId: 6, prompt: "never finishes" },
      abortController,
      makeOptions(),
    );

    // Let the session start, then cancel like the Stop button would.
    await new Promise((r) => setTimeout(r, 100));
    expect(getActiveRuntimeSession(6)).toBeDefined();
    abortController.abort();

    const result = await runPromise;
    expect(result.success).toBe(false);
    const hasCancelMarker =
      result.fullResponse.includes("<vibes-cancelled") ||
      result.fullResponse.includes("Operación cancelada");
    expect(hasCancelMarker).toBe(true);
    expect(getActiveRuntimeSession(6)).toBeUndefined();
  });
});

// ============================================================================
// Contract: permission denied (spec B6 #3)
// ============================================================================

describe("handleRuntimeStream contract — permission denied", () => {
  it("a denied tool never runs and the stream still finishes cleanly", async () => {
    // Gate that denies everything (fail-closed posture).
    const denyingGate = {
      requestPermission: vi.fn(async () => "deny" as const),
    };
    hoisted.runtime = buildTestRuntime(
      hoisted.testRoot,
      mockFetch([MOCK_RESPONSES.withWriteTool, MOCK_RESPONSES.noTool]),
      denyingGate,
    );
    const { sender } = makeFakeSender();

    const result = await handleRuntimeStream(
      { sender } as any,
      { chatId: 9, prompt: "write hello.txt" },
      new AbortController(),
      makeOptions(),
    );

    // The gate WAS consulted...
    expect(denyingGate.requestPermission).toHaveBeenCalled();

    // ...and the stream still finishes normally (denial is not a crash).
    expect(result.success).toBe(true);

    // The tool was denied: the file must NOT exist on disk.
    await expect(
      readFile(join(hoisted.testRoot, "my-app", "hello.txt"), "utf8"),
    ).rejects.toThrow();
  });
});

// ============================================================================
// Contract: multi-turn on the same chatId (spec B6 #5)
// ============================================================================
// DP-4: Vibes owns the history. "Resume" in the bridge means a fresh session
// per turn, hydrated with the previous exchange — never resumeSession().

describe("handleRuntimeStream contract — second turn continues the chat", () => {
  it("a second request on the same chatId hydrates the first exchange", async () => {
    hoisted.runtime = buildTestRuntime(
      hoisted.testRoot,
      mockFetch([MOCK_RESPONSES.noTool, MOCK_RESPONSES.noTool]),
    );
    const { sender } = makeFakeSender();

    // Turn 1.
    const r1 = await handleRuntimeStream(
      { sender } as any,
      { chatId: 10, prompt: "say hi" },
      new AbortController(),
      makeOptions({ chatMessages: [{ id: 1, role: "user", content: "say hi" }, { id: 2, role: "assistant", content: "" }] }),
    );
    expect(r1.success).toBe(true);
    expect(r1.fullResponse).toContain("Hello from mock model.");

    // Turn 2 — Vibes would now pass the accumulated history (including the
    // first exchange) as chatMessages, plus the new user prompt.
    const r2 = await handleRuntimeStream(
      { sender } as any,
      { chatId: 10, prompt: "and again" },
      new AbortController(),
      makeOptions({
        chatMessages: [
          { id: 1, role: "user", content: "say hi" },
          { id: 2, role: "assistant", content: r1.fullResponse },
          { id: 3, role: "user", content: "and again" },
          { id: 4, role: "assistant", content: "" },
        ],
      }),
    );
    expect(r2.success).toBe(true);

    // Two sessions were created (one per turn — per-turn-session design)...
    const sessions = await storage.listSessions();
    expect(sessions.length).toBe(2);

    // ...and the SECOND session was hydrated with the first exchange.
    const second = sessions.find((s) => s.prompt === "and again")!;
    const texts = second.messages.map((m) => ({
      role: m.role,
      text: m.content.map((p) => (p.type === "text" ? p.text : "")).join(""),
    }));
    expect(texts[0]).toEqual({ role: "user", text: "say hi" });
    expect(texts[1]!.text).toContain("Hello from mock model.");
    // And the new prompt appears exactly once.
    const newTurns = texts.filter((t) => t.role === "user" && t.text === "and again");
    expect(newTurns.length).toBe(1);
  });
});

// ============================================================================
// Contract: error paths from the provider (Slice 2.3)
// ============================================================================

/** Fetch that returns HTTP 429 (rate-limit) on every request. */
function rateLimitedFetch(): typeof fetch {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.endsWith("/chat/completions")) {
      return new Response("not found", { status: 404 });
    }
    return new Response(
      JSON.stringify({ error: { message: "rate limited", type: "rate_limit_error" } }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
  };
}

/** Fetch that delays past the abort signal — simulates a slow provider. */
function slowFetch(delayMs: number): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.endsWith("/chat/completions")) {
      return new Response("not found", { status: 404 });
    }
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        if (signal.aborted) {
          reject(new Error("aborted"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      }
      setTimeout(() => {
        const sse = `data: ${JSON.stringify(MOCK_RESPONSES.noTool)}\n\ndata: [DONE]\n\n`;
        resolve(
          new Response(sse, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        );
      }, delayMs);
    });
  };
}

describe("handleRuntimeStream contract — provider error 429 (rate-limit)", () => {
  // The openai-compatible provider retries 429s with exponential backoff
  // (1s + 2s + 4s + 8s cap). We give the test 30s to complete all
  // retries and surface finishReason='error' to the bridge.
  it("returns success=false and does not throw when the provider 429s", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, rateLimitedFetch());
    const { calls, sender } = makeFakeSender();
    const abortController = new AbortController();

    // The runtime treats 429 like any other provider error after retries
    // are exhausted: the loop finishes with finishReason='error'. The
    // bridge must surface this as success=false WITHOUT crashing the IPC.
    const result = await handleRuntimeStream(
      { sender } as any,
      { chatId: 7, prompt: "will be rate-limited" },
      abortController,
      makeOptions(),
    );

    expect(result.success).toBe(false);
    // No crash → at least the final chunk must have been sent so the
    // renderer gets a chance to display the error.
    const finalChunk = calls.find(
      (c) => c.channel === "chat:response:chunk",
    );
    expect(finalChunk).toBeDefined();
    expect(getActiveRuntimeSession(7)).toBeUndefined();
  }, 30_000);
});

describe("handleRuntimeStream contract — provider timeout (AbortSignal mid-stream)", () => {
  it("aborts the request via the AbortController and returns success=false", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, slowFetch(30_000));
    const { calls, sender } = makeFakeSender();
    const abortController = new AbortController();

    const runPromise = handleRuntimeStream(
      { sender } as any,
      { chatId: 8, prompt: "very slow" },
      abortController,
      makeOptions(),
    );

    // Simulate the timeout firing before the slow provider responds.
    await new Promise((r) => setTimeout(r, 50));
    abortController.abort();

    const result = await runPromise;
    expect(result.success).toBe(false);
    const hasCancelMarker =
      result.fullResponse.includes("<vibes-cancelled") ||
      result.fullResponse.includes("Operación cancelada");
    expect(hasCancelMarker).toBe(true);
    expect(getActiveRuntimeSession(8)).toBeUndefined();
  });
});

describe("handleRuntimeStream contract — malformed history hydration", () => {
  it("skips garbage messages instead of throwing on hydration", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();

    // Mix of valid + garbage messages. The hydration code in
    // convertHistoryToRuntimeMessages must skip anything that isn't a
    // user/assistant text turn without throwing.
    const garbageMessages: any[] = [
      null,
      undefined,
      { id: 1 }, // no role/content
      { id: 2, role: "system" }, // not user/assistant — skipped
      { id: 3, role: "user", content: 42 }, // non-string content — scrubbed
      { id: 4, role: "user", content: "real prior turn" },
      { id: 5, role: "assistant", content: "" }, // empty — scrubbed
      { id: 6, role: "user", content: "<vibes-write path='a'/>garbage in tag</vibes-write>more" },
    ];

    const result = await handleRuntimeStream(
      { sender } as any,
      { chatId: 9, prompt: "current prompt" },
      new AbortController(),
      makeOptions({ chatMessages: garbageMessages }),
    );

    // The turn completes successfully — garbage did NOT propagate.
    expect(result.success).toBe(true);
    expect(result.fullResponse).toContain("Hello from mock model.");
    expect(getActiveRuntimeSession(9)).toBeUndefined();
  });
});
