import { describe, it, expect } from "vitest";
import {
  canDisablePrompt,
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
