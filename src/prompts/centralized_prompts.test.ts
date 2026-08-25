import { describe, it, expect } from "vitest";
import {
  SKILL_SYSTEM_PROMPT,
  PROMPT_SYSTEM_PROMPT,
} from "./strategist";
import { CONDENSE_CHAT_SYSTEM_PROMPT } from "./condense_chat";
import { PLAYGROUND_EVALUATOR_SYSTEM_PROMPT } from "./playground_evaluator";
import { DESIGN_SYSTEMS_SYSTEM_PROMPT } from "./design_systems";

/**
 * Test de integridad de los prompts centralizados (refactor: antes vivían
 * inline en componentes/handlers). Garantiza que:
 * 1. Los prompts se exportan y son importables.
 * 2. Conservan el contenido esperado (firma por frases clave).
 * 3. No se traduce ni se vacía por accidente el contenido funcional.
 */

describe("prompts centralizados", () => {
  it("strategist: expone los prompts de skill y prompt", () => {
    expect(SKILL_SYSTEM_PROMPT).toContain("AI Engineer");
    expect(SKILL_SYSTEM_PROMPT).toContain("YAML frontmatter");
    expect(SKILL_SYSTEM_PROMPT).toContain("# Instrucciones");
    expect(PROMPT_SYSTEM_PROMPT).toContain("Prompt Engineer");
    expect(PROMPT_SYSTEM_PROMPT).toContain("Output Format");
  });

  it("condense_chat: expone el prompt de condensación de chat", () => {
    expect(CONDENSE_CHAT_SYSTEM_PROMPT).toContain(
      "condense this conversation's history",
    );
    expect(CONDENSE_CHAT_SYSTEM_PROMPT).toContain(".vibes/");
  });

  it("playground_evaluator: expone el prompt del evaluador de modelos", () => {
    expect(PLAYGROUND_EVALUATOR_SYSTEM_PROMPT).toContain(
      "evaluates AI model responses",
    );
    expect(PLAYGROUND_EVALUATOR_SYSTEM_PROMPT).toContain(
      "bestQualityTime",
    );
  });

  it("design_systems: expone el prompt del generador de DESIGN.md", () => {
    expect(DESIGN_SYSTEMS_SYSTEM_PROMPT).toContain(
      "Design Systems Lead",
    );
    expect(DESIGN_SYSTEMS_SYSTEM_PROMPT).toContain("DESIGN.md");
    expect(DESIGN_SYSTEMS_SYSTEM_PROMPT).toContain(
      "STRICT OUTPUT RULE",
    );
  });
});
