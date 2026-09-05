/**
 * Context debug — persistencia a disco (JSONL).
 *
 * `appendContextDebugEntry` escribe una línea JSON; `readContextDebugEntries`
 * las recupera (con resiliencia a líneas corruptas y a archivo ausente);
 * `clearContextDebugLog` borra el archivo. Se prueba contra un tmpdir real (el
 * mismo userData mockeado), sin tocar la app real.
 *
 * `electron` se mockea (getPath → tmpdir por pid) porque importar el módulo
 * arrastra electron. El fs de verdad sí corre (es el contrato que garantizamos).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { ContextDebugEntry } from "../types/system";

const tmp = mkdtempSync(path.join(tmpdir(), "vibes-ctxlog-"));

vi.mock("electron", () => ({
  app: {
    getPath: () => tmp,
    isPackaged: true,
  },
  shell: {
    openPath: vi.fn(async () => ""),
  },
}));

import {
  getContextDebugLogPath,
  appendContextDebugEntry,
  readContextDebugEntries,
  clearContextDebugLog,
} from "./context_debug_log";

const entry: ContextDebugEntry = {
  chatId: 42,
  sessionId: "sess-1",
  iteration: 3,
  tokens: 1234,
  model: "test/model",
  systemPrompt: "SYS PROMPT",
  messages: [{ role: "user", content: [] }],
};

/** append es fire-and-forget: esperamos un microtask para que el write caiga. */
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 20));
}

beforeAll(() => {
  // Empieza con log limpio.
  void clearContextDebugLog();
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("context_debug_log — persistencia JSONL", () => {
  it("append escribe una línea que read recupera", async () => {
    await clearContextDebugLog();
    appendContextDebugEntry({ ...entry });
    await flush();
    const loaded = await readContextDebugEntries();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(entry);
  });

  it("append acumula en orden (append-only)", async () => {
    await clearContextDebugLog();
    appendContextDebugEntry({ ...entry, iteration: 1 });
    await flush();
    appendContextDebugEntry({ ...entry, iteration: 2 });
    await flush();
    const loaded = await readContextDebugEntries();
    expect(loaded.map((e) => e.iteration)).toEqual([1, 2]);
  });

  it("read con archivo ausente → [] (no lanza)", async () => {
    await clearContextDebugLog();
    await flush();
    const loaded = await readContextDebugEntries();
    expect(loaded).toEqual([]);
  });

  it("read salta líneas corruptas (crash a mitad de write)", async () => {
    await clearContextDebugLog();
    appendContextDebugEntry({ ...entry });
    await flush();
    // Línea corrupta a mano (JSON a medio escribir).
    const { appendFile } = await import("node:fs/promises");
    await appendFile(getContextDebugLogPath(), '{"chatId": 99, "ses', "utf8");
    const loaded = await readContextDebugEntries();
    // La buena (1) + la corrupta se salta.
    expect(loaded).toHaveLength(1);
    expect(loaded[0].chatId).toBe(42);
  });

  it("clear borra el log → read devuelve []", async () => {
    appendContextDebugEntry({ ...entry });
    await flush();
    await clearContextDebugLog();
    const loaded = await readContextDebugEntries();
    expect(loaded).toEqual([]);
  });

  it("clear con archivo ausente → no lanza", async () => {
    await clearContextDebugLog();
    await expect(clearContextDebugLog()).resolves.toBeUndefined();
  });

  it("getPath apunta al tmpdir (contrato de ubicación)", () => {
    expect(getContextDebugLogPath()).toBe(path.join(tmp, "context-debug.log"));
  });
});
