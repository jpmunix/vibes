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

  it("devuelve el override aunque la fila esté legacy deshabilitada (card #195+: siempre activo)", async () => {
    hoisted.promptRow = { content: "responde en español", enabled: 0 };
    await expect(getSystemPrompt("ctx_language", "user-1")).resolves.toBe(
      "responde en español",
    );
  });

  it("devuelve cadena vacía si el systemId no existe ni en DB ni en el código", async () => {
    hoisted.promptRow = null;
    await expect(getSystemPrompt("prompt_inexistente", "user-1")).resolves.toBe(
      "",
    );
  });
});

// Card #195: la visión es un prompt de sistema más. Misma semántica de
// override que el resto (default en código > override en DB > deshabilitado).
describe("getSystemPrompt('vision') — visión como prompt de sistema (card #195)", () => {
  beforeEach(() => {
    hoisted.promptRow = null;
  });

  const DEFAULT_VISION = DEFAULT_PROMPTS.vision;

  it("devuelve el default de fábrica si no hay override en DB", async () => {
    await expect(getSystemPrompt("vision", "user-1")).resolves.toBe(DEFAULT_VISION);
  });

  it("devuelve el override de la DB si la fila existe y está habilitada", async () => {
    hoisted.promptRow = { content: "describe solo los colores", enabled: 1 };
    await expect(getSystemPrompt("vision", "user-1")).resolves.toBe(
      "describe solo los colores",
    );
  });

  it("devuelve el override de visión aunque legacy deshabilitado (card #195+: siempre activo)", async () => {
    hoisted.promptRow = { content: "describe solo los colores", enabled: 0 };
    await expect(getSystemPrompt("vision", "user-1")).resolves.toBe("describe solo los colores");
  });

  it("el default de fábrica conserva el texto historico (no se reescribio, solo se movio)", () => {
    // Regla de oro N1 del GDD: el contenido default NO cambia.
    expect(DEFAULT_VISION).toContain("expert visual processor");
    expect(DEFAULT_VISION).toContain("INTENT ALIGNMENT");
    expect(DEFAULT_VISION).toContain(
      "Your only job is to provide the visual raw material in text form.",
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
    expect(base).toContain("write a final summary in plain text and stop");
  });

  it("añade el bloque de professional objectivity", () => {
    expect(base).toContain("Professional objectivity:");
    expect(base).toContain(
      "Prioritize technical accuracy and truthfulness over validating the user's beliefs",
    );
    expect(base).toContain("Disagree when necessary");
  });

  it("YA NO contiene instrucciones de longitud: la verbosidad la inyecta la carcasa (card #182)", () => {
    // El núcleo define CÓMO actúa el agente, nunca CUÁNTO habla. La longitud
    // vive en src/prompts/verbosity.ts y se inyecta según settings.textVerbosity.
    expect(base).not.toContain("Concision:");
    expect(base).not.toContain("MUST be 1-3 sentences");
    expect(base).not.toContain("<example>");
    expect(base).not.toContain("Calibration examples");
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
