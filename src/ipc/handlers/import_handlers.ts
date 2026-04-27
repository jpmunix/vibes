import { dialog } from "electron";
import fs from "fs/promises";
import path from "path";
import { createTypedHandler } from "./base";
import { systemContracts } from "../types/system";
import { importContracts } from "../types/import";
import log from "electron-log";
import { getVibesAppPath } from "../../paths/paths";
import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { eq } from "drizzle-orm";

import { copyDirectoryRecursive } from "../utils/file_utils";
import { gitCommit, gitAdd, gitInit } from "../utils/git_utils";
import { readSettings } from "../../main/settings";
import { detectProjectLanguage } from "../utils/detect_language";

const logger = log.scope("import-handlers");

export function registerImportHandlers() {
  // Handler for selecting an app folder
  createTypedHandler(systemContracts.selectAppFolder, async () => {
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
  createTypedHandler(importContracts.checkAiRules, async (_, { path: appPath }) => {
    try {
      await fs.access(path.join(appPath, "AI_RULES.md"));
      return { exists: true };
    } catch {
      return { exists: false };
    }
  });

  // Handler for checking if an app name is already taken
  createTypedHandler(importContracts.checkAppName, async (_, { appName, skipCopy }) => {
    // Only check filesystem if we're copying to vibes-apps
    if (!skipCopy) {
      const appPath = getVibesAppPath(appName);
      try {
        await fs.access(appPath);
        // Folder exists in vibes-apps — check if it's already registered in the DB
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
  });

  // Handler for importing an app
  createTypedHandler(importContracts.importApp, async (_, { path: sourcePath, appName, installCommand, startCommand, skipCopy }) => {
    // Validate the source path exists
    try {
      await fs.access(sourcePath);
    } catch {
      throw new Error("Source folder does not exist");
    }

    // Determine the app path based on skipCopy
    const appPath = skipCopy ? sourcePath : getVibesAppPath(appName);

    if (!skipCopy) {
      // Check if the app already exists in vibes-apps
      const errorMessage = "An app with this name already exists";
      try {
        await fs.access(appPath);
        throw new Error(errorMessage);
      } catch (error: any) {
        if (error.message === errorMessage) {
          throw error;
        }
      }
      // Copy the app folder to the Vibes apps directory.
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

      // Only stage + commit if the folder has trackable files
      const entries = await fs.readdir(appPath);
      const hasFiles = entries.some((e) => e !== ".git");
      if (hasFiles) {
        await gitAdd({ path: appPath, filepath: "." });
        await gitCommit({
          path: appPath,
          message: "Init vibes app",
        });
      }
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

    // Detect primary language and persist it
    try {
      const { primaryLanguage, projectType } = await detectProjectLanguage(appPath);
      if (primaryLanguage !== "unknown") {
        await getRemoteDb()
          .update(remoteSchema.apps)
          .set({ primaryLanguage, projectType })
          .where(eq(remoteSchema.apps.id, app.id));
      }
    } catch (e) {
      logger.warn(`Failed to detect language for imported app ${app.id}:`, e);
    }

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
  });

  logger.debug("Registered import IPC handlers");
}
