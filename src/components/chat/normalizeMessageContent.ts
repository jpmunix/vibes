import { stripDsmlToolCallBlocks } from "@vibes/providers/openai-compatible";
import { normalizeLegacyTags } from "../../../shared/normalizeLegacyTags";

/**
 * Elimina el bloque de texto plano que el bridge inyecta en la hidratación
 * del prompt del LLM:
 *
 *   [Previous Turn Context Summary]
 *   Read: a.ts, b.ts
 *   Listed: src
 *   Modified: c.ts
 *
 * Este texto es memoria de trabajo para el MODELO (ver
 * `runtime_bridge.ts` → `convertHistoryToRuntimeMessages`), no contenido que
 * el usuario deba ver. El LLM a veces lo reproduce al final de su propia
 * respuesta; esa réplica persiste en Bunny y se renderizaba como prosa.
 *
 * Solo afecta al render: el prompt al LLM se construye aparte, así que
 * quitarlo aquí no rompe la memoria entre turnos. Se corta hasta el
 * marcador y se limpia el sangrado sobrante (los `\n\n` previos).
 */
export function stripPreviousTurnSummary(text: string): string {
  const idx = text.indexOf("[Previous Turn Context Summary]");
  if (idx === -1) return text;
  return text.slice(0, idx).replace(/\s+$/, "") + "\n";
}

/**
 * Normaliza el contenido de un mensaje ANTES de parsearlo para la UI.
 *
 * 1. `normalizeLegacyTags` — shim backward-compat (dyad-* → vibes-*).
 * 2. `stripDsmlToolCallBlocks` — elimina bloques de tool-calls internos del
 *    modelo (formato DSML / GLM) que algunos proveedores emiten como texto
 *    plano en el stream y que NO deben pintarse en el chat.
 * 3. `stripPreviousTurnSummary` — elimina la réplica en texto plano de la
 *    memoria de turno `[Previous Turn Context Summary]` (ver arriba).
 *
 * El mismo filtro DSML se aplica en el provider (vibes-core) para los mensajes
 * nuevos en streaming; aquí cubre además los mensajes ya persistidos.
 */
export function normalizeMessageContent(content: string | null | undefined): string {
  if (!content) return "";
  return stripPreviousTurnSummary(stripDsmlToolCallBlocks(normalizeLegacyTags(content)));
}

/** Versión pensada para valores que pueden no ser string. */
export function hasMessageContent(content: string | null | undefined): content is string {
  return !!content;
}
