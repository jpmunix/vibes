/**
 * Regla de protección de prompts del sistema (card #117, generalizada en #195).
 *
 * Semántica (card #195 — decisión munix):
 * - TODOS los prompts de sistema (cualquier systemId presente en
 *   DEFAULT_PROMPTS) son modificables SOLO en su CONTENIDO. No se pueden
 *   recategorizar, renombrar, ni editar su descripción, ni eliminar.
 *   "Restaurar al valor de fábrica" siempre está disponible.
 * - El prompt del Núcleo del agente (runtime_agent_base) es el único que NO
 *   se puede desactivar (card #117): sin él el runtime no tiene instrucciones
 *   base y el comportamiento del asistente se rompe.
 * - Los prompts custom (sin systemId) siguen siendo 100% libres.
 *
 * Fuente de la lista de prompts de sistema: DEFAULT_PROMPTS (código). La
 * clasificación anterior (runtime vs. "review") dejó de existir en #195; la
 * jerarquía la da SYSTEM_PROMPT_GROUPS (prompts/index.ts), no este guard.
 */
import { DEFAULT_PROMPTS } from "@/prompts/defaults";

/** ¿Existe un default de fábrica para este systemId (es prompt de sistema)? */
export function isSystemPrompt(
  systemId: string | null | undefined,
): boolean {
  return systemId !== null && systemId !== undefined
    ? systemId in DEFAULT_PROMPTS
    : false;
}

/**
 * ¿Se puede desactivar (toggle enabled) este prompt?
 * Solo runtime_agent_base es obligatorio: los demás prompts de sistema y los
 * custom sí se pueden apagar.
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
 * Card #195: para CUALQUIER prompt de sistema (systemId en DEFAULT_PROMPTS)
 * solo se deja editar el CONTENIDO (+ activar/desactivar, que lo gestiona
 * canDisablePrompt). Título, descripción, categoría, ámbito (scope) y el
 * asistente "Generar con IA" quedan ocultos o en solo lectura. Para los
 * custom todos los campos son editables.
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
  // Card #195: TODOS los prompts de sistema quedan restringidos (antes solo
  // runtime_agent_base). Un systemId presente en DEFAULT_PROMPTS es sistema.
  const locked = isSystemPrompt(systemId);
  return {
    hideCategory: locked,
    hideScope: locked,
    titleReadonly: locked,
    descriptionReadonly: locked,
    hideAiGenerate: locked,
  };
}
