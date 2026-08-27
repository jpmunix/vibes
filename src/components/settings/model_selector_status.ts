/**
 * Estado de "enchufe" al runtime de cada selector de modelo por tarea de
 * Settings (card Trello #115, auditoría 2026-08-12).
 *
 * `active: true`  → hay código en el backend que lee ese setting.
 * `active: false` → el setting se puede configurar en la UI pero NINGÚN
 *                   código de runtime lo lee (deuda técnica visual).
 *
 * Fuente de la auditoría (grep exhaustivo en src/):
 * - strategistModel         → chat_handlers.ts (summarizeToNewChat) + asistente estratega
 * - executorModel           → app_handlers.ts (títulos de app) + commits
 * - visionPreprocessorModel → vision_preprocessor.ts
 * - memoriesRouterModelV2   → memory_context_builder.ts:246
 * - standardModeModel       → sin lectores (selector ni siquiera renderizado)
 * - memoriesSynthesisModelV2→ solo validado en model_validator.ts; sin lectores
 */
export interface ModelSelectorStatus {
  /** Hay lectores reales en el backend. */
  active: boolean;
  /** Nota corta para mostrar en la UI cuando no está activo. */
  note?: string;
}

export const MODEL_SELECTOR_STATUS: Record<string, ModelSelectorStatus> = {
  strategistModel: { active: true },
  executorModel: { active: true },
  visionPreprocessorModel: { active: true },
  memoriesRouterModelV2: { active: true },
  standardModeModel: {
    active: false,
    note: "Sin lectores en el runtime; selector retirado de la UI",
  },
  memoriesSynthesisModelV2: {
    active: false,
    note: "Sin lectores en el runtime; selector retirado de la UI",
  },
};
