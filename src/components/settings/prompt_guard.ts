/**
 * Regla de protección de prompts críticos (card #117 follow-up).
 *
 * El "Núcleo del agente" (runtime_agent_base) es el único prompt
 * que el agente necesita para operar: sin él, el runtime no tiene instrucciones
 * base y el comportamiento del asistente se rompe. Por eso NO se puede
 * desactivar desde la UI.
 *
 * - Su CONTENIDO sí se puede editar y restaurar (lo decide el usuario).
 * - Los demás prompts (ctx_*, custom) sí se pueden desactivar.
 *
 * Fuente de la lista de prompts bloqueados: DEFAULT_PROMPTS + la clasificación
 * isRuntimeSystemId de prompt_handlers.ts (ctx_* + runtime_agent_base llegan
 * al runtime como agent.systemPrompt).
 */
export function canDisablePrompt(systemId: string | null | undefined): boolean {
  if (!systemId) return true; // prompts custom sin systemId: sí desactivables
  return systemId !== "runtime_agent_base";
}

/** Los prompts que no se pueden desactivar (para UI: tooltip, candado). */
export const LOCKED_PROMPT_SYSTEM_IDS: ReadonlySet<string> = new Set([
  "runtime_agent_base",
]);
