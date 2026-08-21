/**
 * Bug 76 — wiring regression for the runtime's TodoHandler.
 *
 * The todowrite tool needs a TodoHandler wired into the runtime (ctx.todo) or
 * it throws 'Todo handler not configured' and the model dumps the list as
 * plain text. getRuntime() must construct the SQLite storage provider
 * explicitly and pass the SAME instance to both .storage() and a new
 * SqliteTodoHandler via .todoHandler().
 *
 * This test asserts the built runtime actually carries a wired todoHandler
 * backed by the same storage provider the runtime uses to persist sessions —
 * i.e. the two are connected, which is exactly what the pre-fix wiring missed
 * (the builder's .sqliteStorage() built an unreachable internal provider and
 * no .todoHandler() call existed at all).
 *
 * `electron` is mocked to point at a real temp dir so the SQLite provider can
 * open its DB; settings are mocked to an empty config.
 */

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { mkdirSync } from "node:fs";

// vi.hoisted runs BEFORE imports, so no node imports inside — use a stable,
// pid-scoped path under /tmp so each test process gets its own SQLite DB.
const fakeUserdata = vi.hoisted(() => `/tmp/vibes-rh-todo-${process.pid}`);

vi.mock("electron", () => ({
  app: { getPath: () => fakeUserdata, isPackaged: true },
}));

vi.mock("../../main/settings", () => ({
  readSettings: vi.fn(() => ({})),
}));

// Model target is only resolved lazily on the first stream call, not at
// runtime construction — so the stub below is never hit by this test.
vi.mock("./model_resolver", () => ({
  resolveRuntimeModelTarget: vi.fn(() => undefined),
}));

import { getRuntime, shutdownRuntime } from "./runtime_host";
import type { StorageProvider, TodoHandler } from "@vibes/runtime";

describe("getRuntime — Bug 76 TodoHandler wiring", () => {
  beforeAll(() => {
    // SQLite doesn't create parent dirs; make sure the fake userData exists.
    mkdirSync(fakeUserdata, { recursive: true });
  });
  afterEach(async () => {
    await shutdownRuntime(); // idempotent; resets the singleton between tests
  });

  it("wires a todoHandler backed by the SAME storage provider the runtime uses", async () => {
    const runtime = getRuntime();

    const todoHandler = runtime.deps.todoHandler;
    const storage = runtime.deps.providers.storage;

    // The handler is wired (the pre-fix code had no .todoHandler() call).
    expect(todoHandler).toBeDefined();
    expect(todoHandler).not.toBeNull();

    // The todoHandler must be backed by the SAME storage provider instance the
    // runtime uses for sessions — this is the whole point of building the
    // provider explicitly instead of the builder's internal .sqliteStorage().
    expect(storage).toBeDefined();

    // Functional round-trip through the SAME storage: create a session, push
    // todos through the handler, read them back through the storage. This
    // proves the handler and the runtime share a store (todos survive).
    const provider = storage as unknown as StorageProvider & {
      init(): Promise<void>;
      createSession(r: Record<string, unknown>): Promise<void>;
      getSession(id: string): Promise<{
        todos?: { id: string; content: string; status: string }[];
      } | null>;
    };
    await provider.init();
    const sessionId = "todo-wiring-check";
    await provider.createSession({
      id: sessionId,
      workspaceRoot: fakeUserdata,
      workspaceHash: "hash",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "running",
      prompt: "x",
      messages: [],
      openFiles: [],
      modifiedFiles: [],
      toolCalls: [],
      tokenUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      errors: [],
    });

    const handler = todoHandler as TodoHandler;
    await handler.update(sessionId, [
      { id: "t1", content: "Design", status: "in_progress" },
      { id: "t2", content: "Implement", status: "pending" },
    ]);
    const fromStorage = await provider.getSession(sessionId);
    expect(fromStorage?.todos).toHaveLength(2);
    expect(fromStorage?.todos?.map((t) => t.content)).toEqual([
      "Design",
      "Implement",
    ]);

    // And reading back through the handler agrees (same store).
    const fromHandler = await handler.get(sessionId);
    expect(fromHandler).toHaveLength(2);
  }, 15000);

  it("the singleton is reused (getRuntime is idempotent)", async () => {
    const a = getRuntime();
    const b = getRuntime();
    expect(a).toBe(b);
    // Both expose the wired handler.
    expect(a.deps.todoHandler).toBeDefined();
    expect(b.deps.todoHandler).toBe(a.deps.todoHandler);
  });
});
