import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_PROMPTS, DEFAULT_PROMPT_SCOPES } from "@/prompts/defaults";

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

// ── Nivel 1 (card #117): prompt base endurecido + scopes de fábrica ──────

describe("runtime_agent_base — prompt endurecido (análisis #108, Nivel 1)", () => {
  const base = DEFAULT_PROMPTS.runtime_agent_base;

  it("conserva las reglas críticas de tool usage del prompt original", () => {
    expect(base).toContain("CRITICAL — Tool usage rules:");
    expect(base).toContain("NEVER just describe");
    expect(base).toContain("report the error verbatim");
    expect(base).toContain("brief final summary");
  });

  it("añade el bloque de concisión con límite numérico (1-3 sentencias)", () => {
    expect(base).toContain("Concision:");
    expect(base).toContain("final summary MUST be 1-3 sentences");
    expect(base).toContain("no preamble, no postamble");
  });

  it("añade el bloque de professional objectivity", () => {
    expect(base).toContain("Professional objectivity:");
    expect(base).toContain(
      "Prioritize technical accuracy and truthfulness over validating the user's beliefs",
    );
    expect(base).toContain("Disagree when necessary");
  });

  it("incluye los 3 ejemplos de calibración de verbosidad", () => {
    const examples = base.match(/<example>/g) ?? [];
    expect(examples).toHaveLength(3);
    // one-word answer
    expect(base).toContain("user: what is 2+2?");
    expect(base).toContain("assistant: 4");
    // one-line answer con referencia file:line
    expect(base).toContain("src/services/auth.ts:42");
    // respuesta corta + tool calls
    expect(base).toContain("user: add a /health endpoint");
  });

  it("no degrada el tamaño: el prompt sigue por debajo de ~600 tokens (heurística 4 chars/token)", () => {
    // El prompt endurecido ronda los 2 400 chars (~600t). Si alguien lo
    // infla mucho más allá, este test obliga a discutirlo (espíritu del
    // análisis #108: contexto liviano).
    expect(base.length).toBeLessThan(2_800);
  });
});

describe("DEFAULT_PROMPT_SCOPES — scopes de fábrica para prompts pesados", () => {
  it("ctx_plan_mode solo se inyecta en el agente plan", () => {
    expect(DEFAULT_PROMPT_SCOPES.ctx_plan_mode).toBe("plan");
  });

  it("ctx_build_walkthrough solo se inyecta en el agente build (modo agente)", () => {
    expect(DEFAULT_PROMPT_SCOPES.ctx_build_walkthrough).toBe("agent");
  });

  it("el resto de systemIds del runtime no tienen scope de fábrica (viajan en todos los modos)", () => {
    const runtimeIds = [
      "ctx_language",
      "ctx_no_run_locally",
      "ctx_task_management",
      "runtime_agent_base",
    ] as const;
    for (const id of runtimeIds) {
      expect(DEFAULT_PROMPT_SCOPES[id]).toBeUndefined();
    }
  });

  it("solo referencia systemIds que existen en DEFAULT_PROMPTS", () => {
    const unknown = Object.keys(DEFAULT_PROMPT_SCOPES).filter(
      (id) => !(id in DEFAULT_PROMPTS),
    );
    expect(unknown).toEqual([]);
  });
});
