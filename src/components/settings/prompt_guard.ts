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

/**
 * ¿Es este el prompt del Núcleo del agente (runtime_agent_base)?
 *
 * Se usa para mostrar el aviso informativo de verbosidad (card #182): el
 * núcleo define CÓMO actúa el agente, pero la longitud de respuesta la
 * controla el selector de Verbosidad, no este texto.
 */
export function isAgentCorePrompt(
  systemId: string | null | undefined,
): boolean {
  return systemId === "runtime_agent_base";
}

/**
 * Campos del editor de prompt que quedan ocultos o en solo lectura.
 *
 * Para el prompt del sistema (runtime_agent_base, "Núcleo del agente") solo se
 * deja editar el CONTENIDO: título y descripción pasan a solo lectura, y se
 * ocultan la categoría, el ámbito (scope) y el asistente "Generar con IA"
 * (card #183). Para el resto de prompts (custom y ctx_*) todos los campos son
 * editables.
 */
export interface PromptEditorLock {
  /** Oculta el selector de Categoría. */
  hideCategory: boolean;
  /** Oculta el selector de Ámbito (Scope). */
  hideScope: boolean;
  /** Título en solo lectura. */
  titleReadonly: boolean;
  /** Descripción en solo lectura. */
  descriptionReadonly: boolean;
  /** Oculta el asistente "Generar con IA". */
  hideAiGenerate: boolean;
}

export function getPromptEditorLock(
  systemId: string | null | undefined,
): PromptEditorLock {
  const locked =
    systemId !== null && systemId !== undefined
      ? LOCKED_PROMPT_SYSTEM_IDS.has(systemId)
      : false;
  return {
    hideCategory: locked,
    hideScope: locked,
    titleReadonly: locked,
    descriptionReadonly: locked,
    hideAiGenerate: locked,
  };
}
