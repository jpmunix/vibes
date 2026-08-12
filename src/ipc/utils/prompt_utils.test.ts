import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_PROMPTS } from "@/prompts/defaults";

// ── Mocks ────────────────────────────────────────────────────────────────
// getRemoteDb se mockea para aislar getSystemPrompt de la conexión real (Bunny).
const hoisted = vi.hoisted(() => ({
  promptRow: null as null | { content: string; enabled: number },
}));

vi.mock("@/db/remote", () => ({
  getRemoteDb: () => ({
    query: {
      prompts: {
        // Replica el query real: findFirst por (userId, systemId) SIN filtrar
        // enabled — la decisión habilitado/deshabilitado vive en getSystemPrompt.
        findFirst: async () => {
          if (!hoisted.promptRow) return null;
          return hoisted.promptRow;
        },
      },
    },
  }),
}));

import { getSystemPrompt } from "./prompt_utils";

describe("getSystemPrompt — override de la DB > default del código", () => {
  beforeEach(() => {
    hoisted.promptRow = null;
  });

  const DEFAULT_CTX_LANGUAGE = DEFAULT_PROMPTS.ctx_language;

  it("devuelve el default del código si no hay userId", async () => {
    await expect(getSystemPrompt("ctx_language")).resolves.toBe(
      DEFAULT_CTX_LANGUAGE,
    );
  });

  it("devuelve el default del código si no hay override en DB", async () => {
    hoisted.promptRow = null;
    await expect(getSystemPrompt("ctx_language", "user-1")).resolves.toBe(
      DEFAULT_CTX_LANGUAGE,
    );
  });

  it("devuelve el override de la DB si la fila existe y está habilitada", async () => {
    hoisted.promptRow = { content: "responde en español", enabled: 1 };
    await expect(getSystemPrompt("ctx_language", "user-1")).resolves.toBe(
      "responde en español",
    );
  });

  it("devuelve cadena vacía si la fila existe pero está deshabilitada (el usuario lo apagó)", async () => {
    hoisted.promptRow = { content: "responde en español", enabled: 0 };
    await expect(getSystemPrompt("ctx_language", "user-1")).resolves.toBe(
      "",
    );
  });

  it("devuelve cadena vacía si el systemId no existe ni en DB ni en el código", async () => {
    hoisted.promptRow = null;
    await expect(getSystemPrompt("prompt_inexistente", "user-1")).resolves.toBe(
      "",
    );
  });
});

describe("DEFAULT_PROMPTS — semilla de fábrica que debe cubrir los systemIds del runtime", () => {
  // systemIds que chat_stream_handlers.ts espera inyectar en el system prompt.
  // Si uno de estos NO está en DEFAULT_PROMPTS → el pipeline del chat se
  // quedaría sin prompt cuando no hay override en la DB. Este test lo detecta.
  const RUNTIME_SYSTEM_PROMPT_IDS = [
    "ctx_language",
    "ctx_no_run_locally",
    "ctx_context7_docs",
    "ctx_efficiency_triage",
    "ctx_task_management",
    "ctx_plan_mode",
    "ctx_build_walkthrough",
    "runtime_agent_base",
  ] as const;

  it("todos los systemIds que el runtime inyecta están en DEFAULT_PROMPTS", () => {
    const missing = RUNTIME_SYSTEM_PROMPT_IDS.filter(
      (id) => !(id in DEFAULT_PROMPTS),
    );
    expect(missing).toEqual([]);
  });

  it("DEFAULT_PROMPTS no contiene entradas vacías (semilla siempre con contenido)", () => {
    const empty = Object.entries(DEFAULT_PROMPTS).filter(
      ([, content]) => !content || !content.trim(),
    );
    expect(empty).toEqual([]);
  });
});
