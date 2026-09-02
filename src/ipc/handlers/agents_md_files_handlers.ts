import path from "node:path";
import { eq, and, desc } from "drizzle-orm";
import log from "electron-log";

import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { createTypedHandler } from "./base";
import { agentsMdFileContracts } from "../types/agents_md_files";
import { findAgentsMdFiles } from "./agents_md_context";

const logger = log.scope("agents_md_files_handlers");

/**
 * Handlers for the AGENTS.md discovery panel on the workspace settings page
 * (card #234).
 *
 * For each folder linked to an app we run the same recursive AGENTS.md scan
 * that the system prompt uses (`findAgentsMdFiles`, depth 2, ignored dirs
 * skipped) and return one entry per folder so the UI can render the table
 * grouped by folder.
 *
 * No caching here: the page is a settings page, not a hot path. React Query
 * on the renderer side handles dedup / staleTime.
 */
export function registerAgentsMdFilesHandlers() {
  createTypedHandler(
    agentsMdFileContracts.listAgentsMdFiles,
    async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();

      // Verify the app belongs to the user (defence in depth: same as the
      // app-folders handlers — the caller could pass an appId owned by
      // another user).
      const app = await db.query.apps.findFirst({
        where: and(
          eq(remoteSchema.apps.id, params.appId),
          eq(remoteSchema.apps.userId, context.userId),
        ),
      });
      if (!app) throw new Error("App not found");

      // Fetch the linked folders. Order matches list-app-folders so the UI
      // can show the primary first without re-sorting.
      const folderRows = await db
        .select()
        .from(remoteSchema.appFolders)
        .where(eq(remoteSchema.appFolders.appId, params.appId))
        .orderBy(
          desc(remoteSchema.appFolders.isPrimary),
          remoteSchema.appFolders.id,
        );

      const folders = folderRows.map((row) => {
        const isPrimary = row.isPrimary === 1;
        const folderPath = row.path;

        // findAgentsMdFiles returns absolute paths. We translate them to
        // paths relative to the folder so the UI can render compact rows
        // and so two folders sharing the same AGENTS.md layout don't get
        // confused by absolute paths.
        let files: Array<{
          folderId: number;
          folderLabel: string;
          folderPath: string;
          relativePath: string;
          absolutePath: string;
        }> = [];

        try {
          const absolute = findAgentsMdFiles(folderPath);
          files = absolute.map((abs) => {
            const rel = path.relative(folderPath, abs) || "AGENTS.md";
            return {
              folderId: row.id,
              folderLabel: row.label,
              folderPath,
              relativePath: rel,
              absolutePath: abs,
            };
          });
        } catch (err) {
          // If a folder vanished from disk we still want to surface the
          // other folders. Log and continue with an empty files list.
          logger.warn(
            `findAgentsMdFiles failed for ${folderPath}: ${(err as Error).message}`,
          );
        }

        return {
          folderId: row.id,
          folderLabel: row.label,
          folderPath,
          isPrimary,
          files,
        };
      });

      return { folders };
    },
  );
}
