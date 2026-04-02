import { ipcMain, app, dialog, BrowserWindow } from "electron";
import { getRemoteDb } from "../../db/remote";
import { getDatabasePath, db } from "../../db";
import * as remoteSchema from "../../db/remote-schema";
import { desc, eq, like, and } from "drizzle-orm";
import { createTypedHandler } from "./base";
import { appContracts } from "../types/app";
import { miscContracts } from "../types/misc";
import { systemContracts } from "../types/system";
import fs from "node:fs";
import path from "node:path";
import { getVibesAppPath, getUserDataPath } from "../../paths/paths";
import { ChildProcess, spawn } from "node:child_process";
import { promises as fsPromises } from "node:fs";
import log from "electron-log";

// Extracted modules
import {
  executeApp,
  copyDir,
  logBuffer,
  proxyUrlByApp,
  autoRecoveryAttempted,
  cleanUpPort,
  getDefaultCommand,
} from "./app_execution";
import { searchAppFilesWithRipgrep } from "./app_search";

// Utility modules
import { withLock } from "../utils/lock_utils";
import { getFilesRecursively } from "../utils/file_utils";
import {
  runningApps,
  processCounter,
  removeAppIfCurrentProcess,
  stopAppByInfo,
  removeDockerVolumesForApp,
} from "../utils/process_manager";
import { getEnvVar } from "../utils/read_env";
import { readSettings } from "../../main/settings";
import { addLog, clearLogs } from "../../lib/log_store";
import {
  deploySupabaseFunction,
  getSupabaseProjectName,
} from "../../supabase_admin/supabase_management_client";
import { getLanguageModelProviders } from "../shared/language_model_helpers";
import { createFromTemplate } from "./createFromTemplate";
import {
  gitCommit,
  gitAdd,
  gitInit,
  gitListBranches,
  gitRenameBranch,
  gitClone,
} from "../utils/git_utils";
import { safeSend } from "../utils/safe_sender";
import { normalizePath } from "../../../shared/normalizePath";
import {
  isServerFunction,
  isSharedServerModule,
  deployAllSupabaseFunctions,
  extractFunctionNameFromPath,
} from "@/supabase_admin/supabase_utils";
import { getVercelTeamSlug } from "../utils/vercel_utils";
import { storeDbTimestampAtCurrentVersion } from "../utils/neon_timestamp_utils";
import { AppSearchResult, DEFAULT_STANDARD_MODEL } from "@/lib/schemas";
import { generateCuteAppName } from "../../lib/utils";
import { openRouterCompletion, hasOpenRouterApiKey } from "../utils/openrouter";
import { getEffectivePrompt } from "../../prompts";
import { getAppPort, findFreeAppPort } from "../../../shared/ports";

const logger = log.scope("app_handlers");



export function registerAppHandlers() {
  createTypedHandler(systemContracts.restartVibes, async () => {
    app.relaunch();
    app.quit();
  });

  createTypedHandler(appContracts.createApp, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    // Auto-resolve name collisions by appending -2, -3, etc.
    let appPath = params.name;
    let fullAppPath = getVibesAppPath(appPath);
    let suffix = 1;
    const baseName = params.name;
    while (fs.existsSync(fullAppPath) || await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.name, appPath), eq(remoteSchema.apps.userId, context.userId)),
    })) {
      suffix++;
      appPath = `${baseName}-${suffix}`;
      fullAppPath = getVibesAppPath(appPath);
    }
    // Create a new app
    const [app] = await db
      .insert(remoteSchema.apps)
      .values({
        userId: context.userId,
        name: appPath,
        // Use the name as the path for now
        path: appPath,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Create an initial chat for this app
    const [chat] = await db
      .insert(remoteSchema.chats)
      .values({
        userId: context.userId,
        appId: app.id,
        createdAt: new Date(),
      })
      .returning();

    await createFromTemplate({
      fullAppPath,
      appName: appPath,
      forceDefaultScaffold: params.useDefaultScaffold,
    });

    // Initialize git repo and create first commit
    // Wrap in withLock to prevent race conditions with frontend auto-commit
    const commitHash = await withLock(app.id, async () => {
      await gitInit({ path: fullAppPath, ref: "main" });
      await gitAdd({ path: fullAppPath, filepath: "." });
      return gitCommit({
        path: fullAppPath,
        message: "Init vibes app",
      });
    });

    // Update chat with initial commit hash
    await db
      .update(remoteSchema.chats)
      .set({
        initialCommitHash: commitHash,
      })
      .where(and(eq(remoteSchema.chats.id, chat.id), eq(remoteSchema.chats.userId, context.userId)));

    return {
      app: { ...app, resolvedPath: fullAppPath },
      chatId: chat.id,
    };
  });

  createTypedHandler(appContracts.copyApp, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { appId, newAppName, withHistory } = params;

    // 1. Check if an app with the new name already exists
    const existingApp = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.name, newAppName), eq(remoteSchema.apps.userId, context.userId)),
    });

    if (existingApp) {
      throw new Error(`An app named "${newAppName}" already exists.`);
    }

    // 2. Find the original app
    const originalApp = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
    });

    if (!originalApp) {
      throw new Error("Original app not found.");
    }

    const originalAppPath = getVibesAppPath(originalApp.path);
    const newAppPath = getVibesAppPath(newAppName);

    // 3. Copy the app folder
    try {
      await copyDir(
        originalAppPath,
        newAppPath,
        (source: string) => {
          if (!withHistory && path.basename(source) === ".git") {
            return false;
          }
          return true;
        },
        { excludeNodeModules: true },
      );
    } catch (error) {
      logger.error("Failed to copy app directory:", error);
      throw new Error("Failed to copy app directory.");
    }

    if (!withHistory) {
      // Initialize git repo and create first commit
      // Note: newDbApp doesn't exist yet, use path-based lock
      await withLock(`git:${newAppName}`, async () => {
        await gitInit({ path: newAppPath, ref: "main" });
        await gitAdd({ path: newAppPath, filepath: "." });
        await gitCommit({
          path: newAppPath,
          message: "Init vibes app",
        });
      });
    }

    // 4. Create a new app entry in the database
    const [newDbApp] = await db
      .insert(remoteSchema.apps)
      .values({
        userId: context.userId,
        name: newAppName,
        path: newAppName, // Use the new name for the path
        // Explicitly set these to null because we don't want to copy them over.
        // Note: we could just leave them out since they're nullable field, but this
        // is to make it explicit we intentionally don't want to copy them over.
        supabaseProjectId: null,
        githubOrg: null,
        githubRepo: null,
        installCommand: originalApp.installCommand,
        startCommand: originalApp.startCommand,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return { app: newDbApp };
  });

  createTypedHandler(appContracts.getApp, async (_, appId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const app = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
    });

    if (!app) {
      throw new Error("App not found");
    }

    // Get app files
    const appPath = getVibesAppPath(app.path);

    // Performance: run file listing, Supabase project name, and Vercel slug
    // in parallel instead of sequentially. The file listing is the slowest
    // operation (recursive directory walk).
    const settings = readSettings();
    const hasSupabaseCredentials =
      (app.supabaseOrganizationSlug &&
        settings.supabase?.organizations?.[app.supabaseOrganizationSlug]
          ?.accessToken?.value) ||
      settings.supabase?.accessToken?.value;

    const [files, supabaseProjectName, vercelTeamSlug] = await Promise.all([
      // File listing — runs in a microtask to not block
      (async () => {
        try {
          const rawFiles = getFilesRecursively(appPath, appPath);
          return rawFiles.map((p) => normalizePath(p));
        } catch (error) {
          logger.error(`Error reading files for app ${appId}:`, error);
          return [] as string[];
        }
      })(),
      // Supabase project name (network call)
      app.supabaseProjectId && hasSupabaseCredentials
        ? getSupabaseProjectName(
            app.supabaseParentProjectId || app.supabaseProjectId,
            app.supabaseOrganizationSlug ?? undefined,
          )
        : Promise.resolve(null),
      // Vercel team slug (network call)
      app.vercelTeamId
        ? getVercelTeamSlug(app.vercelTeamId)
        : Promise.resolve(null),
    ]);

    return {
      ...app,
      files,
      resolvedPath: appPath,
      supabaseProjectName,
      vercelTeamSlug,
    };
  });

  createTypedHandler(appContracts.listApps, async (_, _input, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const allApps = await db.query.apps.findMany({
      where: eq(remoteSchema.apps.userId, context.userId),
      orderBy: [desc(remoteSchema.apps.createdAt)],
    });

    // Performance: resolve paths and check existence in parallel with
    // non-blocking fs.promises.access instead of sync fs.existsSync.
    // For 20+ apps this avoids 20 synchronous I/O calls blocking the event loop.
    const appsWithResolvedPath = await Promise.all(
      allApps.map(async (app) => {
        const resolvedPath = getVibesAppPath(app.path);
        let localPathExists = false;
        try {
          await fsPromises.access(resolvedPath);
          localPathExists = true;
        } catch {
          // Path does not exist
        }
        return {
          ...app,
          resolvedPath,
          localPathExists,
          canClone: !!(app.githubOrg && app.githubRepo),
        };
      }),
    );

    // Fire-and-forget: ensure every local app has stack-rules in the KB.
    // Uses a per-session Set so each app is only checked once per launch.
    // ensureKnowledgeBaseRules exits fast if the entry already exists.
    const { ensureKnowledgeBaseRules } = await import("./knowledge_migration");
    for (const app of appsWithResolvedPath) {
      if (app.localPathExists && context.userId) {
        void ensureKnowledgeBaseRules(app.id, app.resolvedPath, context.userId);
      }
    }

    return {
      apps: appsWithResolvedPath,
    };
  });

  createTypedHandler(appContracts.readAppFile, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { appId, filePath } = params;
    const app = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
    });

    if (!app) {
      throw new Error("App not found");
    }

    const appPath = getVibesAppPath(app.path);
    const fullPath = path.join(appPath, filePath);

    // Check if the path is within the app directory (security check)
    if (!fullPath.startsWith(appPath)) {
      throw new Error("Invalid file path");
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error("File not found");
    }

    try {
      const contents = fs.readFileSync(fullPath, "utf-8");
      return contents;
    } catch (error) {
      logger.error(`Error reading file ${filePath} for app ${appId}:`, error);
      throw new Error("Failed to read file");
    }
  });

  // Do NOT use typed handler for this, it contains sensitive information.
  ipcMain.handle("get-env-vars", async () => {
    const envVars: Record<string, string | undefined> = {};
    const providers = await getLanguageModelProviders();
    for (const provider of providers) {
      if (provider.envVarName) {
        envVars[provider.envVarName] = getEnvVar(provider.envVarName);
      }
    }
    return envVars;
  });

  createTypedHandler(appContracts.runApp, async (event, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { appId } = params;
    return withLock(appId, async () => {
      // Check if app is already running
      if (runningApps.has(appId)) {
        logger.debug(`App ${appId} is already running.`);
        // Re-emit the proxy URL if the proxy was previously started
        // (only if we have a stored URL - don't emit if npm install is still running)
        const storedProxy = proxyUrlByApp.get(appId);
        if (storedProxy) {
          safeSend(event.sender, "app:output", {
            type: "stdout",
            message: `[vibes-proxy-server]started=[${storedProxy.proxyUrl}] original=[${storedProxy.originalUrl}]`,
            appId,
          });
        }
        return;
      }

      const app = await db.query.apps.findFirst({
        where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
      });

      if (!app) {
        throw new Error("App not found");
      }

      logger.debug(`Starting app ${appId} in path ${app.path}`);

      const appPath = getVibesAppPath(app.path);
      try {
        // There may have been a previous run that left a process on this port.
        await cleanUpPort(getAppPort(appId));
        await executeApp({
          appPath,
          appId,
          event,
          isNeon: !!app.neonProjectId,
          installCommand: app.installCommand,
          startCommand: app.startCommand,
        });

        return;
      } catch (error: any) {
        logger.error(`Error running app ${appId}:`, error);
        // Ensure cleanup if error happens during setup but before process events are handled
        if (
          runningApps.has(appId) &&
          runningApps.get(appId)?.processId === processCounter.value
        ) {
          runningApps.delete(appId);
        }
        throw new Error(`Failed to run app ${appId}: ${error.message}`);
      }
    });
  });

  createTypedHandler(appContracts.stopApp, async (_, params) => {
    const { appId } = params;
    logger.log(
      `Attempting to stop app ${appId}. Current running apps: ${runningApps.size}`,
    );
    return withLock(appId, async () => {
      const appInfo = runningApps.get(appId);

      if (!appInfo) {
        logger.log(
          `App ${appId} not found in running apps map. Assuming already stopped.`,
        );
        return;
      }

      const { process, processId } = appInfo;
      logger.log(
        `Found running app ${appId} with processId ${processId} (PID: ${process.pid}). Attempting to stop.`,
      );

      // Check if the process is already exited or closed
      if (process.exitCode !== null || process.signalCode !== null) {
        logger.log(
          `Process for app ${appId} (PID: ${process.pid}) already exited (code: ${process.exitCode}, signal: ${process.signalCode}). Cleaning up map.`,
        );
        runningApps.delete(appId); // Ensure cleanup if somehow missed
        return;
      }

      try {
        proxyUrlByApp.delete(appId);
        await stopAppByInfo(appId, appInfo);

        // Now, safely remove the app from the map *after* confirming closure
        removeAppIfCurrentProcess(appId, process);

        return;
      } catch (error: any) {
        logger.error(
          `Error stopping app ${appId} (PID: ${process.pid}, processId: ${processId}):`,
          error,
        );
        // Attempt cleanup even if an error occurred during the stop process
        removeAppIfCurrentProcess(appId, process);
        throw new Error(`Failed to stop app ${appId}: ${error.message}`);
      }
    });
  });

  createTypedHandler(appContracts.getAppRunningStatus, async (_, params) => {
    const { appId } = params;
    const appInfo = runningApps.get(appId);

    if (!appInfo) {
      return { status: "stopped" as const };
    }

    // Check if the process is still alive
    const proc = appInfo.process;
    if (proc.exitCode !== null || proc.signalCode !== null) {
      // Process has exited — check if it was an error
      const isError = proc.exitCode !== null && proc.exitCode !== 0;
      return { status: isError ? ("error" as const) : ("stopped" as const) };
    }

    // Process is alive. Check if the server is actually serving
    // by looking for a stored proxy URL (set once the port is detected open)
    const storedProxy = proxyUrlByApp.get(appId);
    if (storedProxy) {
      return {
        status: "running" as const,
        url: storedProxy.originalUrl,
      };
    }

    // Process alive but no proxy yet → still starting up
    return { status: "running" as const };
  });

  createTypedHandler(appContracts.restartApp, async (event, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { appId, removeNodeModules } = params;
    logger.log(`Restarting app ${appId}`);
    // Clear auto-recovery flag so the next start cycle gets a fresh attempt
    autoRecoveryAttempted.delete(appId);
    return withLock(appId, async () => {
      try {
        // First stop the app if it's running
        const appInfo = runningApps.get(appId);
        if (appInfo) {
          const { processId } = appInfo;
          logger.log(
            `Stopping app ${appId} (processId ${processId}) before restart`,
          );
          proxyUrlByApp.delete(appId);
          await stopAppByInfo(appId, appInfo);
        } else {
          logger.log(`App ${appId} not running. Proceeding to start.`);
        }

        // There may have been a previous run that left a process on this port.
        await cleanUpPort(getAppPort(appId));

        // Now start the app again
        const app = await db.query.apps.findFirst({
          where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
        });

        if (!app) {
          throw new Error("App not found");
        }

        const appPath = getVibesAppPath(app.path);

        // Remove node_modules if requested
        if (removeNodeModules) {
          const settings = readSettings();
          const runtimeMode = settings.runtimeMode2 ?? "host";

          const nodeModulesPath = path.join(appPath, "node_modules");
          logger.log(
            `Removing node_modules for app ${appId} at ${nodeModulesPath}`,
          );
          if (fs.existsSync(nodeModulesPath)) {
            await fsPromises.rm(nodeModulesPath, {
              recursive: true,
              force: true,
            });
            logger.log(`Successfully removed node_modules for app ${appId}`);
          } else {
            logger.log(`No node_modules directory found for app ${appId}`);
          }

          // If running in Docker mode, also remove container volumes so deps reinstall freshly
          if (runtimeMode === "docker") {
            logger.log(
              `Docker mode detected for app ${appId}. Removing Docker volumes vibes-pnpm-${appId}...`,
            );
            try {
              await removeDockerVolumesForApp(appId);
              logger.log(
                `Removed Docker volumes for app ${appId} (vibes-pnpm-${appId}).`,
              );
            } catch (e) {
              // Best-effort cleanup; log and continue
              logger.warn(
                `Failed to remove Docker volumes for app ${appId}. Continuing: ${e}`,
              );
            }
          }
        }

        logger.debug(
          `Executing app ${appId} in path ${app.path} after restart request`,
        ); // Adjusted log

        await executeApp({
          appPath,
          appId,
          event,
          isNeon: !!app.neonProjectId,
          installCommand: app.installCommand,
          startCommand: app.startCommand,
        }); // This will handle starting either mode

        return;
      } catch (error) {
        logger.error(`Error restarting app ${appId}:`, error);
        throw error;
      }
    });
  });

  createTypedHandler(appContracts.editAppFile, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    let { appId, filePath, content } = params;
    // It should already be normalized, but just in case.
    filePath = normalizePath(filePath);
    const app = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
    });

    if (!app) {
      throw new Error("App not found");
    }

    const appPath = getVibesAppPath(app.path);
    const fullPath = path.join(appPath, filePath);

    // Check if the path is within the app directory (security check)
    if (!fullPath.startsWith(appPath)) {
      throw new Error("Invalid file path");
    }

    if (app.neonProjectId && app.neonDevelopmentBranchId) {
      try {
        await storeDbTimestampAtCurrentVersion({
          appId: app.id,
        });
      } catch (error) {
        logger.error("Error storing Neon timestamp at current version:", error);
        throw new Error(
          "Could not store Neon timestamp at current version; database versioning functionality is not working: " +
          error,
        );
      }
    }

    // Ensure directory exists
    const dirPath = path.dirname(fullPath);
    await fsPromises.mkdir(dirPath, { recursive: true });

    try {
      await fsPromises.writeFile(fullPath, content, "utf-8");

      // Check if git repository exists and commit the change
      if (fs.existsSync(path.join(appPath, ".git"))) {
        await gitAdd({ path: appPath, filepath: filePath });

        await gitCommit({
          path: appPath,
          message: `Updated ${filePath}`,
        });
      }
    } catch (error: any) {
      logger.error(`Error writing file ${filePath} for app ${appId}:`, error);
      throw new Error(`Failed to write file: ${error.message}`);
    }

    if (app.supabaseProjectId) {
      // Check if shared module was modified - redeploy all functions
      if (isSharedServerModule(filePath)) {
        try {
          logger.info(
            `Shared module ${filePath} modified, redeploying all Supabase functions`,
          );
          const settings = readSettings();
          const deployErrors = await deployAllSupabaseFunctions({
            appPath,
            supabaseProjectId: app.supabaseProjectId,
            supabaseOrganizationSlug: app.supabaseOrganizationSlug ?? null,
            skipPruneEdgeFunctions: settings.skipPruneEdgeFunctions ?? false,
          });
          if (deployErrors.length > 0) {
            return {
              warning: `File saved, but some Supabase functions failed to deploy: ${deployErrors.join(", ")}`,
            };
          }
        } catch (error) {
          logger.error(
            `Error redeploying Supabase functions after shared module change:`,
            error,
          );
          return {
            warning: `File saved, but failed to redeploy Supabase functions: ${error}`,
          };
        }
      } else if (isServerFunction(filePath)) {
        // Regular function file - deploy just this function
        try {
          const functionName = extractFunctionNameFromPath(filePath);
          await deploySupabaseFunction({
            supabaseProjectId: app.supabaseProjectId,
            functionName,
            appPath,
            organizationSlug: app.supabaseOrganizationSlug ?? null,
          });
        } catch (error) {
          logger.error(`Error deploying Supabase function ${filePath}:`, error);
          return {
            warning: `File saved, but failed to deploy Supabase function: ${filePath}: ${error}`,
          };
        }
      }
    }
    return {};
  });

  createTypedHandler(appContracts.deleteApp, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { appId, deleteFiles } = params;
    // Static server worker is NOT terminated here anymore

    return withLock(appId, async () => {
      // Check if app exists
      const app = await db.query.apps.findFirst({
        where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
      });

      if (!app) {
        throw new Error("App not found");
      }

      // Stop the app if it's running
      if (runningApps.has(appId)) {
        const appInfo = runningApps.get(appId)!;
        try {
          logger.log(`Stopping app ${appId} before deletion.`); // Adjusted log
          await stopAppByInfo(appId, appInfo);
        } catch (error: any) {
          logger.error(`Error stopping app ${appId} before deletion:`, error); // Adjusted log
          // Continue with deletion even if stopping fails
        }
      }

      // Clear logs for this app to prevent memory leak
      clearLogs(appId);

      // Delete app from database
      try {
        await db.delete(remoteSchema.apps)
          .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)));
        // Note: Associated chats will cascade delete
      } catch (error: any) {
        logger.error(`Error deleting app ${appId} from database:`, error);
        throw new Error(`Failed to delete app from database: ${error.message}`);
      }

      // Only delete files if explicitly requested
      if (deleteFiles) {
        const appPath = getVibesAppPath(app.path);
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            await fsPromises.rm(appPath, { recursive: true, force: true });
            break; // Success, exit retry loop
          } catch (error: any) {
            if (attempt < maxRetries && (error.code === 'ENOTEMPTY' || error.code === 'EBUSY' || error.code === 'EPERM')) {
              logger.warn(
                `Attempt ${attempt}/${maxRetries} to delete app files failed (${error.code}). Retrying in ${attempt * 500}ms...`,
              );
              await new Promise((resolve) => setTimeout(resolve, attempt * 500));
            } else {
              logger.error(`Error deleting app files for app ${appId}:`, error);
              // App is already removed from DB, so just warn
              logger.warn(
                `App deleted from database, but failed to delete app files at ${appPath}. Files remain on disk.`,
              );
            }
          }
        }
      } else {
        logger.log(`App ${appId} unlinked from Vibes (files preserved on disk).`);
      }
    });
  });

  createTypedHandler(appContracts.addToFavorite, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { appId } = params;
    return withLock(appId, async () => {
      try {
        // Fetch the current isFavorite value
        const result = await db
          .select({ isFavorite: remoteSchema.apps.isFavorite })
          .from(remoteSchema.apps)
          .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)))
          .limit(1);

        if (result.length === 0) {
          throw new Error(`App with ID ${appId} not found.`);
        }

        const currentIsFavorite = result[0].isFavorite;

        // Toggle the isFavorite value
        const updated = await db
          .update(remoteSchema.apps)
          .set({ isFavorite: currentIsFavorite ? 0 : 1 })
          .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)))
          .returning({ isFavorite: remoteSchema.apps.isFavorite });

        if (updated.length === 0) {
          throw new Error(
            `Failed to update favorite status for app ID ${appId}.`,
          );
        }

        // Return the updated isFavorite value
        return { isFavorite: updated[0].isFavorite };
      } catch (error: any) {
        logger.error(
          `Error in add-to-favorite handler for app ID ${appId}:`,
          error,
        );
        throw new Error(`Failed to toggle favorite status: ${error.message}`);
      }
    });
  });

  createTypedHandler(appContracts.updateAppCommands, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { appId, installCommand, startCommand } = params;
    return withLock(appId, async () => {
      try {
        await db
          .update(remoteSchema.apps)
          .set({
            installCommand: installCommand?.trim() || null,
            startCommand: startCommand?.trim() || null,
          })
          .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)));
        logger.info(
          `Updated commands for app ${appId}: install="${installCommand}", start="${startCommand}"`,
        );
      } catch (error: any) {
        logger.error(
          `Error updating commands for app ID ${appId}:`,
          error,
        );
        throw new Error(`Failed to update app commands: ${error.message}`);
      }
    });
  });

  createTypedHandler(appContracts.renameApp, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { appId, appName, appPath: newPath } = params;
    return withLock(appId, async () => {
      let appPath = newPath;
      // Check if app exists
      const app = await db.query.apps.findFirst({
        where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
      });

      if (!app) {
        throw new Error("App not found");
      }

      const pathChanged = appPath !== app.path;

      // Security: reject NEW absolute paths - rename-app should only accept relative paths for new paths
      // Absolute paths should only be set through change-app-location handler
      // If the path is changing and it's absolute, reject it
      if (pathChanged && path.isAbsolute(appPath)) {
        throw new Error(
          "Absolute paths are not allowed when renaming an app folder. Please use a relative folder name only. To change the storage location, use the 'Change location' button.",
        );
      }

      // Validate path for invalid characters when path changes (only for relative paths)
      if (pathChanged) {
        const invalidChars = /[<>:"|?*/\\]/;
        const hasInvalidChars =
          invalidChars.test(appPath) || /[\x00-\x1f]/.test(appPath);

        if (hasInvalidChars) {
          throw new Error(
            `App path "${appPath}" contains characters that are not allowed in folder names: < > : " | ? * / \\ or control characters. Please use a different path.`,
          );
        }
      }

      // Check for conflicts with existing apps
      const nameConflict = await db.query.apps.findFirst({
        where: and(eq(remoteSchema.apps.name, appName), eq(remoteSchema.apps.userId, context.userId)),
      });

      if (nameConflict && nameConflict.id !== appId) {
        throw new Error(`An app with the name '${appName}' already exists`);
      }

      // If the current path is absolute, preserve the directory and only change the folder name
      // Otherwise, resolve the new path using the default base path
      const currentResolvedPath = getVibesAppPath(app.path);
      const newAppPath = path.isAbsolute(app.path)
        ? path.join(path.dirname(app.path), appPath)
        : getVibesAppPath(appPath);

      let hasPathConflict = false;
      if (pathChanged) {
        const allApps = await db.query.apps.findMany({
          where: eq(remoteSchema.apps.userId, context.userId),
        });
        hasPathConflict = allApps.some((existingApp) => {
          if (existingApp.id === appId) {
            return false;
          }
          return getVibesAppPath(existingApp.path) === newAppPath;
        });
      }

      if (hasPathConflict) {
        throw new Error(`An app with the path '${newAppPath}' already exists`);
      }

      // Stop the app if it's running
      if (runningApps.has(appId)) {
        const appInfo = runningApps.get(appId)!;
        try {
          await stopAppByInfo(appId, appInfo);
        } catch (error: any) {
          logger.error(`Error stopping app ${appId} before renaming:`, error);
          throw new Error(
            `Failed to stop app before renaming: ${error.message}`,
          );
        }
      }

      const oldAppPath = currentResolvedPath;
      // Only move files if needed
      if (newAppPath !== oldAppPath) {
        // Move app files
        try {
          // Check if destination directory already exists
          if (fs.existsSync(newAppPath)) {
            throw new Error(`Destination path '${newAppPath}' already exists`);
          }

          // Create parent directory if it doesn't exist
          await fsPromises.mkdir(path.dirname(newAppPath), {
            recursive: true,
          });

          // Copy the directory without node_modules
          await copyDir(oldAppPath, newAppPath, undefined, {
            excludeNodeModules: true,
          });
        } catch (error: any) {
          logger.error(
            `Error moving app files from ${oldAppPath} to ${newAppPath}:`,
            error,
          );
          // Attempt cleanup if destination exists (partial copy may have occurred)
          if (fs.existsSync(newAppPath)) {
            try {
              await fsPromises.rm(newAppPath, {
                recursive: true,
                force: true,
              });
            } catch (cleanupError) {
              logger.warn(
                `Failed to clean up partial move at ${newAppPath}:`,
                cleanupError,
              );
            }
          }
          throw new Error(`Failed to move app files: ${error.message}`);
        }

        try {
          // Delete the old directory
          await fsPromises.rm(oldAppPath, { recursive: true, force: true });
        } catch (error: any) {
          // Why is this just a warning? This happens quite often on Windows
          // because it has an aggressive file lock.
          //
          // Not deleting the old directory is annoying, but not a big deal
          // since the user can do it themselves if they need to.
          logger.warn(`Error deleting old app directory ${oldAppPath}:`, error);
        }
      }

      // Update app in database
      // If the current path was absolute, store the new absolute path; otherwise store the relative path
      const pathToStore = path.isAbsolute(app.path) ? newAppPath : appPath;
      try {
        await db
          .update(remoteSchema.apps)
          .set({
            name: appName,
            path: pathToStore,
          })
          .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)))
          .returning();

        return;
      } catch (error: any) {
        // Attempt to rollback the file move
        if (newAppPath !== oldAppPath) {
          try {
            // Copy back from new to old
            await copyDir(newAppPath, oldAppPath, undefined, {
              excludeNodeModules: true,
            });
            // Delete the new directory
            await fsPromises.rm(newAppPath, { recursive: true, force: true });
          } catch (rollbackError) {
            logger.error(
              `Failed to rollback file move during rename error:`,
              rollbackError,
            );
          }
        }

        logger.error(`Error updating app ${appId} in database:`, error);
        throw new Error(`Failed to update app in database: ${error.message}`);
      }
    });
  });

  createTypedHandler(systemContracts.resetAll, async () => {
    logger.log("start: resetting all apps and settings.");
    // Stop all running apps first
    logger.log("stopping all running apps...");
    const runningAppIds = Array.from(runningApps.keys());
    for (const appId of runningAppIds) {
      try {
        const appInfo = runningApps.get(appId)!;
        await stopAppByInfo(appId, appInfo);
      } catch (error) {
        logger.error(`Error stopping app ${appId} during reset:`, error);
        // Continue with reset even if stopping fails
      }
    }
    logger.log("all running apps stopped.");
    logger.log("deleting database...");
    // 1. Drop the database by deleting the SQLite file
    const dbPath = getDatabasePath();
    if (fs.existsSync(dbPath)) {
      // Close database connections first
      if (db && (db as any).$client) {
        (db as any).$client.close();
      }
      await fsPromises.unlink(dbPath);
      logger.log(`Database file deleted: ${dbPath}`);
    }
    logger.log("database deleted.");
    logger.log("deleting settings...");
    // 2. Remove settings
    const userDataPath = getUserDataPath();
    const settingsPath = path.join(userDataPath, "user-settings.json");

    if (fs.existsSync(settingsPath)) {
      await fsPromises.unlink(settingsPath);
      logger.log(`Settings file deleted: ${settingsPath}`);
    }
    logger.log("settings deleted.");
    // 3. Remove all app files recursively
    // Doing this last because it's the most time-consuming and the least important
    // in terms of resetting the app state.
    logger.log("removing all app files...");
    const vibesAppPath = getVibesAppPath(".");
    if (fs.existsSync(vibesAppPath)) {
      await fsPromises.rm(vibesAppPath, { recursive: true, force: true });
      // Recreate the base directory
      await fsPromises.mkdir(vibesAppPath, { recursive: true });
    }
    logger.log("all app files removed.");
    logger.log("reset all complete.");
  });

  createTypedHandler(systemContracts.getAppVersion, async () => {
    // Read version from package.json at project root
    const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    return { version: packageJson.version };
  });

  createTypedHandler(systemContracts.getVersionInfo, async () => {
    const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    // Get opencode binary version
    let opencodeVersion: string | null = null;
    try {
      const { execSync } = require("child_process");
      const out = execSync("opencode --version", { timeout: 5000, encoding: "utf-8" });
      const match = out.trim().match(/(\d+\.\d+\.\d+)/);
      opencodeVersion = match ? match[1] : out.trim();
    } catch { /* not installed */ }

    return {
      vibes: packageJson.version,
      opencode: opencodeVersion,
      node: process.versions.node,
      electron: process.versions.electron || "?",
      platform: process.platform,
      arch: process.arch,
    };
  });

  createTypedHandler(appContracts.renameBranch, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { appId, oldBranchName, newBranchName } = params;
    const app = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
    });

    if (!app) {
      throw new Error("App not found");
    }

    const appPath = getVibesAppPath(app.path);

    return withLock(appId, async () => {
      try {
        // Check if the old branch exists
        const branches = await gitListBranches({ path: appPath });
        if (!branches.includes(oldBranchName)) {
          throw new Error(`Branch '${oldBranchName}' not found.`);
        }

        // Check if the new branch name already exists
        if (branches.includes(newBranchName)) {
          // If newBranchName is 'main' and oldBranchName is 'master',
          // and 'main' already exists, we might want to allow this if 'main' is the current branch
          // and just switch to it, or delete 'master'.
          // For now, let's keep it simple and throw an error.
          throw new Error(
            `Branch '${newBranchName}' already exists. Cannot rename.`,
          );
        }

        await gitRenameBranch({
          path: appPath,
          oldBranch: oldBranchName,
          newBranch: newBranchName,
        });
        logger.info(
          `Branch renamed from '${oldBranchName}' to '${newBranchName}' for app ${appId}`,
        );
      } catch (error: any) {
        logger.error(
          `Failed to rename branch for app ${appId}: ${error.message}`,
        );
        throw new Error(
          `Failed to rename branch '${oldBranchName}' to '${newBranchName}': ${error.message}`,
        );
      }
    });
  });

  createTypedHandler(appContracts.respondToAppInput, async (_, params) => {
    const { appId, response } = params;
    const appInfo = runningApps.get(appId);

    if (!appInfo) {
      throw new Error(`App ${appId} is not running`);
    }

    const { process } = appInfo;

    if (!process.stdin) {
      throw new Error(`App ${appId} process has no stdin available`);
    }

    try {
      // Write the response to stdin with a newline
      process.stdin.write(`${response}\n`);
      logger.debug(`Sent response '${response}' to app ${appId} stdin`);
    } catch (error: any) {
      logger.error(`Error sending response to app ${appId}:`, error);
      throw new Error(`Failed to send response to app: ${error.message}`);
    }
  });

  // Track running shell command processes per app
  const runningShellCommands = new Map<number, ChildProcess>();
  // Track current working directory per app for persistent cd
  const shellCwdMap = new Map<number, string>();

  createTypedHandler(appContracts.executeShellCommand, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { appId, command, timeoutMs } = params;

    // Get app path
    const appRecord = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
    });

    if (!appRecord) {
      throw new Error(`App ${appId} not found`);
    }

    const appPath = getVibesAppPath(appRecord.path);
    const currentCwd = shellCwdMap.get(appId) || appPath;

    // Kill any previously running shell command for this app
    const existingProcess = runningShellCommands.get(appId);
    if (existingProcess && !existingProcess.killed) {
      try {
        if (existingProcess.pid) {
          process.kill(-existingProcess.pid, "SIGTERM");
        }
      } catch {
        // Process may already be dead
      }
      runningShellCommands.delete(appId);
    }

    const trimmedCommand = command.trim();

    // Handle "cd" specially to track CWD changes
    const cdMatch = trimmedCommand.match(/^cd\s+(.*)/);
    if (cdMatch || trimmedCommand === "cd") {
      const target = cdMatch?.[1]?.trim() || process.env.HOME || "/";
      // Resolve the new CWD by running cd + pwd
      const resolveCmd = `cd ${JSON.stringify(currentCwd)} && cd ${target} && pwd`;

      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";

        const p = spawn(resolveCmd, [], {
          cwd: appPath,
          shell: true,
          stdio: "pipe",
        });

        p.stdout?.on("data", (data) => { stdout += data.toString(); });
        p.stderr?.on("data", (data) => { stderr += data.toString(); });

        p.on("close", (code) => {
          if (code === 0 && stdout.trim()) {
            const newCwd = stdout.trim();
            shellCwdMap.set(appId, newCwd);
            resolve({
              stdout: "",
              stderr: "",
              exitCode: 0,
              cwd: newCwd,
            });
          } else {
            resolve({
              stdout: "",
              stderr: stderr || `cd: ${target}: No existe el directorio`,
              exitCode: code ?? 1,
              cwd: currentCwd,
            });
          }
        });

        p.on("error", (err) => {
          resolve({
            stdout: "",
            stderr: err.message,
            exitCode: 1,
            cwd: currentCwd,
          });
        });
      });
    }

    // For all other commands, execute in the tracked CWD
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let settled = false;

      const shellProcess = spawn(trimmedCommand, [], {
        cwd: currentCwd,
        shell: true,
        stdio: "pipe",
        detached: true,
      });

      runningShellCommands.set(appId, shellProcess);

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            if (shellProcess.pid) {
              process.kill(-shellProcess.pid, "SIGTERM");
            }
          } catch {
            // ignore
          }
          runningShellCommands.delete(appId);
          resolve({
            stdout,
            stderr,
            exitCode: null,
            error: `Command timed out after ${timeoutMs}ms`,
            cancelled: false,
            cwd: currentCwd,
          });
        }
      }, timeoutMs);

      shellProcess.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      shellProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      shellProcess.on("close", (code) => {
        clearTimeout(timeout);
        runningShellCommands.delete(appId);
        if (!settled) {
          settled = true;
          resolve({
            stdout,
            stderr,
            exitCode: code,
            cwd: currentCwd,
          });
        }
      });

      shellProcess.on("error", (err) => {
        clearTimeout(timeout);
        runningShellCommands.delete(appId);
        if (!settled) {
          settled = true;
          resolve({
            stdout,
            stderr,
            exitCode: null,
            error: err.message,
            cwd: currentCwd,
          });
        }
      });
    });
  });

  createTypedHandler(appContracts.cancelShellCommand, async (_, params) => {
    const { appId } = params;
    const shellProcess = runningShellCommands.get(appId);

    if (!shellProcess || shellProcess.killed) {
      return;
    }

    try {
      if (shellProcess.pid) {
        process.kill(-shellProcess.pid, "SIGTERM");
      }
    } catch (error: any) {
      logger.warn(`Error killing shell command for app ${appId}:`, error.message);
    }

    runningShellCommands.delete(appId);
  });

  createTypedHandler(appContracts.getShellCompletions, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { appId, partial } = params;

    const appRecord = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
    });

    if (!appRecord) {
      return { completions: [] };
    }

    const appPath = getVibesAppPath(appRecord.path);
    const currentCwd = shellCwdMap.get(appId) || appPath;

    return new Promise((resolve) => {
      // Use compgen for bash-style completion of files/directories
      const escapedPartial = partial.replace(/'/g, "'\\''");
      const cmd = `cd ${JSON.stringify(currentCwd)} && compgen -f -- '${escapedPartial}' 2>/dev/null | head -20`;

      const p = spawn(cmd, [], {
        cwd: currentCwd,
        shell: true,
        stdio: "pipe",
      });

      let stdout = "";
      p.stdout?.on("data", (data) => { stdout += data.toString(); });

      p.on("close", () => {
        const completions = stdout
          .trim()
          .split("\n")
          .filter((line) => line.length > 0);
        resolve({ completions });
      });

      p.on("error", () => {
        resolve({ completions: [] });
      });

      // Timeout for completion
      setTimeout(() => {
        try { p.kill(); } catch { /* ignore */ }
        resolve({ completions: [] });
      }, 3000);
    });
  });

  createTypedHandler(appContracts.searchAppFiles, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { appId, query } = params;
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const appRecord = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
    });

    if (!appRecord) {
      throw new Error("App not found");
    }

    const appPath = getVibesAppPath(appRecord.path);

    // Search file contents with ripgrep
    const contentMatches = await searchAppFilesWithRipgrep({
      appPath,
      query: trimmedQuery,
    });

    return contentMatches;
  });

  createTypedHandler(appContracts.searchApps, async (_, searchQuery) => {
      const settings = readSettings();
      if (!settings.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();

      // Use parameterized query to prevent SQL injection
      const pattern = `%${searchQuery.replace(/[%_]/g, "\\$&")}%`;

      // 1) Apps whose name matches
      const appNameMatches = await db
        .select({
          id: remoteSchema.apps.id,
          name: remoteSchema.apps.name,
          createdAt: remoteSchema.apps.createdAt,
        })
        .from(remoteSchema.apps)
        .where(and(like(remoteSchema.apps.name, pattern), eq(remoteSchema.apps.userId, settings.userId)))
        .orderBy(desc(remoteSchema.apps.createdAt));

      const appNameMatchesResult: AppSearchResult[] = appNameMatches.map(
        (r) => ({
          id: r.id,
          name: r.name,
          createdAt: r.createdAt as unknown as Date,
          matchedChatTitle: null,
          matchedChatMessage: null,
        }),
      );

      // 2) Apps whose chat title matches
      const chatTitleMatches = await db
        .select({
          id: remoteSchema.apps.id,
          name: remoteSchema.apps.name,
          createdAt: remoteSchema.apps.createdAt,
          matchedChatTitle: remoteSchema.chats.title,
        })
        .from(remoteSchema.apps)
        .innerJoin(remoteSchema.chats, eq(remoteSchema.apps.id, remoteSchema.chats.appId))
        .where(and(like(remoteSchema.chats.title, pattern), eq(remoteSchema.apps.userId, settings.userId)))
        .orderBy(desc(remoteSchema.apps.createdAt));

      const chatTitleMatchesResult: AppSearchResult[] = chatTitleMatches.map(
        (r) => ({
          id: r.id,
          name: r.name,
          createdAt: r.createdAt as unknown as Date,
          matchedChatTitle: r.matchedChatTitle,
          matchedChatMessage: null,
        }),
      );

      // 3) Apps whose chat message content matches
      const chatMessageMatches = await db
        .select({
          id: remoteSchema.apps.id,
          name: remoteSchema.apps.name,
          createdAt: remoteSchema.apps.createdAt,
          matchedChatTitle: remoteSchema.chats.title,
          matchedChatMessage: remoteSchema.messages.content,
        })
        .from(remoteSchema.apps)
        .innerJoin(remoteSchema.chats, eq(remoteSchema.apps.id, remoteSchema.chats.appId))
        .innerJoin(remoteSchema.messages, eq(remoteSchema.chats.id, remoteSchema.messages.chatId))
        .where(and(like(remoteSchema.messages.content, pattern), eq(remoteSchema.apps.userId, settings.userId)))
        .orderBy(desc(remoteSchema.apps.createdAt));

      // Flatten and dedupe by app id
      const allMatches: AppSearchResult[] = [
        ...appNameMatchesResult,
        ...chatTitleMatchesResult,
        ...chatMessageMatches,
      ];
      const uniqueApps = Array.from(
        new Map(allMatches.map((app) => [app.id, app])).values(),
      );

      // Sort newest apps first
      uniqueApps.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      return uniqueApps;
    },
  );

  // Handler for adding logs to central store from renderer
  createTypedHandler(miscContracts.addLog, async (_, entry) => {
    addLog(entry);
  });

  // Handler for clearing logs for a specific app
  createTypedHandler(miscContracts.clearLogs, async (_, { appId }) => {
    clearLogs(appId);
  });

  createTypedHandler(appContracts.selectAppLocation, async (_, { defaultPath }) => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        title: "Select a folder where this app will be stored",
        defaultPath,
      });

      if (result.canceled || !result.filePaths[0]) {
        return { path: null, canceled: true };
      }

      return { path: result.filePaths[0], canceled: false };
    },
  );

  createTypedHandler(appContracts.changeAppLocation, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { appId, parentDirectory } = params;

    if (!parentDirectory) {
      throw new Error("No destination folder provided.");
    }

    if (!path.isAbsolute(parentDirectory)) {
      throw new Error("Please select an absolute destination folder.");
    }

    const normalizedParentDir = path.normalize(parentDirectory);

    return withLock(appId, async () => {
      const app = await db.query.apps.findFirst({
        where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
      });

      if (!app) {
        throw new Error("App not found");
      }

      const currentResolvedPath = getVibesAppPath(app.path);
      // Extract app folder name from current path (works for both absolute and relative paths)
      const appFolderName = path.basename(
        path.isAbsolute(app.path) ? app.path : currentResolvedPath,
      );
      const nextResolvedPath = path.join(normalizedParentDir, appFolderName);

      if (currentResolvedPath === nextResolvedPath) {
        // Path hasn't changed, but we should update to absolute path format if needed
        if (!path.isAbsolute(app.path)) {
          await db
            .update(remoteSchema.apps)
            .set({ path: nextResolvedPath })
            .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)));
        }
        return {
          resolvedPath: nextResolvedPath,
        };
      }

      const allApps = await db.query.apps.findMany({
        where: eq(remoteSchema.apps.userId, context.userId),
      });
      const conflict = allApps.some(
        (existingApp) =>
          existingApp.id !== appId &&
          getVibesAppPath(existingApp.path) === nextResolvedPath,
      );

      if (conflict) {
        throw new Error(
          `Another app already exists at '${nextResolvedPath}'. Please choose a different folder.`,
        );
      }

      if (fs.existsSync(nextResolvedPath)) {
        throw new Error(
          `Destination path '${nextResolvedPath}' already exists. Please choose an empty folder.`,
        );
      }

      // Check if source path exists - if not, just update the DB path without copying
      const sourceExists = fs.existsSync(currentResolvedPath);
      if (!sourceExists) {
        logger.warn(
          `Source path ${currentResolvedPath} does not exist. Updating database path only.`,
        );
        await db
          .update(remoteSchema.apps)
          .set({ path: nextResolvedPath })
          .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)));
        return {
          resolvedPath: nextResolvedPath,
        };
      }

      if (runningApps.has(appId)) {
        const appInfo = runningApps.get(appId)!;
        try {
          await stopAppByInfo(appId, appInfo);
        } catch (error: any) {
          logger.error(`Error stopping app ${appId} before moving:`, error);
          throw new Error(`Failed to stop app before moving: ${error.message}`);
        }
      }

      await fsPromises.mkdir(normalizedParentDir, { recursive: true });

      try {
        // Copy the directory without node_modules
        await copyDir(currentResolvedPath, nextResolvedPath, undefined, {
          excludeNodeModules: true,
        });

        // Update path to absolute path
        await db
          .update(remoteSchema.apps)
          .set({ path: nextResolvedPath })
          .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)));

        try {
          await fsPromises.rm(currentResolvedPath, {
            recursive: true,
            force: true,
          });
        } catch (error: any) {
          logger.warn(
            `Error deleting old app directory ${currentResolvedPath}:`,
            error,
          );
        }

        return {
          resolvedPath: nextResolvedPath,
        };
      } catch (error: any) {
        // Attempt cleanup if destination exists (partial copy may have occurred)
        if (fs.existsSync(nextResolvedPath)) {
          try {
            await fsPromises.rm(nextResolvedPath, {
              recursive: true,
              force: true,
            });
          } catch (cleanupError) {
            logger.warn(
              `Failed to clean up partial move at ${nextResolvedPath}:`,
              cleanupError,
            );
          }
        }
        logger.error(
          `Error moving app files from ${currentResolvedPath} to ${nextResolvedPath}:`,
          error,
        );
        throw new Error(`Failed to move app files: ${error.message}`);
      }
    });
  });

  createTypedHandler(appContracts.generateAppTitle, async (_, { prompt }) => {
    const settings = readSettings();
    if (!hasOpenRouterApiKey()) {
      logger.warn(
        "OpenRouter API key not found, using cute app name as fallback",
      );
      return { title: generateCuteAppName() };
    }

    const model =
      settings.standardModeModel || DEFAULT_STANDARD_MODEL;

    logger.info(`[AppTitle] Generating short title with model: ${model}`);
    logger.info(`[AppTitle] Prompt: "${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}"`);

    try {
      const data = await openRouterCompletion({
        model,
        title: "app-title-short",
        temperature: 0.7,
        max_tokens: 30,
        messages: [
          {
            role: "system",
            content: getEffectivePrompt("app_title_short", settings),
          },
          {
            role: "user",
            content: `Generate a short title for this app idea: ${prompt}`,
          },
        ],
      });

      const rawTitle = data?.choices?.[0]?.message?.content?.trim();
      if (!rawTitle) {
        const fallback = generateCuteAppName();
        logger.warn(`[AppTitle] API returned empty title, using fallback: "${fallback}"`);
        return { title: fallback };
      }

      // Sanitize title (remove quotes, etc)
      const sanitizedTitle = rawTitle.replace(/^["']|["']$/g, "").slice(0, 30);
      logger.info(`[AppTitle] Generated: "${sanitizedTitle}" (raw: "${rawTitle}")`);
      return { title: sanitizedTitle };
    } catch (error) {
      const fallback = generateCuteAppName();
      logger.error(`[AppTitle] Error generating title, using fallback: "${fallback}"`, error);
      return { title: fallback };
    }
  });

  createTypedHandler(
    appContracts.generateAppTitleFromHistory,
    async (_, { appId }, context) => {
      const settings = readSettings();
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();

      if (!hasOpenRouterApiKey()) {
        logger.warn(
          "OpenRouter API key not found, using cute app name as fallback",
        );
        return { title: generateCuteAppName() };
      }

      const model =
        settings.standardModeModel || DEFAULT_STANDARD_MODEL;

      logger.info(`[AppNamePro] Generating name for appId=${appId} with model: ${model}`);

      try {
        // Fetch the first user message where they define what they want
        const firstUserMessage = await db
          .select({
            content: remoteSchema.messages.content,
          })
          .from(remoteSchema.messages)
          .innerJoin(remoteSchema.chats, eq(remoteSchema.messages.chatId, remoteSchema.chats.id))
          .where(and(eq(remoteSchema.chats.appId, appId), eq(remoteSchema.messages.role, "user"), eq(remoteSchema.chats.userId, context.userId)))
          .orderBy(remoteSchema.messages.createdAt) // Get oldest first
          .limit(1);

        if (!firstUserMessage.length) {
          const fallback = generateCuteAppName();
          logger.warn(`[AppNamePro] No user message found for appId=${appId}, using fallback: "${fallback}"`);
          return { title: fallback };
        }

        const userPrompt = firstUserMessage[0].content;
        logger.info(`[AppNamePro] User prompt: "${userPrompt.slice(0, 100)}${userPrompt.length > 100 ? '...' : ''}"`);

        const data = await openRouterCompletion({
          model,
          title: "app-name-pro",
          temperature: 0.5,
          max_tokens: 30,
          messages: [
            {
              role: "system",
              content: getEffectivePrompt("app_name_pro", settings),
            },
            {
              role: "user",
              content: `Suggest a professional app name for this idea: ${userPrompt}`,
            },
          ],
        });

        const rawTitle = data?.choices?.[0]?.message?.content?.trim();
        logger.info(`[AppNamePro] API response: data=${data ? 'present' : 'null'}, choices=${data?.choices?.length ?? 'none'}, content="${rawTitle ?? '<empty>'}", finish_reason=${data?.choices?.[0]?.finish_reason ?? 'unknown'}`);
        if (!rawTitle) {
          const fallback = generateCuteAppName();
          logger.warn(`[AppNamePro] API returned empty name, using fallback: "${fallback}". Full response: ${JSON.stringify(data)?.slice(0, 500)}`);
          return { title: fallback };
        }

        // Sanitize title
        const sanitizedTitle = rawTitle.replace(/^["']|["']$/g, "").slice(0, 40);
        logger.info(`[AppNamePro] Generated: "${sanitizedTitle}" (raw: "${rawTitle}")`);
        return { title: sanitizedTitle };
      } catch (error) {
        const fallback = generateCuteAppName();
        logger.error(`[AppNamePro] Error generating name for appId=${appId}, using fallback: "${fallback}"`, error);
        return { title: fallback };
      }
    },
  );

  createTypedHandler(appContracts.downloadApp, async (_, { appId }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const appInfo = await db.query.apps.findFirst({
      where: and(
        eq(remoteSchema.apps.id, appId),
        eq(remoteSchema.apps.userId, context.userId),
      ),
    });

    if (!appInfo) throw new Error("App not found");
    if (!appInfo.githubOrg || !appInfo.githubRepo) {
      throw new Error(
        "Esta aplicación no tiene un repositorio de GitHub asociado.",
      );
    }

    const settings = readSettings();
    const githubSettings = settings.providerSettings?.github as any;
    const accessToken = githubSettings?.accessToken?.value;

    const resolvedPath = getVibesAppPath(appInfo.path);
    const parentDir = path.dirname(resolvedPath);

    if (!fs.existsSync(parentDir)) {
      await fsPromises.mkdir(parentDir, { recursive: true });
    }

    const url = `https://github.com/${appInfo.githubOrg}/${appInfo.githubRepo}.git`;

    try {
      await gitClone({
        path: resolvedPath,
        url,
        accessToken,
      });
      return { success: true };
    } catch (error: any) {
      logger.error(`Failed to clone app ${appId}:`, error);
      return { success: false, error: error.message };
    }
  });
}
