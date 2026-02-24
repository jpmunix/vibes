import { dialog } from "electron";
import fs from "fs/promises";
import path from "path";
import { createLoggedHandler } from "./safe_handle";
import log from "electron-log";
import { getDyadAppPath } from "../../paths/paths";
import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { eq } from "drizzle-orm";

import { ImportAppParams, ImportAppResult } from "@/ipc/types";
import { copyDirectoryRecursive } from "../utils/file_utils";
import { gitCommit, gitAdd, gitInit } from "../utils/git_utils";
import { readSettings } from "../../main/settings";

const logger = log.scope("import-handlers");
const handle = createLoggedHandler(logger);

export function registerImportHandlers() {
  // Handler for selecting an app folder
  handle("select-app-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select App Folder to Import",
    });

    if (result.canceled) {
      return { path: null, name: null };
    }

    const selectedPath = result.filePaths[0];
    const folderName = path.basename(selectedPath);

    return { path: selectedPath, name: folderName };
  });

  // Handler for checking if AI_RULES.md exists
  handle("check-ai-rules", async (_, { path: appPath }: { path: string }) => {
    try {
      await fs.access(path.join(appPath, "AI_RULES.md"));
      return { exists: true };
    } catch {
      return { exists: false };
    }
  });

  // Handler for checking if an app name is already taken
  handle(
    "check-app-name",
    async (
      _,
      { appName, skipCopy }: { appName: string; skipCopy?: boolean },
    ) => {
      // Only check filesystem if we're copying to dyad-apps
      if (!skipCopy) {
        const appPath = getDyadAppPath(appName);
        try {
          await fs.access(appPath);
          // Folder exists in dyad-apps — check if it's already registered in the DB
          const existingApp = await getRemoteDb().query.apps.findFirst({
            where: eq(remoteSchema.apps.name, appName),
          });
          if (existingApp) {
            return { exists: true, existingAppId: existingApp.id };
          }
          return { exists: true };
        } catch {
          // Path doesn't exist, continue checking database
        }
      }

      // Check database
      const existingApp = await getRemoteDb().query.apps.findFirst({
        where: eq(remoteSchema.apps.name, appName),
      });

      return {
        exists: !!existingApp,
        existingAppId: existingApp?.id,
      };
    },
  );

  // Handler for importing an app
  handle(
    "import-app",
    async (
      _,
      {
        path: sourcePath,
        appName,
        installCommand,
        startCommand,
        skipCopy,
      }: ImportAppParams,
    ): Promise<ImportAppResult> => {
      // Validate the source path exists
      try {
        await fs.access(sourcePath);
      } catch {
        throw new Error("Source folder does not exist");
      }

      // Determine the app path based on skipCopy
      const appPath = skipCopy ? sourcePath : getDyadAppPath(appName);

      if (!skipCopy) {
        // Check if the app already exists in dyad-apps
        const errorMessage = "An app with this name already exists";
        try {
          await fs.access(appPath);
          throw new Error(errorMessage);
        } catch (error: any) {
          if (error.message === errorMessage) {
            throw error;
          }
        }
        // Copy the app folder to the Dyad apps directory.
        // Why not use fs.cp? Because we want stable ordering for
        // tests.
        await copyDirectoryRecursive(sourcePath, appPath);
      }

      const isGitRepo = await fs
        .access(path.join(appPath, ".git"))
        .then(() => true)
        .catch(() => false);
      if (!isGitRepo) {
        // Initialize git repo and create first commit
        await gitInit({ path: appPath, ref: "main" });

        // Stage all files

        await gitAdd({ path: appPath, filepath: "." });

        // Create initial commit
        await gitCommit({
          path: appPath,
          message: "Init vibes app",
        });
      }

      const userId = readSettings().userId;
      if (!userId) throw new Error("Unauthorized");
      // Create a new app
      // Store the full absolute path when skipCopy is true, otherwise store appName
      const [app] = await getRemoteDb()
        .insert(remoteSchema.apps)
        .values({
          userId,
          name: appName,
          path: skipCopy ? sourcePath : appName,
          installCommand: installCommand ?? null,
          startCommand: startCommand ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create an initial chat for this app
      const [chat] = await getRemoteDb()
        .insert(remoteSchema.chats)
        .values({
          userId,
          appId: app.id,
          createdAt: new Date(),
        })
        .returning();
      return { appId: app.id, chatId: chat.id };
    },
  );

  logger.debug("Registered import IPC handlers");
}
