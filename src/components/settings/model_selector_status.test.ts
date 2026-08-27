import { describe, it, expect } from "vitest";
import { MODEL_SELECTOR_STATUS } from "./model_selector_status";

// Card #115 — deuda técnica visual: mapa del estado de enchufe al runtime
// de los selectores de modelo por tarea. Auditoría 2026-08-12 (grep
// exhaustivo en src/): estos asserts documentan el estado real y saltarán
// cuando se enchufe algo nuevo.
// Card #113: agentModels[] eliminado (el runtime no maneja agentes).

describe("MODEL_SELECTOR_STATUS — estado de enchufe de los selectores", () => {
  it("cubre los 6 settings de modelo por tarea auditados", () => {
    expect(Object.keys(MODEL_SELECTOR_STATUS).sort()).toEqual(
      [
        "executorModel",
        "memoriesRouterModelV2",
        "memoriesSynthesisModelV2",
        "standardModeModel",
        "strategistModel",
        "visionPreprocessorModel",
      ].sort(),
    );
  });

  it("los 4 selectores activos tienen lectores reales en el backend", () => {
    const active = Object.entries(MODEL_SELECTOR_STATUS)
      .filter(([, s]) => s.active)
      .map(([k]) => k);
    // strategist → summarizeToNewChat / asistente estratega
    // executor → títulos de app + commits
    // vision → vision_preprocessor.ts
    // memoriesRouter → memory_context_builder.ts
    expect(active.sort()).toEqual(
      [
        "strategistModel",
        "executorModel",
        "visionPreprocessorModel",
        "memoriesRouterModelV2",
      ].sort(),
    );
  });

  it("los 2 selectores inactivos (deuda visual) llevan nota explicativa", () => {
    const inactive = Object.entries(MODEL_SELECTOR_STATUS).filter(
      ([, s]) => !s.active,
    );
    expect(inactive).toHaveLength(2);
    for (const [key, status] of inactive) {
      expect(status.note, `falta nota en ${key}`).toBeTruthy();
      expect(status.note!.length).toBeGreaterThan(10);
    }
  });
});
