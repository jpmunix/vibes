import { z } from "zod";
import {
  defineContract,
  defineEvent,
  createClient,
  createEventClient,
} from "../contracts/core";
import { AppSchema } from "./app";

// =============================================================================
// GitHub Schemas
// =============================================================================

export const GitHubRepoSchema = z.object({
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
});

export type GithubRepository = z.infer<typeof GitHubRepoSchema>;

export const GitHubBranchSchema = z.object({
  name: z.string(),
  commit: z.object({ sha: z.string() }),
});

export const GitHubCollaboratorSchema = z.object({
  login: z.string(),
  avatar_url: z.string(),
  permissions: z.any().optional(),
});

export const GitBranchAppIdParamsSchema = z.object({
  appId: z.number(),
});

export const GitBranchParamsSchema = z.object({
  appId: z.number(),
  branch: z.string(),
});

export const CreateGitBranchParamsSchema = z.object({
  appId: z.number(),
  branch: z.string(),
  from: z.string().optional(),
});

export const RenameGitBranchParamsSchema = z.object({
  appId: z.number(),
  oldBranch: z.string(),
  newBranch: z.string(),
});

export const ListRemoteGitBranchesParamsSchema = z.object({
  appId: z.number(),
  remote: z.string().optional(),
});

export const CommitChangesParamsSchema = z.object({
  appId: z.number(),
  message: z.string(),
  filesToStage: z.array(z.string()).optional(),
});

export const UncommittedFileSchema = z.object({
  path: z.string(),
  status: z.enum(["added", "modified", "deleted", "renamed"]),
});

export const GithubSyncOptionsSchema = z.object({
  force: z.boolean().optional(),
  forceWithLease: z.boolean().optional(),
  commitMessage: z.string().optional(),
});

export const GitStateSchema = z.object({
  mergeInProgress: z.boolean(),
  rebaseInProgress: z.boolean(),
  ahead: z.number().optional(),
  hasRemote: z.boolean().optional(),
});

export const GitDiffFileSchema = z.object({
  path: z.string(),
  status: z.enum(["added", "modified", "deleted", "renamed"]),
  additions: z.number(),
  deletions: z.number(),
  diff: z.string(),
});

export const GitCommitSchema = z.object({
  hash: z.string(),
  message: z.string(),
  author: z.string(),
  date: z.string(),
  shortHash: z.string(),
});

export const CommitHistoryFileSchema = z.object({
  path: z.string(),
  status: z.enum(["added", "modified", "deleted", "renamed", "unknown"]),
});

export const CommitHistoryEntrySchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  message: z.string(),
  author: z.string(),
  email: z.string(),
  date: z.string(), // ISO string
  timestamp: z.number(),
  filesChanged: z.number(),
  insertions: z.number(),
  deletions: z.number(),
  files: z.array(CommitHistoryFileSchema),
  branches: z.array(z.string()).optional(),
});

export const GitPreviewSchema = z.object({
  uncommittedFiles: z.array(GitDiffFileSchema),
  localCommits: z.array(GitCommitSchema),
  totalAdditions: z.number(),
  totalDeletions: z.number(),
  suggestedSquashMessage: z.string().optional(),
});

export const LocalBranchesResultSchema = z.object({
  branches: z.array(z.string()),
  current: z.string().nullable(),
});

export const RepoAvailabilitySchema = z.object({
  available: z.boolean(),
  error: z.string().optional(),
});

export const CloneRepoParamsSchema = z.object({
  url: z.string(),
  appName: z.string().optional(),
  installCommand: z.string().optional(),
  startCommand: z.string().optional(),
});

export const CloneRepoResultSchema = z.union([
  z.object({
    app: AppSchema,
    hasAiRules: z.boolean(),
  }),
  z.object({
    error: z.string(),
  }),
]);

// GitHub Device Flow schemas
export const GitHubDeviceFlowUpdateSchema = z.object({
  userCode: z.string().optional(),
  verificationUri: z.string().optional(),
  message: z.string().optional(),
});

export const GitHubDeviceFlowSuccessSchema = z.object({
  message: z.string().optional(),
});

export const GitHubDeviceFlowErrorSchema = z.object({
  error: z.string(),
});

// =============================================================================
// GitHub Contracts
// =============================================================================

export const githubContracts = {
  startFlow: defineContract({
    channel: "github:start-flow",
    input: z.object({ appId: z.number().nullable() }),
    output: z.void(),
  }),

  listRepos: defineContract({
    channel: "github:list-repos",
    input: z.void(),
    output: z.array(GitHubRepoSchema),
  }),

  getRepoBranches: defineContract({
    channel: "github:get-repo-branches",
    input: z.object({ owner: z.string(), repo: z.string() }),
    output: z.array(GitHubBranchSchema),
  }),

  isRepoAvailable: defineContract({
    channel: "github:is-repo-available",
    input: z.object({ org: z.string(), repo: z.string() }),
    output: RepoAvailabilitySchema,
  }),

  createRepo: defineContract({
    channel: "github:create-repo",
    input: z.object({
      org: z.string(),
      repo: z.string(),
      appId: z.number(),
      branch: z.string().optional(),
    }),
    output: z.void(),
  }),

  connectExistingRepo: defineContract({
    channel: "github:connect-existing-repo",
    input: z.object({
      owner: z.string(),
      repo: z.string(),
      branch: z.string(),
      appId: z.number(),
    }),
    output: z.void(),
  }),

  push: defineContract({
    channel: "github:push",
    input: z.object({
      appId: z.number(),
      force: z.boolean().optional(),
      forceWithLease: z.boolean().optional(),
      commitMessage: z.string().optional(),
    }),
    output: z.void(),
  }),

  fetch: defineContract({
    channel: "github:fetch",
    input: GitBranchAppIdParamsSchema,
    output: z.void(),
  }),

  pull: defineContract({
    channel: "github:pull",
    input: GitBranchAppIdParamsSchema,
    output: z.void(),
  }),

  rebase: defineContract({
    channel: "github:rebase",
    input: z.object({ appId: z.number() }),
    output: z.void(),
  }),

  rebaseAbort: defineContract({
    channel: "github:rebase-abort",
    input: z.object({ appId: z.number() }),
    output: z.void(),
  }),

  mergeAbort: defineContract({
    channel: "github:merge-abort",
    input: GitBranchAppIdParamsSchema,
    output: z.void(),
  }),

  rebaseContinue: defineContract({
    channel: "github:rebase-continue",
    input: z.object({ appId: z.number() }),
    output: z.void(),
  }),

  listLocalBranches: defineContract({
    channel: "github:list-local-branches",
    input: GitBranchAppIdParamsSchema,
    output: LocalBranchesResultSchema,
  }),

  listRemoteBranches: defineContract({
    channel: "github:list-remote-branches",
    input: ListRemoteGitBranchesParamsSchema,
    output: z.array(z.string()),
  }),

  createBranch: defineContract({
    channel: "github:create-branch",
    input: CreateGitBranchParamsSchema,
    output: z.void(),
  }),

  switchBranch: defineContract({
    channel: "github:switch-branch",
    input: GitBranchParamsSchema,
    output: z.void(),
  }),

  deleteBranch: defineContract({
    channel: "github:delete-branch",
    input: GitBranchParamsSchema,
    output: z.void(),
  }),

  renameBranch: defineContract({
    channel: "github:rename-branch",
    input: RenameGitBranchParamsSchema,
    output: z.void(),
  }),

  mergeBranch: defineContract({
    channel: "github:merge-branch",
    input: GitBranchParamsSchema,
    output: z.void(),
  }),

  getConflicts: defineContract({
    channel: "github:get-conflicts",
    input: z.object({ appId: z.number() }),
    output: z.array(z.string()),
  }),

  getGitState: defineContract({
    channel: "github:get-git-state",
    input: z.object({ appId: z.number() }),
    output: GitStateSchema,
  }),

  disconnect: defineContract({
    channel: "github:disconnect",
    input: z.object({ appId: z.number() }),
    output: z.void(),
  }),

  listCollaborators: defineContract({
    channel: "github:list-collaborators",
    input: z.object({ appId: z.number() }),
    output: z.array(GitHubCollaboratorSchema),
  }),

  inviteCollaborator: defineContract({
    channel: "github:invite-collaborator",
    input: z.object({ appId: z.number(), username: z.string() }),
    output: z.void(),
  }),

  removeCollaborator: defineContract({
    channel: "github:remove-collaborator",
    input: z.object({ appId: z.number(), username: z.string() }),
    output: z.void(),
  }),

  cloneRepoFromUrl: defineContract({
    channel: "github:clone-repo-from-url",
    input: CloneRepoParamsSchema,
    output: CloneRepoResultSchema,
  }),

  getPreview: defineContract({
    channel: "github:get-preview",
    input: z.object({ appId: z.number() }),
    output: GitPreviewSchema,
  }),

  generateCommitMessage: defineContract({
    channel: "github:generate-commit-message",
    input: z.object({ appId: z.number() }),
    output: z.object({ message: z.string() }),
  }),

  generateSquashMessage: defineContract({
    channel: "github:generate-squash-message",
    input: z.object({ appId: z.number(), aheadCount: z.number() }),
    output: z.object({ message: z.string() }),
  }),
} as const;

// Git contracts (non-GitHub specific)
export const gitContracts = {
  getUncommittedFiles: defineContract({
    channel: "git:get-uncommitted-files",
    input: GitBranchAppIdParamsSchema,
    output: z.array(UncommittedFileSchema),
  }),

  commitChanges: defineContract({
    channel: "git:commit-changes",
    input: CommitChangesParamsSchema,
    output: z.string(), // Returns commit hash
  }),

  stageFile: defineContract({
    channel: "git:stage-file",
    input: z.object({ appId: z.number(), filepath: z.string() }),
    output: z.void(),
  }),

  unstageFile: defineContract({
    channel: "git:unstage-file",
    input: z.object({ appId: z.number(), filepath: z.string() }),
    output: z.void(),
  }),

  stageAll: defineContract({
    channel: "git:stage-all",
    input: z.object({ appId: z.number() }),
    output: z.void(),
  }),

  unstageAll: defineContract({
    channel: "git:unstage-all",
    input: z.object({ appId: z.number() }),
    output: z.void(),
  }),

  getFileDiff: defineContract({
    channel: "git:get-file-diff",
    input: z.object({ appId: z.number(), filepath: z.string() }),
    output: z.object({
      additions: z.number(),
      deletions: z.number(),
      diff: z.string(),
    }),
  }),

  getCommitHistory: defineContract({
    channel: "git:get-commit-history",
    input: z.object({
      appId: z.number(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      branch: z.string().optional(),
    }),
    output: z.object({
      commits: z.array(CommitHistoryEntrySchema),
      total: z.number(),
      hasMore: z.boolean(),
    }),
  }),

  getCommitDetail: defineContract({
    channel: "git:get-commit-detail",
    input: z.object({
      appId: z.number(),
      commitHash: z.string(),
    }),
    output: z.object({
      hash: z.string(),
      shortHash: z.string(),
      message: z.string(),
      author: z.string(),
      email: z.string(),
      date: z.string(),
      timestamp: z.number(),
      filesChanged: z.number(),
      insertions: z.number(),
      deletions: z.number(),
      files: z.array(CommitHistoryFileSchema),
      diff: z.string(),
    }),
  }),

  getConflictFiles: defineContract({
    channel: "git:get-conflict-files",
    input: z.object({ appId: z.number() }),
    output: z.object({
      files: z.array(z.string()),
      mergeInProgress: z.boolean(),
    }),
  }),

  resolveMergeOurs: defineContract({
    channel: "git:resolve-merge-ours",
    input: z.object({ appId: z.number() }),
    output: z.object({ resolved: z.boolean(), message: z.string() }),
  }),

  resolveMergeTheirs: defineContract({
    channel: "git:resolve-merge-theirs",
    input: z.object({ appId: z.number() }),
    output: z.object({ resolved: z.boolean(), message: z.string() }),
  }),

  abortMerge: defineContract({
    channel: "git:abort-merge",
    input: z.object({ appId: z.number() }),
    output: z.void(),
  }),

  getConflictFileDiff: defineContract({
    channel: "git:get-conflict-file-diff",
    input: z.object({ appId: z.number(), filepath: z.string() }),
    output: z.object({
      diff: z.string(),
      hasConflictMarkers: z.boolean(),
    }),
  }),

  resolveFileOurs: defineContract({
    channel: "git:resolve-file-ours",
    input: z.object({ appId: z.number(), filepath: z.string() }),
    output: z.object({ resolved: z.boolean(), message: z.string() }),
  }),

  resolveFileTheirs: defineContract({
    channel: "git:resolve-file-theirs",
    input: z.object({ appId: z.number(), filepath: z.string() }),
    output: z.object({ resolved: z.boolean(), message: z.string() }),
  }),

  removeIndexLock: defineContract({
    channel: "git:remove-index-lock",
    input: z.object({ appId: z.number() }),
    output: z.object({ removed: z.boolean(), message: z.string() }),
  }),

  discardFileChanges: defineContract({
    channel: "git:discard-file-changes",
    input: z.object({ appId: z.number(), filepath: z.string() }),
    output: z.object({ message: z.string() }),
  }),

  discardAllChanges: defineContract({
    channel: "git:discard-all-changes",
    input: z.object({ appId: z.number() }),
    output: z.object({ message: z.string() }),
  }),

  revertCommit: defineContract({
    channel: "git:revert-commit",
    input: z.object({ appId: z.number(), commitHash: z.string() }),
    output: z.object({ success: z.boolean(), message: z.string() }),
  }),

  getFileContent: defineContract({
    channel: "git:get-file-content",
    input: z.object({ appId: z.number(), filepath: z.string() }),
    output: z.object({ content: z.string() }),
  }),
} as const;

// =============================================================================
// GitHub Event Contracts
// =============================================================================

export const githubEvents = {
  flowUpdate: defineEvent({
    channel: "github:flow-update",
    payload: GitHubDeviceFlowUpdateSchema,
  }),

  flowSuccess: defineEvent({
    channel: "github:flow-success",
    payload: GitHubDeviceFlowSuccessSchema,
  }),

  flowError: defineEvent({
    channel: "github:flow-error",
    payload: GitHubDeviceFlowErrorSchema,
  }),
} as const;

// =============================================================================
// GitHub Clients
// =============================================================================

export const githubClient = createClient(githubContracts);
export const gitClient = createClient(gitContracts);
export const githubEventClient = createEventClient(githubEvents);

// =============================================================================
// Type Exports
// =============================================================================

export type GitBranchAppIdParams = z.infer<typeof GitBranchAppIdParamsSchema>;
export type GitBranchParams = z.infer<typeof GitBranchParamsSchema>;
export type CreateGitBranchParams = z.infer<typeof CreateGitBranchParamsSchema>;
export type RenameGitBranchParams = z.infer<typeof RenameGitBranchParamsSchema>;
export type ListRemoteGitBranchesParams = z.infer<
  typeof ListRemoteGitBranchesParamsSchema
>;
export type CommitChangesParams = z.infer<typeof CommitChangesParamsSchema>;
export type UncommittedFile = z.infer<typeof UncommittedFileSchema>;
export type UncommittedFileStatus = UncommittedFile["status"];
export type GithubSyncOptions = z.infer<typeof GithubSyncOptionsSchema>;
export type CloneRepoParams = z.infer<typeof CloneRepoParamsSchema>;
export type CloneRepoResult = z.infer<typeof CloneRepoResultSchema>;
export type GitDiffFile = z.infer<typeof GitDiffFileSchema>;
export type GitCommit = z.infer<typeof GitCommitSchema>;
export type GitPreview = z.infer<typeof GitPreviewSchema>;
export type CommitHistoryEntry = z.infer<typeof CommitHistoryEntrySchema>;
export type CommitHistoryFile = z.infer<typeof CommitHistoryFileSchema>;
