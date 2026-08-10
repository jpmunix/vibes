import { describe, it, expect } from "vitest";
import { computePromptDefaultStatus } from "./prompt_handlers";

describe("computePromptDefaultStatus", () => {
  // Map values are the minimal shape the helper needs (only `content`)
  const defaults = new Map<string, { content: string }>([
    ["ctx_language", { content: "responde en español" }],
    ["chat_title", { content: "Genera un título" }],
  ]);

  it("devuelve hasDefault=false para prompts sin systemId", () => {
    expect(computePromptDefaultStatus("hola", null, defaults)).toEqual({
      hasDefault: false,
      isModified: false,
    });
    expect(computePromptDefaultStatus("hola", undefined, defaults)).toEqual({
      hasDefault: false,
      isModified: false,
    });
  });

  it("devuelve hasDefault=false si el systemId no tiene default en la tabla", () => {
    expect(
      computePromptDefaultStatus("hola", "system_inexistente", defaults),
    ).toEqual({ hasDefault: false, isModified: false });
  });

  it("isModified=false cuando content === default", () => {
    expect(
      computePromptDefaultStatus(
        "responde en español",
        "ctx_language",
        defaults,
      ),
    ).toEqual({ hasDefault: true, isModified: false });
  });

  it("isModified=true cuando content !== default", () => {
    expect(
      computePromptDefaultStatus(
        "responde en catalán",
        "ctx_language",
        defaults,
      ),
    ).toEqual({ hasDefault: true, isModified: true });
  });

  it("distingue prompts con default y modificados en el mismo map", () => {
    expect(
      computePromptDefaultStatus("Genera un título", "chat_title", defaults),
    ).toEqual({ hasDefault: true, isModified: false });
    expect(
      computePromptDefaultStatus("Otro título", "chat_title", defaults),
    ).toEqual({ hasDefault: true, isModified: true });
  });
});
