import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { eq, and } from "drizzle-orm";
import log from "electron-log";

const logger = log.scope("prompt_utils");

/**
 * Fetch a system prompt by its systemId for a specific user from the remote database.
 * The prompt must be enabled (enabled === 1).
 * La DB es la ÚNICA fuente de verdad: si el prompt no existe o está deshabilitado,
 * devuelve cadena vacía (no hay fallback a defaults de código).
 */
export async function getSystemPrompt(
  systemId: string,
  userId?: string,
): Promise<string> {
  if (!userId) {
    logger.warn(`No userId provided when fetching system prompt: ${systemId}`);
    return "";
  }

  try {
    const db = getRemoteDb();
    const promptRow = await db.query.prompts.findFirst({
      where: (p, { eq, and }) =>
        and(eq(p.userId, userId), eq(p.systemId, systemId), eq(p.enabled, 1)),
    });

    return promptRow?.content || "";
  } catch (error) {
    logger.error(`Error fetching system prompt ${systemId}:`, error);
    return "";
  }
}
