import { stripDsmlToolCallBlocks } from "@vibes/providers/openai-compatible";
import { normalizeLegacyTags } from "../../../shared/normalizeLegacyTags";

/**
 * Normaliza el contenido de un mensaje ANTES de parsearlo para la UI.
 *
 * 1. `normalizeLegacyTags` — shim backward-compat (dyad-* → vibes-*).
 * 2. `stripDsmlToolCallBlocks` — elimina bloques de tool-calls internos del
 *    modelo (formato DSML / GLM) que algunos proveedores emiten como texto
 *    plano en el stream y que NO deben pintarse en el chat.
 *
 * El mismo filtro DSML se aplica en el provider (vibes-core) para los mensajes
 * nuevos en streaming; aquí cubre además los mensajes ya persistidos.
 */
export function normalizeMessageContent(content: string | null | undefined): string {
  if (!content) return "";
  return stripDsmlToolCallBlocks(normalizeLegacyTags(content));
}

/** Versión pensada para valores que pueden no ser string. */
export function hasMessageContent(content: string | null | undefined): content is string {
  return !!content;
}
