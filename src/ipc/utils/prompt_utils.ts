import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { eq, and } from "drizzle-orm";
import log from "electron-log";
import { DEFAULT_PROMPTS } from "@/prompts/defaults";
import type { PromptId } from "@/prompts/index";

const logger = log.scope("prompt_utils");

/**
 * Fetch a system prompt by its systemId for a specific user.
 * Prioridad: override del usuario en DB > default del código (DEFAULT_PROMPTS).
 * - Override habilitado con contenido → contenido del override.
 * - Override deshabilitado (enabled=0) → cadena vacía (el usuario lo apagó).
 * - Sin override → default hardcoded del código.
 */
export async function getSystemPrompt(
  systemId: string,
  userId?: string,
): Promise<string> {
  const codeDefault = DEFAULT_PROMPTS[systemId as PromptId] ?? "";

  if (!userId) {
    logger.warn(`No userId provided when fetching system prompt: ${systemId}`);
    return codeDefault;
  }

  try {
    const db = getRemoteDb();
    const promptRow = await db.query.prompts.findFirst({
      where: (p, { eq, and }) =>
        and(eq(p.userId, userId), eq(p.systemId, systemId)),
    });

    if (!promptRow) return codeDefault;
    // Card #195+: los prompts del sistema siempre están activos — el flag
    // enabled=0 legacy se ignora (harden retroactivo). No se borra la fila
    // para no tocar historia; simplemente se considera habilitada.
    return promptRow.content || codeDefault;
  } catch (error) {
    logger.error(`Error fetching system prompt ${systemId}:`, error);
    return codeDefault;
  }
}
