import { IpcMainInvokeEvent } from "electron";
import { readSettings } from "../../main/settings";
import {
  gitMergeAbort,
  gitFetch,
  gitPull,
  gitCreateBranch,
  gitDeleteBranch,
  gitCheckout,
  gitMerge,
  gitCurrentBranch,
  gitListBranches,
  gitListRemoteBranches,
  gitRenameBranch,
  GitStateError,
  GIT_ERROR_CODES,
  isGitMergeInProgress,
  isGitRebaseInProgress,
  getGitUncommittedFilesWithStatus,
  gitAddAll,
  gitAdd,
  gitReset,
  gitResetFile,
  gitCommit,
  gitDiffFile,
  gitLogDetailed,
  gitShowCommitDetail,
  gitResolveMergeOurs,
  gitResolveMergeTheirs,
  gitGetMergeConflicts,
  gitGetConflictFileDiff,
  gitResolveFileOurs,
  gitResolveFileTheirs,
  gitRemoveIndexLock,
  gitDiscardAllChanges,
  gitDiscardFile,
  gitRevertCommit,
} from "../utils/git_utils";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import log from "electron-log";
import { withLock } from "../utils/lock_utils";
import { updateAppGithubRepo, ensureCleanWorkspace } from "./github_handlers";
import { createTypedHandler, HandlerContext } from "./base";
import { githubContracts, gitContracts } from "../types/github";
import { getVibesAppPath } from "../../paths/paths";
import type {
  GitBranchAppIdParams,
  CreateGitBranchParams,
  GitBranchParams,
  RenameGitBranchParams,
  UncommittedFile,
} from "../types/github";
import fs from "node:fs";
import path from "node:path";

const logger = log.scope("git_branch_handlers");

async function handleAbortMerge(
  event: IpcMainInvokeEvent,
  { appId }: GitBranchAppIdParams,
  context: HandlerContext,
): Promise<void> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  await gitMergeAbort({ path: appPath });
}

// --- GitHub Fetch Handler ---
async function handleFetchFromGithub(
  event: IpcMainInvokeEvent,
  { appId }: GitBranchAppIdParams,
  context: HandlerContext,
): Promise<void> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const settings = readSettings();
  const accessToken = settings.githubAccessToken?.value;
  if (!accessToken) {
    throw new Error("Not authenticated with GitHub.");
  }
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app || !app.githubOrg || !app.githubRepo) {
    throw new Error("App is not linked to a GitHub repo.");
  }
  const appPath = getVibesAppPath(app.path);

  await gitFetch({
    path: appPath,
    remote: "origin",
    accessToken,
  });
}

// --- GitHub Branch Handlers ---
async function handleCreateBranch(
  event: IpcMainInvokeEvent,
  { appId, branch, from }: CreateGitBranchParams,
  context: HandlerContext,
): Promise<void> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  // Validate branch name
  if (!branch || branch.length === 0 || branch.length > 255) {
    throw new Error("Branch name must be between 1 and 255 characters");
  }
  if (!/^[a-zA-Z0-9/_.-]+$/.test(branch) || /\.\./.test(branch)) {
    throw new Error("Branch name contains invalid characters");
  }
  if (
    branch.startsWith("-") ||
    branch === "HEAD" ||
    branch.endsWith(".") ||
    branch.endsWith(".lock") ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.includes("@{")
  ) {
    throw new Error("Invalid branch name");
  }
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  await gitCreateBranch({
    path: appPath,
    branch,
    from,
  });
}

async function handleDeleteBranch(
  event: IpcMainInvokeEvent,
  { appId, branch }: GitBranchParams,
  context: HandlerContext,
): Promise<void> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  await gitDeleteBranch({
    path: appPath,
    branch,
  });
}

async function handleSwitchBranch(
  event: IpcMainInvokeEvent,
  { appId, branch }: GitBranchParams,
  context: HandlerContext,
): Promise<void> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  // Check for merge or rebase in progress before attempting to switch
  // This provides structured error codes instead of relying on string matching
  if (isGitMergeInProgress({ path: appPath })) {
    throw GitStateError(
      "Cannot switch branches: merge in progress. Please complete or abort the merge first.",
      GIT_ERROR_CODES.MERGE_IN_PROGRESS,
    );
  }

  if (isGitRebaseInProgress({ path: appPath })) {
    throw GitStateError(
      "Cannot switch branches: rebase in progress. Please complete or abort the rebase first.",
      GIT_ERROR_CODES.REBASE_IN_PROGRESS,
    );
  }

  // Check for uncommitted changes
  await withLock(appId, async () => {
    await ensureCleanWorkspace(appPath, `switching to branch '${branch}'`);
  });
  try {
    await gitCheckout({
      path: appPath,
      ref: branch,
    });
  } catch (checkoutError: any) {
    const errorMessage = checkoutError?.message || "Failed to switch branch.";
    // Check if error is about uncommitted changes (fallback in case check above missed it)
    const lowerMessage = errorMessage.toLowerCase();
    if (
      lowerMessage.includes("local changes") ||
      lowerMessage.includes("would be overwritten") ||
      lowerMessage.includes("please commit or stash")
    ) {
      throw new Error(
        `Failed to switch branch: uncommitted changes detected. ` +
        "Please commit or stash your changes manually and try again.",
      );
    }
    throw checkoutError;
  }

  // Update DB with new branch
  await updateAppGithubRepo({
    appId,
    org: app.githubOrg || undefined,
    repo: app.githubRepo || "",
    branch,
    userId: context.userId,
  });
}

async function handleRenameBranch(
  event: IpcMainInvokeEvent,
  { appId, oldBranch, newBranch }: RenameGitBranchParams,
  context: HandlerContext,
): Promise<void> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  // Check if we're renaming the current branch BEFORE renaming to avoid race conditions
  const currentBranch = await gitCurrentBranch({ path: appPath });
  const isRenamingCurrentBranch = currentBranch === oldBranch;

  await gitRenameBranch({
    path: appPath,
    oldBranch,
    newBranch,
  });

  // Only update DB if we were on oldBranch before renaming
  // (git branch -m renames the current branch if we're on it, so HEAD now points to newBranch)
  if (isRenamingCurrentBranch) {
    await updateAppGithubRepo({
      appId,
      org: app.githubOrg || undefined,
      repo: app.githubRepo || "",
      branch: newBranch,
      userId: context.userId,
    });
  }
}

// Custom error class for merge conflicts
class MergeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeConflictError";
  }
}

async function handleMergeBranch(
  event: IpcMainInvokeEvent,
  { appId, branch }: GitBranchParams,
  context: HandlerContext,
): Promise<void> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  // Check if branch exists locally, if not, check if it's a remote branch
  const localBranches = await gitListBranches({ path: appPath });
  let remoteBranches: string[] = [];
  try {
    remoteBranches = await gitListRemoteBranches({
      path: appPath,
    });
  } catch (error: any) {
    logger.warn(`Failed to list remote branches: ${error.message}`);
    // Continue with empty remote branches list
  }

  let mergeBranchRef = branch;

  // If branch doesn't exist locally but exists remotely, use remote ref
  if (!localBranches.includes(branch) && remoteBranches.includes(branch)) {
    mergeBranchRef = `origin/${branch}`;
  }

  // Check for uncommitted changes
  await withLock(appId, async () => {
    await ensureCleanWorkspace(appPath, `merging branch '${branch}'`);
  });
  try {
    await gitMerge({
      path: appPath,
      branch: mergeBranchRef,
    });
  } catch (mergeError: any) {
    // Convert to MergeConflictError for component compatibility
    if (mergeError?.name === "GitConflictError") {
      throw new MergeConflictError(mergeError.message);
    }

    // Fallback: Check if error is about uncommitted changes
    const errorMessage = mergeError?.message || "Failed to merge branch.";
    const lowerMessage = errorMessage.toLowerCase();
    if (
      lowerMessage.includes("local changes") ||
      lowerMessage.includes("would be overwritten") ||
      lowerMessage.includes("please commit or stash")
    ) {
      throw new Error(
        `Failed to merge branch: uncommitted changes detected. ` +
        "Please commit or stash your changes manually and try again.",
      );
    }

    // Otherwise, throw the original error
    throw mergeError;
  }
}

async function handleListLocalBranches(
  event: IpcMainInvokeEvent,
  { appId }: GitBranchAppIdParams,
  context: HandlerContext,
): Promise<{ branches: string[]; current: string | null }> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  const branches = await gitListBranches({ path: appPath });
  const current = await gitCurrentBranch({ path: appPath });
  return { branches, current: current || null };
}

async function handleListRemoteBranches(
  event: IpcMainInvokeEvent,
  { appId, remote = "origin" }: { appId: number; remote?: string },
  context: HandlerContext,
): Promise<string[]> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  const branches = await gitListRemoteBranches({ path: appPath, remote });
  return branches;
}

async function handleGetUncommittedFiles(
  event: IpcMainInvokeEvent,
  { appId }: GitBranchAppIdParams,
  context: HandlerContext,
): Promise<UncommittedFile[]> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) {
    logger.warn(`[getUncommittedFiles] App not found (transient?): appId=${appId}, userId=${context.userId ?? 'UNDEFINED'}`);
    return [];
  }
  const appPath = getVibesAppPath(app.path);

  return getGitUncommittedFilesWithStatus({ path: appPath });
}

async function handleCommitChanges(
  event: IpcMainInvokeEvent,
  { appId, message, filesToStage }: { appId: number; message: string; filesToStage?: string[] },
  context: HandlerContext,
): Promise<string> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  return withLock(appId, async () => {
    // Safety: remove stale index.lock if it exists.
    // We hold the JS lock, so if the file exists it's from a crashed git process.
    const lockFile = path.join(appPath, ".git", "index.lock");
    if (fs.existsSync(lockFile)) {
      logger.warn(`Removing stale index.lock at ${lockFile}`);
      try {
        fs.unlinkSync(lockFile);
      } catch (e) {
        logger.error(`Failed to remove stale index.lock: ${e}`);
      }
    }

    // Check for merge or rebase in progress
    if (isGitMergeInProgress({ path: appPath })) {
      throw GitStateError(
        "Cannot commit: merge in progress. Please complete or abort the merge first.",
        GIT_ERROR_CODES.MERGE_IN_PROGRESS,
      );
    }

    if (isGitRebaseInProgress({ path: appPath })) {
      throw GitStateError(
        "Cannot commit: rebase in progress. Please complete or abort the rebase first.",
        GIT_ERROR_CODES.REBASE_IN_PROGRESS,
      );
    }

    // Try to generate a better commit message with AI BEFORE staging
    // (gitDiffFile needs unstaged changes to produce a diff)
    let finalMessage = message;
    const isGenericMessage = /^(Actualizar|Añadir|Eliminar|Renombrar)\s+\d+\s+archivo/i.test(message)
      || message === "Actualizar archivos";
    if (isGenericMessage) {
      try {
        const { generateAutoCommitMessage } = await import("../utils/auto_commit_message");
        const uncommittedFiles = await getGitUncommittedFilesWithStatus({ path: appPath });
        finalMessage = await generateAutoCommitMessage({
          appPath,
          writtenFiles: uncommittedFiles.map(f => f.path),
          fallbackMessage: message,
        });
      } catch (e) {
        logger.warn("Failed to generate AI commit message, using original:", e);
      }
    }

    // Selective staging: if filesToStage is provided, stage only those files
    if (filesToStage && filesToStage.length > 0) {
      for (const filepath of filesToStage) {
        await gitAdd({ path: appPath, filepath });
      }
    } else {
      // Stage all changes (default behavior)
      await gitAddAll({ path: appPath });
    }

    // Commit with the final message
    try {
      const commitHash = await gitCommit({ path: appPath, message: finalMessage });
      return commitHash;
    } catch (e: any) {
      if (e.message && e.message.includes("nothing to commit")) {
        logger.log(`Skipped commit creation for app ${appId}: working tree clean.`);
        return "";
      }
      throw e;
    }
  });
}

// --- Git Stage/Unstage Handlers ---
async function handleStageFile(
  _event: IpcMainInvokeEvent,
  { appId, filepath }: { appId: number; filepath: string },
  context: HandlerContext,
): Promise<void> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);
  await gitAdd({ path: appPath, filepath });
}

async function handleUnstageFile(
  _event: IpcMainInvokeEvent,
  { appId, filepath }: { appId: number; filepath: string },
  context: HandlerContext,
): Promise<void> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);
  await gitResetFile({ path: appPath, filepath });
}

async function handleStageAll(
  _event: IpcMainInvokeEvent,
  { appId }: { appId: number },
  context: HandlerContext,
): Promise<void> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);
  await gitAddAll({ path: appPath });
}

async function handleUnstageAll(
  _event: IpcMainInvokeEvent,
  { appId }: { appId: number },
  context: HandlerContext,
): Promise<void> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);
  await gitReset({ path: appPath });
}

async function handleGetFileDiff(
  _event: IpcMainInvokeEvent,
  { appId, filepath }: { appId: number; filepath: string },
  context: HandlerContext,
): Promise<{ additions: number; deletions: number; diff: string }> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);
  return gitDiffFile({ path: appPath, filepath });
}

async function handleGetFileContent(
  _event: IpcMainInvokeEvent,
  { appId, filepath }: { appId: number; filepath: string },
  context: HandlerContext,
): Promise<{ content: string }> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);
  const fullPath = path.join(appPath, filepath);
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    return { content };
  } catch {
    return { content: "" };
  }
}

// --- GitHub Pull Handler ---
async function handlePullFromGithub(
  event: IpcMainInvokeEvent,
  { appId }: GitBranchAppIdParams,
  context: HandlerContext,
): Promise<void> {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const settings = readSettings();
  const accessToken = settings.githubAccessToken?.value;

  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");

  const appPath = getVibesAppPath(app.path);
  const currentBranch = await gitCurrentBranch({ path: appPath });

  // If the app is not linked to GitHub, do a plain git pull using the existing remote
  // (works with any remote: GitHub, GitLab, Gitea, etc.)
  const isLinkedToGithub = !!(app.githubOrg && app.githubRepo);

  try {
    await gitPull({
      path: appPath,
      remote: "origin",
      branch: currentBranch || "main",
      // Only pass the token when actually linked — avoids injecting credentials for non-GitHub remotes
      accessToken: isLinkedToGithub && accessToken ? accessToken : undefined,
    });
  } catch (pullError: any) {
    // If token is required but we don't have one, give a clear error
    if (!accessToken && (pullError?.message || "").toLowerCase().includes("authentication")) {
      throw new Error("Autenticación requerida. Conecta tu cuenta de GitHub en Ajustes.");
    }
    // Check if it's a missing remote branch error
    const errorMessage = pullError?.message || "";
    const isMissingRemoteBranch =
      pullError?.code === "MissingRefError" ||
      (pullError?.code === "NotFoundError" &&
        (errorMessage.includes("remote ref") ||
          errorMessage.includes("remote branch"))) ||
      errorMessage.includes("couldn't find remote ref") ||
      errorMessage.includes("Cannot read properties of null");

    // If the remote branch doesn't exist yet, we can ignore this
    if (!isMissingRemoteBranch) {
      throw pullError;
    } else {
      logger.debug(
        "[GitHub Handler] Remote branch missing during pull, continuing",
        errorMessage,
      );
    }
  }
}

// --- Git Commit History Handlers ---
async function handleGetCommitHistory(
  _event: IpcMainInvokeEvent,
  { appId, limit = 50, offset = 0, branch }: { appId: number; limit?: number; offset?: number; branch?: string },
  context: HandlerContext,
) {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  // Check if it's a git repo
  if (!fs.existsSync(path.join(appPath, ".git"))) {
    return { commits: [], total: 0, hasMore: false };
  }

  return gitLogDetailed({ path: appPath, limit, offset, branch });
}

async function handleGetCommitDetail(
  _event: IpcMainInvokeEvent,
  { appId, commitHash }: { appId: number; commitHash: string },
  context: HandlerContext,
) {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  return gitShowCommitDetail({ path: appPath, commitHash });
}

// --- Merge Conflict Resolution Handlers ---

async function handleGetConflictFiles(
  _event: IpcMainInvokeEvent,
  { appId }: { appId: number },
  context: HandlerContext,
) {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  const mergeInProgress = isGitMergeInProgress({ path: appPath });
  let files: string[] = [];

  if (mergeInProgress) {
    try {
      files = await gitGetMergeConflicts({ path: appPath });
    } catch (e) {
      logger.warn("Failed to get conflict files:", e);
    }
  }

  return { files, mergeInProgress };
}

async function handleResolveMergeOurs(
  _event: IpcMainInvokeEvent,
  { appId }: { appId: number },
  context: HandlerContext,
) {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  return gitResolveMergeOurs({ path: appPath });
}

async function handleResolveMergeTheirs(
  _event: IpcMainInvokeEvent,
  { appId }: { appId: number },
  context: HandlerContext,
) {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  return gitResolveMergeTheirs({ path: appPath });
}

async function handleAbortMergeFromGit(
  _event: IpcMainInvokeEvent,
  { appId }: { appId: number },
  context: HandlerContext,
) {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  await gitMergeAbort({ path: appPath });
}

async function handleGetConflictFileDiff(
  _event: IpcMainInvokeEvent,
  { appId, filepath }: { appId: number; filepath: string },
  context: HandlerContext,
) {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  return gitGetConflictFileDiff({ path: appPath, filepath });
}

async function handleResolveFileOurs(
  _event: IpcMainInvokeEvent,
  { appId, filepath }: { appId: number; filepath: string },
  context: HandlerContext,
) {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  return gitResolveFileOurs({ path: appPath, filepath });
}

async function handleResolveFileTheirs(
  _event: IpcMainInvokeEvent,
  { appId, filepath }: { appId: number; filepath: string },
  context: HandlerContext,
) {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  return gitResolveFileTheirs({ path: appPath, filepath });
}

async function handleRemoveIndexLock(
  _event: IpcMainInvokeEvent,
  { appId }: { appId: number },
  context: HandlerContext,
) {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  return gitRemoveIndexLock({ path: appPath });
}

async function handleDiscardFileChanges(
  _event: IpcMainInvokeEvent,
  { appId, filepath }: { appId: number; filepath: string },
  context: HandlerContext,
) {
  if (!context.userId) throw new Error("Unauthorized");
  
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({
    where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId))
  });

  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  await gitDiscardFile({ path: appPath, filepath });
  return { message: "Cambios descartados" } as any;
}

async function handleDiscardAllChanges(
  _event: IpcMainInvokeEvent,
  { appId }: { appId: number },
  context: HandlerContext,
) {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  return withLock(appId, async () => {
    return gitDiscardAllChanges({ path: appPath });
  });
}

async function handleRevertCommit(
  _event: IpcMainInvokeEvent,
  { appId, commitHash }: { appId: number; commitHash: string },
  context: HandlerContext,
) {
  if (!context.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const app = await db.query.apps.findFirst({ where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)) });
  if (!app) throw new Error("App not found");
  const appPath = getVibesAppPath(app.path);

  return withLock(appId, async () => {
    return gitRevertCommit({ path: appPath, commitHash });
  });
}

// --- Registration ---
export function registerGithubBranchHandlers() {
  createTypedHandler(githubContracts.mergeAbort, handleAbortMerge);
  createTypedHandler(githubContracts.fetch, handleFetchFromGithub);
  createTypedHandler(githubContracts.pull, handlePullFromGithub);
  createTypedHandler(githubContracts.createBranch, handleCreateBranch);
  createTypedHandler(githubContracts.deleteBranch, handleDeleteBranch);
  createTypedHandler(githubContracts.switchBranch, handleSwitchBranch);
  createTypedHandler(githubContracts.renameBranch, handleRenameBranch);
  createTypedHandler(githubContracts.mergeBranch, handleMergeBranch);
  createTypedHandler(
    githubContracts.listLocalBranches,
    handleListLocalBranches,
  );
  createTypedHandler(
    githubContracts.listRemoteBranches,
    handleListRemoteBranches,
  );
  createTypedHandler(
    gitContracts.getUncommittedFiles,
    handleGetUncommittedFiles,
  );
  createTypedHandler(gitContracts.commitChanges, handleCommitChanges);
  createTypedHandler(gitContracts.stageFile, handleStageFile);
  createTypedHandler(gitContracts.unstageFile, handleUnstageFile);
  createTypedHandler(gitContracts.stageAll, handleStageAll);
  createTypedHandler(gitContracts.unstageAll, handleUnstageAll);
  createTypedHandler(gitContracts.getFileDiff, handleGetFileDiff);
  createTypedHandler(gitContracts.getCommitHistory, handleGetCommitHistory);
  createTypedHandler(gitContracts.getCommitDetail, handleGetCommitDetail);
  createTypedHandler(gitContracts.getConflictFiles, handleGetConflictFiles);
  createTypedHandler(gitContracts.resolveMergeOurs, handleResolveMergeOurs);
  createTypedHandler(gitContracts.resolveMergeTheirs, handleResolveMergeTheirs);
  createTypedHandler(gitContracts.abortMerge, handleAbortMergeFromGit);
  createTypedHandler(gitContracts.getConflictFileDiff, handleGetConflictFileDiff);
  createTypedHandler(gitContracts.resolveFileOurs, handleResolveFileOurs);
  createTypedHandler(gitContracts.resolveFileTheirs, handleResolveFileTheirs);
  createTypedHandler(gitContracts.removeIndexLock, handleRemoveIndexLock);
  createTypedHandler(gitContracts.discardFileChanges, handleDiscardFileChanges);
  createTypedHandler(gitContracts.discardAllChanges, handleDiscardAllChanges);
  createTypedHandler(gitContracts.revertCommit, handleRevertCommit);
  createTypedHandler(gitContracts.getFileContent, handleGetFileContent);
}

