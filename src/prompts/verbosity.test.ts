import { describe, it, expect } from "vitest";
import {
  buildVerbosityInstructions,
  normalizeVerbosityLevel,
  VERBOSITY_BLOCKS,
  type VerbosityLevel,
} from "./verbosity";
import { DEFAULT_PROMPTS } from "./defaults";

describe("normalizeVerbosityLevel — normalización de entrada", () => {
  it("undefined/null/valores inválidos → low", () => {
    expect(normalizeVerbosityLevel(undefined)).toBe("low");
    expect(normalizeVerbosityLevel(null)).toBe("low");
    expect(normalizeVerbosityLevel("garbanzo" as any)).toBe("low");
  });

  it("conserva medium y high", () => {
    expect(normalizeVerbosityLevel("medium")).toBe("medium");
    expect(normalizeVerbosityLevel("high")).toBe("high");
  });
});

describe("VERBOSITY_BLOCKS — las tres variantes existen y no están vacías", () => {
  const levels: VerbosityLevel[] = ["low", "medium", "high"];

  it("general y walkthrough tienen las 3 variantes, ninguna vacía", () => {
    for (const level of levels) {
      expect(VERBOSITY_BLOCKS.general[level].trim().length).toBeGreaterThan(0);
      expect(
        VERBOSITY_BLOCKS.walkthrough[level].trim().length,
      ).toBeGreaterThan(0);
    }
  });

  it("cada variante general lleva sus ejemplos de calibración", () => {
    for (const level of levels) {
      const examples = VERBOSITY_BLOCKS.general[level].match(/<example>/g) ?? [];
      expect(examples).toHaveLength(3);
      expect(VERBOSITY_BLOCKS.general[level]).toContain("Calibration examples");
    }
  });

  it("los bloques de cierre van en inglés (coherente con general)", () => {
    for (const level of levels) {
      expect(VERBOSITY_BLOCKS.walkthrough[level]).toContain("Task closing");
    }
  });
});

describe("buildVerbosityInstructions — composición", () => {
  it("undefined → variante low", () => {
    const out = buildVerbosityInstructions(undefined);
    expect(out).toContain("Response length (low):");
    expect(out).not.toContain("Response length (medium):");
    expect(out).not.toContain("Response length (high):");
  });

  it("includeWalkthrough: false omite el bloque de cierre", () => {
    const out = buildVerbosityInstructions("high", { includeWalkthrough: false });
    expect(out).toContain("Response length (high):");
    expect(out).not.toContain("Task closing");
  });

  it("includeWalkthrough: true añade el bloque de cierre", () => {
    const out = buildVerbosityInstructions("high", { includeWalkthrough: true });
    expect(out).toContain("Response length (high):");
    expect(out).toContain("Task closing (high verbosity):");
  });

  it("low conserva el contrato legacy del endurecido Nivel 1 (1-3 sentences)", () => {
    const out = buildVerbosityInstructions("low");
    expect(out).toContain("MUST be 1-3 sentences");
    expect(out).toContain("no preamble, no postamble");
    expect(out).toContain("One-word or one-line answers");
  });

  it("medium y high especifican rangos distintos de low (no heredan el límite de 3 frases)", () => {
    expect(buildVerbosityInstructions("medium")).toContain("3-5 sentences");
    expect(buildVerbosityInstructions("high")).toContain("5-15 sentences");
  });
});

describe("anti-regresión — la concisión fija ya no vive en el núcleo (card #182)", () => {
  it("runtime_agent_base no contiene Concision, ejemplos ni límite numérico", () => {
    const base = DEFAULT_PROMPTS.runtime_agent_base;
    expect(base).not.toContain("Concision:");
    expect(base).not.toContain("MUST be 1-3 sentences");
    expect(base).not.toContain("<example>");
    expect(base).not.toContain("Calibration examples");
    // pero sigue definiendo comportamiento (tool usage + objectivity)
    expect(base).toContain("CRITICAL — Tool usage rules:");
    expect(base).toContain("Professional objectivity:");
  });
});
