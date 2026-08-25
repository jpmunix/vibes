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
import { toWireMessages } from "@vibes/providers/openai-compatible";
import { createBuiltInRegistry } from "@vibes/tools";
import { createOpenAICompatibleProvider } from "@vibes/providers/openai-compatible";

// ── Hoisted state shared with the vi.mock factories ──────────────────────
const hoisted = vi.hoisted(() => ({
  testRoot: "",
  runtime: null as unknown as import("@vibes/runtime").Runtime,
  responses: [] as unknown[],
  /**
   * #95: folders to return from the stubbed `app_folders` query. `null`
   * makes the stub throw (degradation path — single-root). An empty array
   * means "the app has no extras" (still single-root). A populated array
   * triggers the multi-root path. Set per-test with `hoisted.appFolders = [...]`.
   */
  appFolders: null as unknown as null | Array<{
    id: number;
    appId: number;
    path: string;
    label: string;
    language: string | null;
    projectType: string | null;
    isPrimary: number;
    createdAt: Date;
  }>,
}));

vi.mock("../../db/remote", () => ({
  getRemoteDb: () => {
    // Build a chainable stub that returns the configured appFolders rows.
    // The bridge calls: db.select().from(appFolders).where(...).orderBy(...)
    // When hoisted.appFolders is null (the default for existing tests), the
    // stub throws on `.select()` — reproducing the "db.select is not a
    // function" degradation path the existing tests rely on.
    const rows = hoisted.appFolders;
    if (rows === null) {
      // Return an object WITHOUT a `select` method → bridge catch degrades.
      return {
        update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
      };
    }
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => Promise.resolve(rows),
    };
    return {
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
      select: () => chain,
    };
  },
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
  __activeSessionByChat,
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
    // Slice 3.9: required by Runtime.deleteSession (which the leftover-purge
    // path calls when a chat overwrites an active session). Idempotent.
    async deleteSession(id: string) {
      records.delete(id);
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
    appId: 0,
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

  it("accepts an image-only turn and forwards media to the runtime session", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();
    const result = await handleRuntimeStream(
      { sender } as any,
      {
        chatId: 196,
        prompt: "",
        attachments: [{
          name: "screenshot.png",
          type: "image/png",
          data: "data:image/png;base64,QUJD",
          attachmentType: "chat-context",
        }],
      } as any,
      new AbortController(),
      makeOptions({ chatMessages: [] }),
    );

    expect(result.success).toBe(true);
    const record = [...storage.records.values()][0]!;
    const seededUser = [...record.messages].reverse().find((message) => message.role === "user")!;
    expect(seededUser.role).toBe("user");
    expect(seededUser.content).toEqual([
      { type: "image", mediaType: "image/png", data: "QUJD" },
      { type: "text", text: "" },
    ]);
  });

  it("rehydrates persisted image parts from aiMessagesJson", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();
    const persistedImage = "data:image/jpeg;base64,REVG";
    const result = await handleRuntimeStream(
      { sender } as any,
      { chatId: 197, prompt: "follow up" },
      new AbortController(),
      makeOptions({
        chatMessages: [{
          id: 7,
          role: "user",
          content: "describe the previous image",
          aiMessagesJson: JSON.stringify([{
            role: "user",
            content: [
              { type: "text", text: "describe the previous image" },
              { type: "image", image: persistedImage, mediaType: "image/jpeg" },
            ],
          }]),
        }],
      }),
    );

    expect(result.success).toBe(true);
    const record = [...storage.records.values()][0]!;
    expect(record.messages[0]!.content).toEqual([
      { type: "text", text: "describe the previous image" },
      { type: "image", mediaType: "image/jpeg", data: "REVG" },
    ]);
  });

  it("rehydrates a persisted CDN URL image by re-inlining the bytes as base64", async () => {
    // aiMessagesJson stores the Bunny CDN URL after a successful upload.
    // Base64 data URLs are the universal wire representation (local providers
    // never fetch external URLs), so hydration re-downloads the CDN image.
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();
    const cdnUrl = "https://vibes-cdn.b-cdn.net/chat-attachments/u1/6063cb76e50ddccacaa5490e3a6436aa.png";
    // The PNG magic bytes; base64 = iVBORw0=
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchSpy = vi.fn(async () => new Response(pngBytes, {
      status: 200,
      headers: { "content-type": "image/png" },
    }));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const result = await handleRuntimeStream(
        { sender } as any,
        { chatId: 198, prompt: "follow up" },
        new AbortController(),
        makeOptions({
          chatMessages: [{
            id: 8,
            role: "user",
            content: "que ves en esta captura?",
            aiMessagesJson: JSON.stringify([{
              role: "user",
              content: [
                { type: "text", text: "que ves en esta captura?" },
                { type: "image", image: cdnUrl, mediaType: "image/png" },
              ],
            }]),
          }],
        }),
      );

      expect(result.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(cdnUrl, expect.objectContaining({ signal: expect.any(AbortSignal) }));
      const record = [...storage.records.values()][0]!;
      expect(record.messages[0]!.content).toEqual([
        { type: "text", text: "que ves en esta captura?" },
        { type: "image", mediaType: "image/png", data: "iVBORw0KGgo=" },
      ]);
      // The wire the provider emits carries the inline data URL, never the URL.
      const wire = JSON.stringify(
        toWireMessages({
          model: "test-model",
          systemPrompt: "",
          messages: record.messages,
        }),
      );
      expect(wire).toContain("data:image/png;base64,iVBORw0KGgo=");
      expect(wire).not.toContain(cdnUrl);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back to the url part when the CDN re-download fails (offline)", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();
    const cdnUrl = "https://vibes-cdn.b-cdn.net/chat-attachments/u1/deadbeef.png";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND"); }));
    try {
      const result = await handleRuntimeStream(
        { sender } as any,
        { chatId: 199, prompt: "follow up" },
        new AbortController(),
        makeOptions({
          chatMessages: [{
            id: 9,
            role: "user",
            content: "que ves en esta captura?",
            aiMessagesJson: JSON.stringify([{
              role: "user",
              content: [
                { type: "text", text: "que ves en esta captura?" },
                { type: "image", image: cdnUrl, mediaType: "image/png" },
              ],
            }]),
          }],
        }),
      );

      // Hydration never throws on an unreachable CDN; the URL part survives
      // for providers that accept direct references.
      expect(result.success).toBe(true);
      const record = [...storage.records.values()][0]!;
      expect(record.messages[0]!.content).toEqual([
        { type: "text", text: "que ves en esta captura?" },
        { type: "image", mediaType: "image/png", url: cdnUrl },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
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

  // #179: un prompt vacío (post-strip de slash commands) no debe llegar al
  // runtime: el provider descarta user messages con texto vacío y el modelo
  // respondería sin petición. El guard aborta con success:false y mensaje
  // visible, SIN crear sesión (cero tokens quemados).
  it("#179 fails fast when req.prompt is empty (no session created, no tokens)", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const createSessionSpy = vi.spyOn(hoisted.runtime, "createSession");
    const { sender } = makeFakeSender();

    const result = await handleRuntimeStream(
      { sender } as any,
      { chatId: 1, prompt: "" },
      new AbortController(),
      makeOptions(),
    );

    expect(result.success).toBe(false);
    expect(result.fullResponse).toMatch(/vacío|vacio/i);
    // El guard dispara ANTES de tocar el runtime: ni sesión ni tokens.
    expect(createSessionSpy).not.toHaveBeenCalled();
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    createSessionSpy.mockRestore();
  });

  it("#179 fails fast when prompt is whitespace-only", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();

    const result = await handleRuntimeStream(
      { sender } as any,
      { chatId: 1, prompt: "   \n\t " },
      new AbortController(),
      makeOptions(),
    );

    expect(result.success).toBe(false);
    expect(result.fullResponse).toMatch(/vacío|vacio/i);
  });

  // undoRedo sin prompt es un flujo legítimo (deshacer sin nuevo mensaje):
  // el guard NO debe dispararse. El chat real siempre trae historial (el undo
  // ocurre sobre mensajes previos), y ese historial es lo que satisface al
  // guard de vibes-core (createSession con prompt vacío + messages vacíos
  // lanza). Aquí se verifica la interacción entre ambas defensas.
  it("#179 allows empty prompt when undoRedo is set (legit undo flow)", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();

    const result = await handleRuntimeStream(
      { sender } as any,
      { chatId: 1, prompt: "", undoRedo: true },
      new AbortController(),
      makeOptions({
        chatMessages: [
          { id: 1, role: "user", content: "mensaje previo" },
          { id: 42, role: "assistant", content: "respuesta previa" },
        ],
      }),
    );

    // El guard no dispara: el flujo continúa con el historial como contexto.
    expect(result.success).toBe(true);
    expect(result.fullResponse).not.toMatch(/vacío|vacio/i);
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

// ============================================================================
// Slice 3.9 — activeSessionByChat leftover purge on overwrite
// ============================================================================

describe("handleRuntimeStream contract — Slice 3.9 leftover purge", () => {
  it("purges a real leftover session before starting a new turn on the same chat", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();
    const event = { sender } as any;

    // Create a real session via the runtime API and plant it in the map
    // (simulates a run() finally block that didn't execute — main process
    // crashed mid-stream, or a fast double-tap race).
    const leftover = await hoisted.runtime.createSession({
      prompt: "leftover",
      messages: [],
      workspaceRoot: hoisted.testRoot,
    });
    __activeSessionByChat.set(1, leftover.id);
    expect(storage.records.has(leftover.id)).toBe(true);

    // Second turn on the same chat — should purge leftover BEFORE
    // creating the new session.
    await handleRuntimeStream(
      event,
      { chatId: 1, prompt: "second" },
      new AbortController(),
      makeOptions(),
    );

    // Leftover gone from storage AND map is clean at the end of run().
    expect(storage.records.has(leftover.id)).toBe(false);
    expect(getActiveRuntimeSession(1)).toBeUndefined();
  });

  it("continues even if purge fails (defensive — network blip, storage race)", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();
    const event = { sender } as any;

    // Plant a fake sessionId that doesn't exist in storage. cancel() and
    // deleteSession() will throw, but the handler must NOT propagate the
    // error — it logs and continues.
    __activeSessionByChat.set(2, "definitely-not-in-runtime");

    await expect(
      handleRuntimeStream(
        event,
        { chatId: 2, prompt: "second" },
        new AbortController(),
        makeOptions(),
      ),
    ).resolves.toBeDefined();

    // After the second turn, the map is clean again.
    expect(getActiveRuntimeSession(2)).toBeUndefined();
  });

  it("no purge on a brand-new chat (the common case)", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();
    const event = { sender } as any;

    const result = await handleRuntimeStream(
      event,
      { chatId: 99, prompt: "hello" },
      new AbortController(),
      makeOptions(),
    );

    expect(result.success).toBe(true);
    expect(getActiveRuntimeSession(99)).toBeUndefined();
  });
});

// ============================================================================
// #95 — Workspace multi-proyecto: multi-root bridge fixtures (NEW)
// ============================================================================
// These tests exercise the multi-root path WITHOUT touching the existing
// single-root fixtures (decision #13). They inject `hoisted.appFolders` rows
// so the stubbed `getRemoteDb().select().from().where().orderBy()` returns
// them, and the bridge mounts a multi-root session.
//
// Important: `hoisted.appFolders` MUST be reset to `null` in `afterEach` so
// the 16 existing tests keep using the degradation path (no `select` method).

describe("handleRuntimeStream contract — multi-root workspace (#95)", () => {
  afterEach(() => {
    // Reset to null so the next test (even outside this describe) gets the
    // degradation stub, not a stale array.
    hoisted.appFolders = null;
  });

  it("with 2 folders, the system prompt carries the WORKSPACE FOLDERS descriptor", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();

    // Two folders: the primary (backfilled, isPrimary=1) and one extra.
    // The bridge skips the primary row (uses appPath) and uses extras.
    hoisted.appFolders = [
      {
        id: 1,
        appId: 0,
        path: join(hoisted.testRoot, "my-app"),
        label: "my-app",
        language: "typescript",
        projectType: "generic",
        isPrimary: 1,
        createdAt: new Date(),
      },
      {
        id: 2,
        appId: 0,
        path: join(hoisted.testRoot, "other-repo"),
        label: "other-repo",
        language: "typescript",
        projectType: "generic",
        isPrimary: 0,
        createdAt: new Date(),
      },
    ];

    await handleRuntimeStream(
      { sender } as any,
      { chatId: 500, prompt: "say hi" },
      new AbortController(),
      makeOptions(),
    );

    const sessions = await storage.listSessions();
    const record = sessions[0]!;
    // The descriptor is pushed to contextInstructions → lands in systemPrompt.
    expect(record.systemPrompt).toContain("WORKSPACE FOLDERS");
    expect(record.systemPrompt).toContain("Your workspace consists of 2 folders");
    expect(record.systemPrompt).toContain("Folder 1 (primary");
    expect(record.systemPrompt).toContain(join(hoisted.testRoot, "my-app"));
    expect(record.systemPrompt).toContain("Folder 2");
    expect(record.systemPrompt).toContain(join(hoisted.testRoot, "other-repo"));
    // The instruction to use the question tool for ambiguity is present.
    expect(record.systemPrompt).toContain("use the question tool to clarify");
  });

  it("with 2 folders, createSession receives workspaceRoots with 2 entries (primary first)", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();

    hoisted.appFolders = [
      {
        id: 1,
        appId: 0,
        path: join(hoisted.testRoot, "my-app"),
        label: "my-app",
        language: null,
        projectType: null,
        isPrimary: 1,
        createdAt: new Date(),
      },
      {
        id: 2,
        appId: 0,
        path: join(hoisted.testRoot, "vibes-core"),
        label: "vibes-core",
        language: "typescript",
        projectType: "generic",
        isPrimary: 0,
        createdAt: new Date(),
      },
    ];

    // Spy on createSession to capture the workspaceRoots argument.
    const createSessionSpy = vi.spyOn(hoisted.runtime, "createSession");

    await handleRuntimeStream(
      { sender } as any,
      { chatId: 501, prompt: "say hi" },
      new AbortController(),
      makeOptions(),
    );

    expect(createSessionSpy).toHaveBeenCalledOnce();
    const arg = createSessionSpy.mock.calls[0]![0]!;
    expect(arg.workspaceRoots).toBeDefined();
    expect(arg.workspaceRoots!.length).toBe(2);
    // The primary (appPath) is first.
    expect(arg.workspaceRoots![0]).toBe(join(hoisted.testRoot, "my-app"));
    // The extra follows in insertion order.
    expect(arg.workspaceRoots![1]).toBe(join(hoisted.testRoot, "vibes-core"));

    createSessionSpy.mockRestore();
  });

  it("with 0 extra folders (single-root), the system prompt does NOT carry the descriptor", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();

    // Empty array = the app has a primary but no extras → single-root.
    hoisted.appFolders = [];

    await handleRuntimeStream(
      { sender } as any,
      { chatId: 502, prompt: "say hi" },
      new AbortController(),
      makeOptions(),
    );

    const sessions = await storage.listSessions();
    const record = sessions[0]!;
    // The descriptor is NOT pushed when isMultiRoot is false. When the chat
    // has no custom prompt and no other contextInstructions, systemPrompt is
    // undefined — the optional chaining makes `.not.toContain` a no-op.
    expect(record.systemPrompt ?? "").not.toContain("WORKSPACE FOLDERS");
    expect(record.systemPrompt ?? "").not.toContain("Your workspace consists of");
  });

  it("degrades to single-root when the app_folders query throws (table missing, etc.)", async () => {
    hoisted.runtime = buildTestRuntime(hoisted.testRoot, mockFetch([MOCK_RESPONSES.noTool]));
    const { sender } = makeFakeSender();

    // null = the stub has no `select` method → bridge catch degrades.
    hoisted.appFolders = null;

    const createSessionSpy = vi.spyOn(hoisted.runtime, "createSession");

    await handleRuntimeStream(
      { sender } as any,
      { chatId: 503, prompt: "say hi" },
      new AbortController(),
      makeOptions(),
    );

    expect(createSessionSpy).toHaveBeenCalledOnce();
    const arg = createSessionSpy.mock.calls[0]![0]!;
    // Falls back to a single-root workspace (the primary only).
    expect(arg.workspaceRoots).toBeDefined();
    expect(arg.workspaceRoots!.length).toBe(1);

    createSessionSpy.mockRestore();
  });
});
