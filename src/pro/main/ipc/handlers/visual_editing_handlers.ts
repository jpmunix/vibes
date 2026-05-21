import { ipcMain } from "electron";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "path";
import { getRemoteDb } from "../../../../db/remote";
import * as remoteSchema from "../../../../db/remote-schema";
import { and, eq } from "drizzle-orm";
import { createTypedHandler } from "../../../../ipc/handlers/base";
import { visualEditingContracts } from "../../../../ipc/types/visual-editing";
import { getVibesAppPath } from "../../../../paths/paths";
import {
  stylesToTailwind,
  extractClassPrefixes,
} from "../../../../utils/style-utils";
import { gitAdd, gitCommit } from "../../../../ipc/utils/git_utils";
import { readSettings } from "../../../../main/settings";
import { generateAutoCommitMessage } from "../../../../ipc/utils/auto_commit_message";
import { safeJoin } from "@/ipc/utils/path_utils";
import {
  AnalyseComponentParams,
  ApplyVisualEditingChangesParams,
} from "@/ipc/types";
import { ReplaceIconParams } from "@/ipc/types/visual-editing";
import {
  transformContent,
  analyzeComponent,
  replaceIconComponent,
} from "../../utils/visual_editing_utils";
import { normalizePath } from "../../../../../shared/normalizePath";
import log from "electron-log";

const logger = log.scope("visual_editing_handlers");

export function registerVisualEditingHandlers() {
  createTypedHandler(
    visualEditingContracts.applyChanges,
    async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const { appId, changes } = params;
      try {
        if (changes.length === 0) return;

        // Get the app to find its path
        const app = await db.query.apps.findFirst({
          where: and(
            eq(remoteSchema.apps.id, appId),
            eq(remoteSchema.apps.userId, context.userId),
          ),
        });

        if (!app) {
          throw new Error(`App not found: ${appId}`);
        }

        const appPath = getVibesAppPath(app.path);
        const fileChanges = new Map<
          string,
          Map<
            number,
            { classes: string[]; prefixes: string[]; textContent?: string }
          >
        >();

        // Group changes by file and line
        for (const change of changes) {
          logger.debug('[visual-editing] Processing change:', {
            componentId: change.componentId,
            file: change.relativePath,
            line: change.lineNumber,
            styles: change.styles,
          });

          if (!fileChanges.has(change.relativePath)) {
            fileChanges.set(change.relativePath, new Map());
          }
          const tailwindClasses = stylesToTailwind(change.styles);
          const changePrefixes = extractClassPrefixes(tailwindClasses);

          logger.debug('[visual-editing] Generated Tailwind classes:', tailwindClasses);
          logger.debug('[visual-editing] Class prefixes:', changePrefixes);

          fileChanges.get(change.relativePath)!.set(change.lineNumber, {
            classes: tailwindClasses,
            prefixes: changePrefixes,
            ...(change.textContent !== undefined && {
              textContent: change.textContent,
            }),
          });
        }

        // Apply changes to each file
        const modifiedFiles: string[] = [];
        for (const [relativePath, lineChanges] of fileChanges) {
          const normalizedRelativePath = normalizePath(relativePath);
          const filePath = safeJoin(appPath, normalizedRelativePath);
          const content = await fsPromises.readFile(filePath, "utf-8");
          const transformedContent = transformContent(content, lineChanges);

          logger.debug('[visual-editing] Content changed:', transformedContent !== content);

          // Only write if content actually changed
          if (transformedContent !== content) {
            await fsPromises.writeFile(filePath, transformedContent, "utf-8");
            modifiedFiles.push(normalizedRelativePath);
          }
        }

        // Stage and optionally commit all changes
        if (modifiedFiles.length > 0 && fs.existsSync(path.join(appPath, ".git"))) {
          for (const filepath of modifiedFiles) {
            await gitAdd({
              path: appPath,
              filepath,
            });
          }

          const settings = readSettings();
          if (settings.autoApproveChanges) {
            const commitMsg = await generateAutoCommitMessage({
              appPath,
              writtenFiles: modifiedFiles,
              fallbackMessage: `Visual editing: Updated ${modifiedFiles.length} file${modifiedFiles.length > 1 ? "s" : ""}`,
            });

            await gitCommit({
              path: appPath,
              message: commitMsg,
            });
          }
        }
      } catch (error) {
        throw new Error(`Failed to apply visual editing changes: ${error}`);
      }
    },
  );

  createTypedHandler(
    visualEditingContracts.analyzeComponent,
    async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const { appId, componentId } = params;
      try {
        const [filePath, lineStr] = componentId.split(":");
        const line = parseInt(lineStr, 10);

        if (!filePath || isNaN(line)) {
          return {
            isDynamic: false,
            hasStaticText: false,
            elementType: "unknown" as const,
          };
        }

        // Get the app to find its path
        const app = await db.query.apps.findFirst({
          where: and(
            eq(remoteSchema.apps.id, appId),
            eq(remoteSchema.apps.userId, context.userId),
          ),
        });

        if (!app) {
          throw new Error(`App not found: ${appId}`);
        }

        const appPath = getVibesAppPath(app.path);
        const fullPath = safeJoin(appPath, filePath);
        const content = await fsPromises.readFile(fullPath, "utf-8");
        return analyzeComponent(content, line);
      } catch (error) {
        logger.error("Failed to analyze component:", error);
        return {
          isDynamic: false,
          hasStaticText: false,
          elementType: "unknown" as const,
        };
      }
    },
  );

  createTypedHandler(
    visualEditingContracts.replaceIcon,
    async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const { appId, componentId, newIconName } = params;
      try {
        const [filePath, lineStr] = componentId.split(":");
        const line = parseInt(lineStr, 10);

        if (!filePath || isNaN(line)) {
          throw new Error("Invalid component ID format");
        }

        // Get the app to find its path
        const app = await db.query.apps.findFirst({
          where: and(
            eq(remoteSchema.apps.id, appId),
            eq(remoteSchema.apps.userId, context.userId),
          ),
        });

        if (!app) {
          throw new Error(`App not found: ${appId}`);
        }

        const appPath = getVibesAppPath(app.path);
        const fullPath = safeJoin(appPath, filePath);
        const content = await fsPromises.readFile(fullPath, "utf-8");

        const newContent = replaceIconComponent(content, line, newIconName);

        if (newContent !== content) {
          await fsPromises.writeFile(fullPath, newContent, "utf-8");

          await gitAdd({ path: appPath, filepath: filePath });

          const settings = readSettings();
          if (settings.autoApproveChanges) {
            const commitMsg = await generateAutoCommitMessage({
              appPath,
              writtenFiles: [filePath],
              fallbackMessage: `Visual editing: Changed icon to ${newIconName} in ${filePath}`,
            });

            await gitCommit({
              path: appPath,
              message: commitMsg,
            });
          }
        }
      } catch (error) {
        logger.error("Failed to replace icon:", error);
        throw error;
      }
    },
  );

  createTypedHandler(
    visualEditingContracts.quickEdit,
    async (_event, params, context) => {
      const {
        appId,
        componentName,
        relativePath,
        lineNumber,
        prompt,
      } = params;

      try {
        // Resolve the app path
        const db = (await import("../../../../db/remote")).getRemoteDb();
        const remoteSchema = await import("../../../../db/remote-schema");
        const { eq } = await import("drizzle-orm");
        const app = await db.query.apps.findFirst({
          where: eq(remoteSchema.apps.id, appId),
        });
        if (!app) {
          return { success: false, error: "App not found" };
        }
        const { getVibesAppPath } = await import("../../../../paths/paths");
        const appPath = getVibesAppPath(app.path);

        // Delegate to the OpenCode visual-edit subagent
        const { handleVisualQuickEdit } = await import("../../../../ipc/handlers/opencode_adapter");
        const result = await handleVisualQuickEdit({
          appPath,
          componentFile: relativePath,
          componentLine: lineNumber,
          componentName,
          prompt,
        });

        return result;
      } catch (error) {
        logger.error("Failed to process quick edit:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}
