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
        // Replica el filtro real: findFirst con where enabled === 1.
        // Si la fila está deshabilitada, el query real no la devuelve (null).
        findFirst: async ({ where }: any) => {
          if (!hoisted.promptRow) return null;
          // El where real es una función que recibe { eq, and } — aplicamos el
          // criterio enabled === 1 de forma equivalente.
          const enabled = hoisted.promptRow.enabled;
          if (enabled === 0) return null;
          return hoisted.promptRow;
        },
      },
    },
  }),
}));

import { getSystemPrompt } from "./prompt_utils";

describe("getSystemPrompt — DB única fuente de verdad (sin fallback a código)", () => {
  beforeEach(() => {
    hoisted.promptRow = null;
  });

  it("devuelve cadena vacía si no hay userId", async () => {
    await expect(getSystemPrompt("ctx_language")).resolves.toBe("");
  });

  it("devuelve cadena vacía si el prompt no existe en DB (sin fallback)", async () => {
    hoisted.promptRow = null;
    await expect(getSystemPrompt("ctx_language", "user-1")).resolves.toBe("");
  });

  it("devuelve el contenido de la DB si la fila existe", async () => {
    hoisted.promptRow = { content: "responde en español", enabled: 1 };
    await expect(getSystemPrompt("ctx_language", "user-1")).resolves.toBe(
      "responde en español",
    );
  });

  it("devuelve cadena vacía si la fila existe pero está deshabilitada", async () => {
    hoisted.promptRow = { content: "responde en español", enabled: 0 };
    await expect(getSystemPrompt("ctx_language", "user-1")).resolves.toBe("");
  });
});

describe("DEFAULT_PROMPTS — semilla que debe cubrir los systemIds del runtime", () => {
  // systemIds que chat_stream_handlers.ts espera inyectar en el system prompt.
  // Si uno de estos NO está en DEFAULT_PROMPTS (semilla) → la DB no puede
  // sembrarlo y el runtime se quedaría sin prompt. Este test lo detecta.
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
