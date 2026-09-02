import { app, dialog } from "electron";
import path from "node:path";
import { promises as fsPromises } from "node:fs";
import { eq, and, desc } from "drizzle-orm";
import log from "electron-log";

import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { createTypedHandler } from "./base";
import { appFolderContracts } from "../types/app_folders";
import { detectProjectLanguage } from "../utils/detect_language";

const logger = log.scope("app_folders_handlers");

/**
 * Handlers for the multi-proyecto workspace (card #95).
 *
 * Each app (workspace) has N linked folders. The primary one (isPrimary=true)
 * is the app.path original; extras are absolute directory paths chosen by the
 * user with the picker. The chat inherits the app's folders to mount the
 * runtime multi-root session.
 *
 * Rules (from grill-me decisions):
 *  - `(appId, path)` is unique (duplicate add → error).
 *  - The primary folder cannot be removed.
 *  - Removing a folder only deletes the link; files on disk are untouched.
 *  - On add, `language`/`projectType` are detected via detectProjectLanguage.
 *  - `label` defaults to `path.basename(path)` if not provided.
 */

export function registerAppFoldersHandlers() {
  // ── list-app-folders ──────────────────────────────────────────────────────
  createTypedHandler(
    appFolderContracts.listAppFolders,
    async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();

      // Verify the app belongs to the user ( Defence in depth: even though
      // app_folders.appId has ON DELETE CASCADE from apps, the caller could
      // pass an appId owned by another user; check ownership first. )
      const app = await db.query.apps.findFirst({
        where: and(
          eq(remoteSchema.apps.id, params.appId),
          eq(remoteSchema.apps.userId, context.userId),
        ),
      });
      if (!app) throw new Error("App not found");

      const rows = await db
        .select()
        .from(remoteSchema.appFolders)
        .where(eq(remoteSchema.appFolders.appId, params.appId))
        .orderBy(desc(remoteSchema.appFolders.isPrimary), remoteSchema.appFolders.id);

      return {
        folders: rows.map((r) => ({
          id: r.id,
          appId: r.appId,
          path: r.path,
          label: r.label,
          language: r.language,
          projectType: r.projectType,
          // SQLite stores integers; normalize to boolean for the contract.
          isPrimary: r.isPrimary === 1,
          createdAt: r.createdAt,
        })),
      };
    },
  );

  // ── add-app-folder ─────────────────────────────────────────────────────────
  createTypedHandler(
    appFolderContracts.addAppFolder,
    async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();

      // 1. Verify app ownership.
      const app = await db.query.apps.findFirst({
        where: and(
          eq(remoteSchema.apps.id, params.appId),
          eq(remoteSchema.apps.userId, context.userId),
        ),
      });
      if (!app) throw new Error("App not found");

      // 2. Normalize path: resolve to absolute and strip trailing slash.
      const resolvedPath = path.resolve(params.path);

      // 3. The path must exist and be a directory (fail fast, clear error).
      try {
        const st = await fsPromises.stat(resolvedPath);
        if (!st.isDirectory()) {
          throw new Error(`Path is not a directory: ${resolvedPath}`);
        }
      } catch (err) {
        throw new Error(
          `Cannot access path "${resolvedPath}": ${(err as Error).message}`,
        );
      }

      // 4. Prevent linking the app's own primary path twice.
      if (resolvedPath === path.resolve(app.path)) {
        throw new Error(
          "This path is already the app's primary folder and cannot be linked as extra.",
        );
      }

      // 5. Detect language/projectType (best-effort: never fails the add).
      let detected: { primaryLanguage: string; projectType: string } | null =
        null;
      try {
        detected = await detectProjectLanguage(resolvedPath);
      } catch (err) {
        logger.warn(
          `detectProjectLanguage failed for ${resolvedPath}: ${(err as Error).message} — continuing without metadata`,
        );
      }

      // 6. Label: explicit > basename of path.
      const label = (params.label ?? path.basename(resolvedPath)).trim();

      // 7. Insert. The unique index (appId, path) guards against duplicates;
      //    surface a clean error instead of the raw DB constraint message.
      try {
        const [row] = await db
          .insert(remoteSchema.appFolders)
          .values({
            appId: params.appId,
            path: resolvedPath,
            label,
            language: detected?.primaryLanguage ?? null,
            projectType: detected?.projectType ?? null,
            isPrimary: 0, // extras are never primary
            createdAt: new Date(),
          })
          .returning();

        return {
          id: row.id,
          appId: row.appId,
          path: row.path,
          label: row.label,
          language: row.language,
          projectType: row.projectType,
          isPrimary: row.isPrimary === 1,
          createdAt: row.createdAt,
        };
      } catch (err) {
        const msg = (err as Error).message ?? "";
        if (/UNIQUE/i.test(msg)) {
          throw new Error(
            `Folder "${resolvedPath}" is already linked to this app.`,
          );
        }
        throw err;
      }
    },
  );

  // ── remove-app-folder ──────────────────────────────────────────────────────
  createTypedHandler(
    appFolderContracts.removeAppFolder,
    async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();

      // 1. Verify the folder belongs to an app owned by the user.
      const folder = await db.query.appFolders.findFirst({
        where: eq(remoteSchema.appFolders.id, params.folderId),
      });
      if (!folder) throw new Error("Folder not found");

      const app = await db.query.apps.findFirst({
        where: and(
          eq(remoteSchema.apps.id, folder.appId),
          eq(remoteSchema.apps.userId, context.userId),
        ),
      });
      if (!app) throw new Error("App not found");

      // 2. Cross-check the appId in params matches the folder's appId.
      if (folder.appId !== params.appId) {
        throw new Error("Folder does not belong to this app");
      }

      // 3. The primary folder cannot be removed (grill decision #2).
      if (folder.isPrimary === 1) {
        throw new Error("The primary folder cannot be removed.");
      }

      // 4. Delete the link. Files on disk are untouched (grill decision #11).
      await db
        .delete(remoteSchema.appFolders)
        .where(eq(remoteSchema.appFolders.id, params.folderId));
    },
  );

  // ── update-app-folder-label ─────────────────────────────────────────────────
  createTypedHandler(
    appFolderContracts.updateAppFolderLabel,
    async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();

      // 1. Verify ownership chain: folder → app → user.
      const folder = await db.query.appFolders.findFirst({
        where: eq(remoteSchema.appFolders.id, params.folderId),
      });
      if (!folder) throw new Error("Folder not found");

      const app = await db.query.apps.findFirst({
        where: and(
          eq(remoteSchema.apps.id, folder.appId),
          eq(remoteSchema.apps.userId, context.userId),
        ),
      });
      if (!app) throw new Error("App not found");

      if (folder.appId !== params.appId) {
        throw new Error("Folder does not belong to this app");
      }

      // 2. Update the label only.
      await db
        .update(remoteSchema.appFolders)
        .set({ label: params.label.trim() })
        .where(eq(remoteSchema.appFolders.id, params.folderId));
    },
  );
}
