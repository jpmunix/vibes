import { describe, it, expect } from "vitest";
import {
  canDisablePrompt,
  getPromptEditorLock,
  isAgentCorePrompt,
  LOCKED_PROMPT_SYSTEM_IDS,
} from "./prompt_guard";

// Card #117 follow-up: el prompt base del runtime es obligatorio. Su switch
// no se puede desactivar; los demás sí.

describe("canDisablePrompt — regla de prompts bloqueados", () => {
  it("el prompt base del runtime NO se puede desactivar", () => {
    expect(canDisablePrompt("runtime_agent_base")).toBe(false);
    expect(LOCKED_PROMPT_SYSTEM_IDS.has("runtime_agent_base")).toBe(true);
  });

  it("los prompts ctx_* SÍ se pueden desactivar", () => {
    expect(canDisablePrompt("ctx_language")).toBe(true);
    expect(canDisablePrompt("ctx_task_management")).toBe(true);
    expect(canDisablePrompt("ctx_plan_mode")).toBe(true);
    expect(canDisablePrompt("ctx_build_walkthrough")).toBe(true);
  });

  it("los prompts custom (sin systemId) sí se pueden desactivar", () => {
    expect(canDisablePrompt(null)).toBe(true);
    expect(canDisablePrompt(undefined)).toBe(true);
  });
});

// Card #183: el prompt del sistema solo permite editar su contenido. El resto
// de campos del editor (categoría, scope, título, descripción, Generar con IA)
// quedan ocultos o en solo lectura.

describe("getPromptEditorLock — campos del editor por prompt", () => {
  it("el prompt del sistema bloquea todos los campos excepto el contenido", () => {
    const lock = getPromptEditorLock("runtime_agent_base");
    expect(lock.hideCategory).toBe(true);
    expect(lock.hideScope).toBe(true);
    expect(lock.titleReadonly).toBe(true);
    expect(lock.descriptionReadonly).toBe(true);
    expect(lock.hideAiGenerate).toBe(true);
  });

  it("los prompts ctx_* conservan todos los campos editables", () => {
    for (const id of ["ctx_language", "ctx_task_management", "ctx_plan_mode", "ctx_build_walkthrough"]) {
      const lock = getPromptEditorLock(id);
      expect(lock.hideCategory).toBe(false);
      expect(lock.hideScope).toBe(false);
      expect(lock.titleReadonly).toBe(false);
      expect(lock.descriptionReadonly).toBe(false);
      expect(lock.hideAiGenerate).toBe(false);
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

// Card #182: aviso informativo de verbosidad en el editor del Núcleo del agente.

describe("isAgentCorePrompt — detección del prompt del Núcleo del agente", () => {
  it("runtime_agent_base es el núcleo", () => {
    expect(isAgentCorePrompt("runtime_agent_base")).toBe(true);
  });

  it("los ctx_* no son el núcleo", () => {
    expect(isAgentCorePrompt("ctx_language")).toBe(false);
    expect(isAgentCorePrompt("ctx_build_walkthrough")).toBe(false);
  });

  it("los prompts custom (sin systemId) no son el núcleo", () => {
    expect(isAgentCorePrompt(null)).toBe(false);
    expect(isAgentCorePrompt(undefined)).toBe(false);
  });
});
