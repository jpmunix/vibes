import { getRemoteDb } from "../../db/remote";
import { chats, messages } from "../../db/remote-schema";
import { and, eq } from "drizzle-orm";
import fs from "node:fs";
import { getVibesAppPath } from "../../paths/paths";
import path from "node:path";
import { safeJoin } from "../utils/path_utils";

import log from "electron-log";
import { executeAddDependency, execPromise } from "./executeAddDependency";
import {
  deleteSupabaseFunction,
  deploySupabaseFunction,
  executeSupabaseSql,
} from "../../supabase_admin/supabase_management_client";
import {
  isServerFunction,
  isSharedServerModule,
  deployAllSupabaseFunctions,
  extractFunctionNameFromPath,
} from "../../supabase_admin/supabase_utils";
import { UserSettings } from "../../lib/schemas";
import {
  gitCommit,
  gitAdd,
  gitRemove,
  gitAddAll,
  getGitUncommittedFiles,
} from "../utils/git_utils";
import { readSettings } from "@/main/settings";
import { writeMigrationFile } from "../utils/file_utils";
import { generateAutoCommitMessage } from "../utils/auto_commit_message";
import {
  getWriteTags,
  getRenameTags,
  getDeleteTags,
  getAddDependencyTags,
  getExecuteSqlTags,
  getSearchReplaceTags,
} from "../utils/tag_parser";
import {
  applySearchReplace,
  formatMatchFailureSummary,
} from "../../pro/main/ipc/processors/search_replace_processor";
import { storeDbTimestampAtCurrentVersion } from "../utils/neon_timestamp_utils";

import { FileUploadsState } from "../utils/file_uploads_state";

const readFile = fs.promises.readFile;
const logger = log.scope("response_processor");

/**
 * Sanitize a file path extracted from AI-generated tags.
 * OpenCode sometimes produces absolute paths (e.g. /home/user/GitRepo/project/src/file.ts)
 * that escape the vibes app sandbox. This function converts them to relative paths:
 * 1. If the absolute path contains the app base, extract the relative portion.
 * 2. Otherwise, use only the basename to at least avoid the safety error.
 * Relative paths pass through unchanged.
 */
function sanitizeFilePath(filePath: string, appPath: string): string {
  if (!path.isAbsolute(filePath)) return filePath;

  // Try to find the relative portion — the absolute path might point
  // to the same project just via a different base (e.g. /home/user/GitRepo/project vs /home/user/vibes-apps/project)
  const resolvedApp = path.resolve(appPath);
  const resolvedFile = path.resolve(filePath);

  // Case 1: the path IS inside the app dir (just absolute form)
  if (resolvedFile.startsWith(resolvedApp + path.sep)) {
    return path.relative(resolvedApp, resolvedFile);
  }

  // Case 2: same project name, different base — extract from project root onwards
  // e.g. /home/user/GitRepo/trellito/docs/plan.md → docs/plan.md
  const appDirName = path.basename(resolvedApp);
  const segments = resolvedFile.split(path.sep);
  const projectIdx = segments.indexOf(appDirName);
  if (projectIdx !== -1 && projectIdx < segments.length - 1) {
    const relativePortion = segments.slice(projectIdx + 1).join(path.sep);
    logger.warn(`[sanitizeFilePath] Converted absolute path "${filePath}" → "${relativePortion}"`);
    return relativePortion;
  }

  // Case 3: completely unrelated absolute path — use basename as last resort
  const fallback = path.basename(filePath);
  logger.warn(`[sanitizeFilePath] Absolute path "${filePath}" fully escapes app dir — using basename "${fallback}"`);
  return fallback;
}

interface Output {
  message: string;
  error: unknown;
}

export async function dryRunSearchReplace({
  fullResponse,
  appPath,
}: {
  fullResponse: string;
  appPath: string;
}) {
  const issues: { filePath: string; error: string }[] = [];
  const searchReplaceTags = getSearchReplaceTags(fullResponse);

  // Group tags by file path to handle multi-block edits to the same file correctly
  const tagsByFile = new Map<
    string,
    { path: string; content: string; description?: string }[]
  >();
  for (const tag of searchReplaceTags) {
    const list = tagsByFile.get(tag.path) || [];
    list.push(tag);
    tagsByFile.set(tag.path, list);
  }

  for (const [filePath, fileTags] of tagsByFile.entries()) {
    const fullFilePath = safeJoin(appPath, filePath);
    try {
      if (!fs.existsSync(fullFilePath)) {
        issues.push({
          filePath,
          error: `Search-replace target file does not exist: ${filePath}`,
        });
        continue;
      }

      const original = await readFile(fullFilePath, "utf8");
      // Combine all content blocks for this file
      const combinedContent = fileTags.map((tag) => tag.content).join("\n");
      const result = applySearchReplace(original, combinedContent);

      if (!result.success || typeof result.content !== "string") {
        const diagnosticSummary =
          result.diagnostic && formatMatchFailureSummary(result.diagnostic);
        const baseError = (result.error ?? "unknown").replace(/\.+$/, "");
        const fullerError = `${baseError}.${diagnosticSummary ? ` ${diagnosticSummary}` : ""} Read the latest file and include more surrounding lines before retrying.`;

        issues.push({
          filePath,
          error: fullerError,
        });
        logger.warn(
          `Unable to apply search-replace to file ${filePath} because: ${fullerError}. Original content:\n${original}\n Diff content:\n${combinedContent}`,
        );
        continue;
      }
    } catch (error) {
      issues.push({
        filePath,
        error: error?.toString() ?? "Unknown error",
      });
    }
  }
  return issues;
}

export async function processFullResponseActions(
  fullResponse: string,
  chatId: number,
  {
    chatSummary,
    messageId,
  }: {
    chatSummary: string | undefined;
    messageId: number;
  },
): Promise<{
  updatedFiles?: boolean;
  error?: string;
  extraFiles?: string[];
  extraFilesError?: string;
}> {
  const fileUploadsState = FileUploadsState.getInstance();
  const fileUploadsMap = fileUploadsState.getFileUploadsForChat(chatId);
  fileUploadsState.clear(chatId);
  logger.log("processFullResponseActions for chatId", chatId);
  // Get the app associated with the chat
  const db = getRemoteDb();
  const chatWithApp = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
    with: {
      app: true,
    },
  });
  if (!chatWithApp || !chatWithApp.app) {
    logger.error(`No app found for chat ID: ${chatId}`);
    return {};
  }

  if (
    chatWithApp.app.neonProjectId &&
    chatWithApp.app.neonDevelopmentBranchId
  ) {
    try {
      await storeDbTimestampAtCurrentVersion({
        appId: chatWithApp.app.id,
      });
    } catch (error) {
      logger.error("Error creating Neon branch at current version:", error);
      throw new Error(
        "Could not create Neon branch; database versioning functionality is not working: " +
        error,
      );
    }
  }

  const settings: UserSettings = readSettings();
  const appPath = getVibesAppPath(chatWithApp.app.path);
  const writtenFiles: string[] = [];
  const renamedFiles: string[] = [];
  const deletedFiles: string[] = [];
  let hasChanges = false;
  // Track if any shared modules were modified
  let sharedModulesChanged = false;

  const warnings: Output[] = [];
  const errors: Output[] = [];

  try {
    // Extract all tags
    const rawWriteTags = getWriteTags(fullResponse);
    const rawRenameTags = getRenameTags(fullResponse);
    const rawDeletePaths = getDeleteTags(fullResponse);
    const addDependencyPackages = getAddDependencyTags(fullResponse);
    const executeSqlQueries = chatWithApp.app.supabaseProjectId
      ? getExecuteSqlTags(fullResponse)
      : [];

    // Sanitize all file paths — OpenCode may produce absolute paths that escape the app directory
    const writeTags = rawWriteTags.map(t => ({ ...t, path: sanitizeFilePath(t.path, appPath) }));
    const renameTags = rawRenameTags.map(t => ({
      from: sanitizeFilePath(t.from, appPath),
      to: sanitizeFilePath(t.to, appPath),
    }));
    const deletePaths = rawDeletePaths.map(p => sanitizeFilePath(p, appPath));

    const message = await db.query.messages.findFirst({
      where: and(
        eq(messages.id, messageId),
        eq(messages.role, "assistant"),
        eq(messages.chatId, chatId),
      ),
    });

    if (!message) {
      logger.error(`No message found for ID: ${messageId}`);
      return {};
    }

    // Handle SQL execution tags
    if (executeSqlQueries.length > 0) {
      for (const query of executeSqlQueries) {
        try {
          await executeSupabaseSql({
            supabaseProjectId: chatWithApp.app.supabaseProjectId!,
            query: query.content,
            organizationSlug: chatWithApp.app.supabaseOrganizationSlug ?? null,
          });

          // Only write migration file if SQL execution succeeded
          if (settings.enableSupabaseWriteSqlMigration) {
            try {
              const migrationFilePath = await writeMigrationFile(
                appPath,
                query.content,
                query.description,
              );
              writtenFiles.push(migrationFilePath);
            } catch (error) {
              errors.push({
                message: `Failed to write SQL migration file for: ${query.description}`,
                error: error,
              });
            }
          }
        } catch (error) {
          errors.push({
            message: `Failed to execute SQL query: ${query.content}`,
            error: error,
          });
        }
      }
      logger.log(`Executed ${executeSqlQueries.length} SQL queries`);
    }

    // TODO: Handle add dependency tags
    if (addDependencyPackages.length > 0) {
      try {
        await executeAddDependency({
          packages: addDependencyPackages,
          message: message as any,
          appPath,
        });
      } catch (error) {
        errors.push({
          message: `Failed to add dependencies: ${addDependencyPackages.join(", ")}`,
          error: error,
        });
      }
      writtenFiles.push("package.json");
      const pnpmFilename = "pnpm-lock.yaml";
      if (fs.existsSync(safeJoin(appPath, pnpmFilename))) {
        writtenFiles.push(pnpmFilename);
      }
      const packageLockFilename = "package-lock.json";
      if (fs.existsSync(safeJoin(appPath, packageLockFilename))) {
        writtenFiles.push(packageLockFilename);
      }
    }

    //////////////////////
    // File operations //
    // Do it in this order:
    // 1. Deletes
    // 2. Renames
    // 3. Writes
    //
    // Why?
    // - Deleting first avoids path conflicts before the other operations.
    // - LLMs like to rename and then edit the same file.
    //////////////////////

    // Process all file deletions
    for (const filePath of deletePaths) {
      const fullFilePath = safeJoin(appPath, filePath);

      // Track if this is a shared module
      if (isSharedServerModule(filePath)) {
        sharedModulesChanged = true;
      }

      // Delete the file if it exists
      if (fs.existsSync(fullFilePath)) {
        if (fs.lstatSync(fullFilePath).isDirectory()) {
          fs.rmdirSync(fullFilePath, { recursive: true });
        } else {
          fs.unlinkSync(fullFilePath);
        }
        logger.log(`Successfully deleted file: ${fullFilePath}`);
        deletedFiles.push(filePath);

        // Remove the file from git
        try {
          await gitRemove({ path: appPath, filepath: filePath });
        } catch (error) {
          logger.warn(`Failed to git remove deleted file ${filePath}:`, error);
          // Continue even if remove fails as the file was still deleted
        }
      } else {
        logger.warn(`File to delete does not exist: ${fullFilePath}`);
      }
      // Only delete individual functions, not shared modules
      if (isServerFunction(filePath)) {
        try {
          await deleteSupabaseFunction({
            supabaseProjectId: chatWithApp.app.supabaseProjectId!,
            functionName: extractFunctionNameFromPath(filePath),
            organizationSlug: chatWithApp.app.supabaseOrganizationSlug ?? null,
          });
        } catch (error) {
          errors.push({
            message: `Failed to delete Supabase function: ${filePath}`,
            error: error,
          });
        }
      }
    }

    // Process all file renames
    for (const tag of renameTags) {
      const fromPath = safeJoin(appPath, tag.from);
      const toPath = safeJoin(appPath, tag.to);

      // Track if this involves shared modules
      if (isSharedServerModule(tag.from) || isSharedServerModule(tag.to)) {
        sharedModulesChanged = true;
      }

      // Ensure target directory exists
      const dirPath = path.dirname(toPath);
      fs.mkdirSync(dirPath, { recursive: true });

      // Rename the file
      if (fs.existsSync(fromPath)) {
        fs.renameSync(fromPath, toPath);
        logger.log(`Successfully renamed file: ${fromPath} -> ${toPath}`);
        renamedFiles.push(tag.to);

        // Add the new file and remove the old one from git
        await gitAdd({ path: appPath, filepath: tag.to });
        try {
          await gitRemove({ path: appPath, filepath: tag.from });
        } catch (error) {
          logger.warn(`Failed to git remove old file ${tag.from}:`, error);
          // Continue even if remove fails as the file was still renamed
        }
      } else {
        logger.warn(`Source file for rename does not exist: ${fromPath}`);
      }
      // Only handle individual functions, not shared modules
      if (isServerFunction(tag.from)) {
        try {
          await deleteSupabaseFunction({
            supabaseProjectId: chatWithApp.app.supabaseProjectId!,
            functionName: extractFunctionNameFromPath(tag.from),
            organizationSlug: chatWithApp.app.supabaseOrganizationSlug ?? null,
          });
        } catch (error) {
          warnings.push({
            message: `Failed to delete Supabase function: ${tag.from} as part of renaming ${tag.from} to ${tag.to}`,
            error: error,
          });
        }
      }
      // Deploy renamed function (skip if shared modules changed - will be handled later)
      if (isServerFunction(tag.to) && !sharedModulesChanged) {
        try {
          await deploySupabaseFunction({
            supabaseProjectId: chatWithApp.app.supabaseProjectId!,
            functionName: extractFunctionNameFromPath(tag.to),
            appPath,
            organizationSlug: chatWithApp.app.supabaseOrganizationSlug ?? null,
          });
        } catch (error) {
          errors.push({
            message: `Failed to deploy Supabase function: ${tag.to} as part of renaming ${tag.from} to ${tag.to}`,
            error: error,
          });
        }
      }
    }

    // Process all search-replace edits
    const rawSearchReplaceTags = getSearchReplaceTags(fullResponse);
    const searchReplaceTags = rawSearchReplaceTags.map(t => ({ ...t, path: sanitizeFilePath(t.path, appPath) }));
    // Group tags by file path
    const srTagsByFile = new Map<
      string,
      { path: string; content: string; description?: string }[]
    >();
    for (const tag of searchReplaceTags) {
      const list = srTagsByFile.get(tag.path) || [];
      list.push(tag);
      srTagsByFile.set(tag.path, list);
    }

    for (const [filePath, fileTags] of srTagsByFile.entries()) {
      const fullFilePath = safeJoin(appPath, filePath);

      // Track if this is a shared module
      if (isSharedServerModule(filePath)) {
        sharedModulesChanged = true;
      }

      try {
        if (!fs.existsSync(fullFilePath)) {
          // Do not show warning to user because we already attempt to do a <vibes-write> tag to fix it.
          logger.warn(`Search-replace target file does not exist: ${filePath}`);
          continue;
        }
        const original = await readFile(fullFilePath, "utf8");
        // Combine all blocks for this file
        const combinedContent = fileTags.map((tag) => tag.content).join("\n");
        const result = applySearchReplace(original, combinedContent);

        if (!result.success || typeof result.content !== "string") {
          // Do not show warning to user because we already attempt to do a <vibes-write> and/or a subsequent <vibes-search-replace> tag to fix it.
          logger.warn(
            `Failed to apply search-replace to ${filePath}: ${result.error ?? "unknown"}`,
          );
          continue;
        }
        // Write modified content
        fs.writeFileSync(fullFilePath, result.content);
        writtenFiles.push(filePath);

        // If server function (not shared), redeploy (skip if shared modules changed)
        if (isServerFunction(filePath) && !sharedModulesChanged) {
          try {
            await deploySupabaseFunction({
              supabaseProjectId: chatWithApp.app.supabaseProjectId!,
              functionName: extractFunctionNameFromPath(filePath),
              appPath,
              organizationSlug:
                chatWithApp.app.supabaseOrganizationSlug ?? null,
            });
          } catch (error) {
            errors.push({
              message: `Failed to deploy Supabase function after search-replace: ${filePath}`,
              error: error,
            });
          }
        }
      } catch (error) {
        errors.push({
          message: `Error applying search-replace to ${filePath}`,
          error: error,
        });
      }
    }

    // Process all file writes
    for (const tag of writeTags) {
      const filePath = tag.path;
      let content: string | Buffer = tag.content;
      const fullFilePath = safeJoin(appPath, filePath);

      // Track if this is a shared module
      if (isSharedServerModule(filePath)) {
        sharedModulesChanged = true;
      }

      // Check if content (stripped of whitespace) exactly matches a file ID and replace with actual file content
      if (fileUploadsMap) {
        const trimmedContent = tag.content.trim();
        const fileInfo = fileUploadsMap.get(trimmedContent);
        if (fileInfo) {
          try {
            const fileContent = await readFile(fileInfo.filePath);
            content = fileContent;
            logger.log(
              `Replaced file ID ${trimmedContent} with content from ${fileInfo.originalName}`,
            );
          } catch (error) {
            logger.error(
              `Failed to read uploaded file ${fileInfo.originalName}:`,
              error,
            );
            errors.push({
              message: `Failed to read uploaded file: ${fileInfo.originalName}`,
              error: error,
            });
          }
        }
      }

      // Ensure directory exists
      const dirPath = path.dirname(fullFilePath);
      fs.mkdirSync(dirPath, { recursive: true });

      // Write file content
      fs.writeFileSync(fullFilePath, content);
      logger.log(`Successfully wrote file: ${fullFilePath}`);
      writtenFiles.push(filePath);
      // Deploy individual function (skip if shared modules changed - will be handled later)
      if (
        isServerFunction(filePath) &&
        typeof content === "string" &&
        !sharedModulesChanged
      ) {
        try {
          await deploySupabaseFunction({
            supabaseProjectId: chatWithApp.app.supabaseProjectId!,
            functionName: extractFunctionNameFromPath(filePath),
            appPath,
            organizationSlug: chatWithApp.app.supabaseOrganizationSlug ?? null,
          });
        } catch (error) {
          errors.push({
            message: `Failed to deploy Supabase function: ${filePath}`,
            error: error,
          });
        }
      }
    }

    // If shared modules changed, redeploy all functions
    if (sharedModulesChanged && chatWithApp.app.supabaseProjectId) {
      try {
        logger.info(
          "Shared modules changed, redeploying all Supabase functions",
        );
        const settings = readSettings();
        const deployErrors = await deployAllSupabaseFunctions({
          appPath,
          supabaseProjectId: chatWithApp.app.supabaseProjectId,
          supabaseOrganizationSlug:
            chatWithApp.app.supabaseOrganizationSlug ?? null,
          skipPruneEdgeFunctions: settings.skipPruneEdgeFunctions ?? false,
        });
        if (deployErrors.length > 0) {
          for (const err of deployErrors) {
            errors.push({
              message:
                "Failed to deploy Supabase function after shared module change",
              error: err,
            });
          }
        }
      } catch (error) {
        errors.push({
          message:
            "Failed to redeploy all Supabase functions after shared module change",
          error: error,
        });
      }
    }

    // If we have any file changes, commit them all at once
    hasChanges =
      writtenFiles.length > 0 ||
      renamedFiles.length > 0 ||
      deletedFiles.length > 0 ||
      addDependencyPackages.length > 0;

    let uncommittedFiles: string[] = [];
    let extraFilesError: string | undefined;

    if (hasChanges) {
      // If package.json was modified, ensure lockfiles are up to date before staging
      if (writtenFiles.includes("package.json")) {
        try {
          logger.info(
            `Detected changes to package.json in ${appPath}. Running install to update lockfiles...`,
          );
          // Use npm exclusively
          try {
            logger.info(`Running npm install to update lockfiles in ${appPath}...`);
            await execPromise("npm install --legacy-peer-deps", {
              cwd: appPath,
              timeout: 300000,
            });

            // Always ensure pnpm-lock.yaml is removed to avoid Vercel deployment issues
            const pnpmLockPath = safeJoin(appPath, "pnpm-lock.yaml");
            if (fs.existsSync(pnpmLockPath)) {
              logger.info("Removing pnpm-lock.yaml to ensure npm-only project");
              fs.unlinkSync(pnpmLockPath);
              deletedFiles.push("pnpm-lock.yaml");
            }
          } catch (error) {
            logger.error("Failed to update lockfiles with npm:", error);
          }

          // Check which lockfiles were created/updated and add them to writtenFiles if not already there
          const possibleLockfiles = [
            "pnpm-lock.yaml",
            "package-lock.json",
            "yarn.lock",
          ];
          for (const lockfile of possibleLockfiles) {
            if (
              fs.existsSync(safeJoin(appPath, lockfile)) &&
              !writtenFiles.includes(lockfile)
            ) {
              writtenFiles.push(lockfile);
            }
          }
        } catch (error) {
          logger.error(
            "Failed to update lockfiles after package.json modification:",
            error,
          );
        }
      }

      // Stage all written files
      for (const file of writtenFiles) {
        await gitAdd({ path: appPath, filepath: file });
      }

      // Only auto-commit when autoApproveChanges is enabled.
      // When disabled, the user retains full manual control over commits
      // (what files to include, what message to use).
      if (settings.autoApproveChanges) {
        // Create commit with AI-generated descriptive message
        const fallbackChanges = [];
        if (writtenFiles.length > 0)
          fallbackChanges.push(`wrote ${writtenFiles.length} file(s)`);
        if (renamedFiles.length > 0)
          fallbackChanges.push(`renamed ${renamedFiles.length} file(s)`);
        if (deletedFiles.length > 0)
          fallbackChanges.push(`deleted ${deletedFiles.length} file(s)`);
        if (addDependencyPackages.length > 0)
          fallbackChanges.push(
            `added ${addDependencyPackages.join(", ")} package(s)`,
          );
        if (executeSqlQueries.length > 0)
          fallbackChanges.push(`executed ${executeSqlQueries.length} SQL queries`);

        const fallbackMessage = chatSummary
          ? `[vibes] ${chatSummary}`
          : `[vibes] ${fallbackChanges.join(", ")}`;

        const message = await generateAutoCommitMessage({
          appPath,
          writtenFiles,
          deletedFiles,
          renamedFiles,
          fallbackMessage,
        });

        let commitHash = await gitCommit({
          path: appPath,
          message,
        });
        logger.log(`Successfully committed changes: ${fallbackChanges.join(", ")}`);

        // Check for any uncommitted changes after the commit
        uncommittedFiles = await getGitUncommittedFiles({ path: appPath });

        if (uncommittedFiles.length > 0) {
          // Stage all changes
          await gitAddAll({ path: appPath });
          try {
            commitHash = await gitCommit({
              path: appPath,
              message: message + " + extra files edited outside of Vibes",
              amend: true,
            });
            logger.log(
              `Amend commit with changes outside of vibes: ${uncommittedFiles.join(", ")}`,
            );
          } catch (error) {
            // Just log, but don't throw an error because the user can still
            // commit these changes outside of Vibes if needed.
            logger.error(
              `Failed to commit changes outside of vibes: ${uncommittedFiles.join(", ")}`,
            );
            extraFilesError = (error as any).toString();
          }
        }

        // Save the commit hash to the message
        await db
          .update(messages)
          .set({
            commitHash: commitHash,
          })
          .where(eq(messages.id, messageId));
      } else {
        logger.log(
          `[autoApproveChanges=off] Staged ${writtenFiles.length} written, ${renamedFiles.length} renamed, ${deletedFiles.length} deleted file(s) — skipping auto-commit, user will commit manually.`,
        );
      }
    }
    logger.log("mark as approved: hasChanges", hasChanges);
    // Update the message to approved
    await db
      .update(messages)
      .set({
        approvalState: "approved",
      })
      .where(eq(messages.id, messageId));

    return {
      updatedFiles: hasChanges,
      extraFiles: uncommittedFiles.length > 0 ? uncommittedFiles : undefined,
      extraFilesError,
    };
  } catch (error: unknown) {
    logger.error("Error processing files:", error);
    return { error: (error as any).toString() };
  } finally {
    const appendedContent = `
    ${warnings
        .map(
          (warning) =>
            `<vibes-output type="warning" message="${warning.message}">${warning.error}</vibes-output>`,
        )
        .join("\n")}
    ${errors
        .map(
          (error) =>
            `<vibes-output type="error" message="${error.message}">${error.error}</vibes-output>`,
        )
        .join("\n")}
    `;
    if (appendedContent.length > 0) {
      await db
        .update(messages)
        .set({
          content: fullResponse + "\n\n" + appendedContent,
        })
        .where(eq(messages.id, messageId));
    }
  }
}
