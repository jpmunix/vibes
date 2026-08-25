import { describe, it, expect } from "vitest";
import {
  canDisablePrompt,
  getPromptEditorLock,
  isAgentCorePrompt,
  isSystemPrompt,
  LOCKED_PROMPT_SYSTEM_IDS,
} from "./prompt_guard";
import { DEFAULT_PROMPTS } from "@/prompts/defaults";

// ────────────────────────────────────────────────────────────────────────────
// Card #117: el prompt base del runtime es obligatorio (no desactivable).
// ────────────────────────────────────────────────────────────────────────────

describe("canDisablePrompt — regla de prompts no desactivables", () => {
  it("el prompt base del runtime NO se puede desactivar", () => {
    expect(canDisablePrompt("runtime_agent_base")).toBe(false);
    expect(LOCKED_PROMPT_SYSTEM_IDS.has("runtime_agent_base")).toBe(true);
  });

  it("los demás prompts de sistema SÍ se pueden desactivar", () => {
    for (const id of Object.keys(DEFAULT_PROMPTS)) {
      if (id === "runtime_agent_base") continue;
      expect(canDisablePrompt(id)).toBe(true);
    }
  });

  it("los prompts custom (sin systemId) sí se pueden desactivar", () => {
    expect(canDisablePrompt(null)).toBe(true);
    expect(canDisablePrompt(undefined)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Card #195: TODOS los prompts de sistema solo permiten editar su contenido.
// (Antes, card #183, solo runtime_agent_base quedaba restringido.)
// ────────────────────────────────────────────────────────────────────────────

describe("getPromptEditorLock — campos del editor por prompt (card #195)", () => {
  it("CADA prompt de sistema bloquea todos los campos excepto el contenido", () => {
    for (const id of Object.keys(DEFAULT_PROMPTS)) {
      const lock = getPromptEditorLock(id);
      expect(lock.hideCategory, `${id}: hideCategory`).toBe(true);
      expect(lock.hideScope, `${id}: hideScope`).toBe(true);
      expect(lock.titleReadonly, `${id}: titleReadonly`).toBe(true);
      expect(lock.descriptionReadonly, `${id}: descriptionReadonly`).toBe(true);
      expect(lock.hideAiGenerate, `${id}: hideAiGenerate`).toBe(true);
    }
  });

  it("los prompts custom (sin systemId) conservan todos los campos editables", () => {
    for (const id of [null, undefined] as const) {
      const lock = getPromptEditorLock(id);
      expect(lock.hideCategory).toBe(false);
      expect(lock.hideScope).toBe(false);
      expect(lock.titleReadonly).toBe(false);
      expect(lock.descriptionReadonly).toBe(false);
      expect(lock.hideAiGenerate).toBe(false);
    }
  });
});

describe("isSystemPrompt — detección de prompts de sistema (card #195)", () => {
  it("todo systemId con default en el código es de sistema", () => {
    for (const id of Object.keys(DEFAULT_PROMPTS)) {
      expect(isSystemPrompt(id)).toBe(true);
    }
  });

  it("los prompts custom (sin systemId) no son de sistema", () => {
    expect(isSystemPrompt(null)).toBe(false);
    expect(isSystemPrompt(undefined)).toBe(false);
    expect(isSystemPrompt("mi_prompt_personal")).toBe(false);
  });
});

describe("isAgentCorePrompt — detección del prompt del Núcleo del agente", () => {
  it("runtime_agent_base es el núcleo", () => {
    expect(isAgentCorePrompt("runtime_agent_base")).toBe(true);
  });

  it("los demás prompts de sistema no son el núcleo", () => {
    expect(isAgentCorePrompt("ctx_language")).toBe(false);
    expect(isAgentCorePrompt("ctx_build_walkthrough")).toBe(false);
    expect(isAgentCorePrompt("vision")).toBe(false);
  });

  it("los prompts custom (sin systemId) no son el núcleo", () => {
    expect(isAgentCorePrompt(null)).toBe(false);
    expect(isAgentCorePrompt(undefined)).toBe(false);
  });
});
