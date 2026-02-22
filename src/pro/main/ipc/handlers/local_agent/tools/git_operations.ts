/**
 * git_operations — Agent tool for Git version control operations.
 *
 * Provides the agent with the ability to inspect repository state, view diffs,
 * browse commit history, create commits, manage branches, and handle stashes.
 */

import { z } from "zod";
import {
    type ToolDefinition,
    type AgentContext,
    type ToolResult,
    ToolError,
    escapeXmlAttr,
} from "./types";
import {
    getGitUncommittedFilesWithStatus,
    gitDiff,
    gitDiffFile,
    gitLogDetailed,
    gitShowCommitDetail,
    gitCurrentBranch,
    gitListBranches,
    gitCommit,
    gitAddAll,
    gitCreateBranch,
    gitCheckout,
    gitStash,
    gitStashPop,
    gitStashList,
    gitDiscardFile,
} from "@/ipc/utils/git_utils";

// ============================================================================
// Schema: Flat object with operation enum (OpenAI strict mode compatible)
// z.discriminatedUnion produces `type: ["object"]` which OpenAI rejects.
// ============================================================================

const gitOperationsSchema = z.object({
    operation: z.enum([
        "status", "diff", "diff_file", "log", "show_commit",
        "current_branch", "list_branches", "commit", "create_branch",
        "checkout", "stash_save", "stash_pop", "stash_list", "revert_file",
    ]).describe(`The git operation to perform:
- "status": Show working tree status (modified, added, deleted files)
- "diff": Show working directory or staged diff
- "diff_file": Show diff for a specific file
- "log": View commit history
- "show_commit": Inspect a specific commit's details and diff
- "current_branch": Show the current branch name
- "list_branches": List all branches
- "commit": Stage all changes and create a commit
- "create_branch": Create a new branch
- "checkout": Switch to a branch or commit
- "stash_save": Stash current changes
- "stash_pop": Pop a stash
- "stash_list": List all stashes
- "revert_file": Discard changes in a specific file`),

    // diff
    cached: z.boolean().optional()
        .describe("For 'diff': if true, show staged diff instead of working directory diff."),

    // diff_file, revert_file
    file_path: z.string().optional()
        .describe("For 'diff_file' and 'revert_file': relative path to the file."),

    // log
    limit: z.number().int().min(1).max(50).optional()
        .describe("For 'log': maximum number of commits to return (default: 10, max: 50)."),
    offset: z.number().int().min(0).optional()
        .describe("For 'log': number of commits to skip for pagination (default: 0)."),

    // show_commit
    commit_hash: z.string().optional()
        .describe("For 'show_commit': the commit hash (short or full) to inspect."),

    // commit
    message: z.string().optional()
        .describe("For 'commit' and 'stash_save': the commit/stash message."),

    // create_branch
    branch: z.string().optional()
        .describe("For 'create_branch': name of the new branch."),
    from: z.string().optional()
        .describe("For 'create_branch': starting point for the branch (default: HEAD)."),

    // checkout
    ref: z.string().optional()
        .describe("For 'checkout': branch name or commit hash to switch to."),

    // stash_pop
    index: z.number().int().min(0).optional()
        .describe("For 'stash_pop': index of the stash to pop (default: latest)."),
});

type GitOperationsInput = z.infer<typeof gitOperationsSchema>;

// ============================================================================
// Read-only operations (consent: always)
// ============================================================================

const READ_OPERATIONS = new Set([
    "status",
    "diff",
    "diff_file",
    "log",
    "show_commit",
    "current_branch",
    "list_branches",
    "stash_list",
]);

// ============================================================================
// Execute helpers
// ============================================================================

async function executeStatus(ctx: AgentContext): Promise<ToolResult> {
    const branch = await gitCurrentBranch({ path: ctx.appPath });
    const files = await getGitUncommittedFilesWithStatus({ path: ctx.appPath });

    if (files.length === 0) {
        return `On branch: ${branch ?? "(detached HEAD)"}\nNothing to commit, working tree clean.`;
    }

    const lines = [`On branch: ${branch ?? "(detached HEAD)"}`, `${files.length} uncommitted file(s):`, ""];
    for (const f of files) {
        lines.push(`  ${f.status.padEnd(10)} ${f.path}`);
    }
    return lines.join("\n");
}

async function executeDiff(ctx: AgentContext, cached: boolean): Promise<ToolResult> {
    const diff = await gitDiff({ path: ctx.appPath, cached });
    if (!diff.trim()) {
        return cached
            ? "No staged changes."
            : "No unstaged changes in the working directory.";
    }
    // Truncate very large diffs to avoid flooding the context window
    const MAX_DIFF_LENGTH = 15_000;
    if (diff.length > MAX_DIFF_LENGTH) {
        return diff.slice(0, MAX_DIFF_LENGTH) + "\n\n... (diff truncated, use diff_file for specific files)";
    }
    return diff;
}

async function executeDiffFile(ctx: AgentContext, filePath: string): Promise<ToolResult> {
    const result = await gitDiffFile({ path: ctx.appPath, filepath: filePath });
    if (!result.diff.trim()) {
        return `No changes detected for: ${filePath}`;
    }
    const header = `File: ${filePath} | +${result.additions} -${result.deletions}`;
    return `${header}\n${result.diff}`;
}

async function executeLog(ctx: AgentContext, limit: number, offset: number): Promise<ToolResult> {
    const result = await gitLogDetailed({
        path: ctx.appPath,
        limit,
        offset,
    });

    if (result.commits.length === 0) {
        return "No commits found.";
    }

    const lines = [`Showing ${result.commits.length} of ${result.total} commits:`];
    for (const c of result.commits) {
        const filesStr = c.filesChanged > 0 ? ` | ${c.filesChanged} file(s) +${c.insertions} -${c.deletions}` : "";
        lines.push(`  ${c.shortHash} ${c.message} (${c.author}, ${c.date})${filesStr}`);
    }
    if (result.hasMore) {
        lines.push(`\n  ... use offset=${offset + limit} to see more`);
    }
    return lines.join("\n");
}

async function executeShowCommit(ctx: AgentContext, commitHash: string): Promise<ToolResult> {
    const detail = await gitShowCommitDetail({ path: ctx.appPath, commitHash });
    const lines = [
        `Commit: ${detail.hash}`,
        `Author: ${detail.author} <${detail.email}>`,
        `Date:   ${detail.date}`,
        `Message: ${detail.message}`,
        `Stats: ${detail.filesChanged} file(s), +${detail.insertions} -${detail.deletions}`,
        "",
        "Files:",
    ];
    for (const f of detail.files) {
        lines.push(`  ${f.status.padEnd(10)} ${f.path}`);
    }
    // Include diff but truncate if very large
    if (detail.diff) {
        const MAX_DIFF = 10_000;
        lines.push("", "Diff:");
        if (detail.diff.length > MAX_DIFF) {
            lines.push(detail.diff.slice(0, MAX_DIFF));
            lines.push("... (diff truncated)");
        } else {
            lines.push(detail.diff);
        }
    }
    return lines.join("\n");
}

async function executeCommit(ctx: AgentContext, message: string): Promise<ToolResult> {
    // Stage all changes before committing
    await gitAddAll({ path: ctx.appPath });
    const oid = await gitCommit({ path: ctx.appPath, message });
    return `Committed successfully.\nCommit hash: ${oid}\nMessage: ${message}`;
}

async function executeCreateBranch(ctx: AgentContext, branch: string, from?: string): Promise<ToolResult> {
    await gitCreateBranch({ path: ctx.appPath, branch, from });
    return `Branch '${branch}' created${from ? ` from ${from}` : ""}.`;
}

async function executeCheckout(ctx: AgentContext, ref: string): Promise<ToolResult> {
    await gitCheckout({ path: ctx.appPath, ref });
    return `Switched to '${ref}'.`;
}

async function executeStashSave(ctx: AgentContext, message?: string): Promise<ToolResult> {
    const result = await gitStash({ path: ctx.appPath, message });
    return result;
}

async function executeStashPop(ctx: AgentContext, index?: number): Promise<ToolResult> {
    const result = await gitStashPop({ path: ctx.appPath, index });
    return result || "Stash applied and dropped.";
}

async function executeStashList(ctx: AgentContext): Promise<ToolResult> {
    const stashes = await gitStashList({ path: ctx.appPath });
    if (stashes.length === 0) {
        return "No stashes found.";
    }
    const lines = [`${stashes.length} stash(es):`];
    for (const s of stashes) {
        lines.push(`  stash@{${s.index}}: ${s.message}`);
    }
    return lines.join("\n");
}

async function executeRevertFile(ctx: AgentContext, filePath: string): Promise<ToolResult> {
    await gitDiscardFile({ path: ctx.appPath, filepath: filePath });
    return `Changes discarded for: ${filePath}`;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const gitOperationsTool: ToolDefinition<GitOperationsInput> = {
    name: "git_operations",
    description: `Execute Git operations on the project repository.

Use this tool to inspect the state of the repository and manage version control:
- **Read-only**: status, diff, diff_file, log, show_commit, current_branch, list_branches, stash_list
- **Write**: commit, create_branch, checkout, stash_save, stash_pop, revert_file

Always check 'status' before committing to understand what will be included.
Use descriptive commit messages following conventional commit format (e.g. "feat: add login page").`,

    inputSchema: gitOperationsSchema,
    defaultConsent: "always",
    modifiesState: false, // Some ops modify state, but we handle consent per-operation inside execute

    getConsentPreview: (args) => {
        switch (args.operation) {
            case "status":
                return "View repository status";
            case "diff":
                return args.cached ? "View staged diff" : "View working directory diff";
            case "diff_file":
                return `View diff for ${args.file_path}`;
            case "log":
                return `View commit history (${args.limit ?? 10} commits)`;
            case "show_commit":
                return `Inspect commit ${args.commit_hash}`;
            case "current_branch":
                return "View current branch";
            case "list_branches":
                return "List branches";
            case "commit":
                return `Commit: "${args.message}"`;
            case "create_branch":
                return `Create branch '${args.branch}'${args.from ? ` from ${args.from}` : ""}`;
            case "checkout":
                return `Checkout '${args.ref}'`;
            case "stash_save":
                return `Stash changes${args.message ? `: ${args.message}` : ""}`;
            case "stash_pop":
                return `Pop stash${args.index != null ? ` @{${args.index}}` : ""}`;
            case "stash_list":
                return "List stashes";
            case "revert_file":
                return `Discard changes in ${args.file_path}`;
            default:
                return "Git operation";
        }
    },

    buildXml: (args, isComplete) => {
        if (!args.operation) return undefined;
        const attrs = [`operation="${escapeXmlAttr(args.operation)}"`];

        // Add relevant attributes per operation
        switch (args.operation) {
            case "diff":
                if (args.cached) attrs.push(`cached="true"`);
                break;
            case "diff_file":
                if (args.file_path) attrs.push(`file_path="${escapeXmlAttr(args.file_path)}"`);
                break;
            case "log":
                if (args.limit != null) attrs.push(`limit="${args.limit}"`);
                if (args.offset != null) attrs.push(`offset="${args.offset}"`);
                break;
            case "show_commit":
                if (args.commit_hash) attrs.push(`commit="${escapeXmlAttr(args.commit_hash)}"`);
                break;
            case "commit":
                if (args.message) attrs.push(`message="${escapeXmlAttr(args.message)}"`);
                break;
            case "create_branch":
                if (args.branch) attrs.push(`branch="${escapeXmlAttr(args.branch)}"`);
                if (args.from) attrs.push(`from="${escapeXmlAttr(args.from)}"`);
                break;
            case "checkout":
                if (args.ref) attrs.push(`ref="${escapeXmlAttr(args.ref)}"`);
                break;
            case "stash_save":
                if (args.message) attrs.push(`message="${escapeXmlAttr(args.message)}"`);
                break;
            case "stash_pop":
                if (args.index != null) attrs.push(`index="${args.index}"`);
                break;
            case "revert_file":
                if (args.file_path) attrs.push(`file_path="${escapeXmlAttr(args.file_path)}"`);
                break;
        }

        // When streaming (not complete), emit an unclosed tag so the frontend
        // detects it as "in-progress" and shows the animated streaming label.
        if (!isComplete) {
            return `<dyad-git ${attrs.join(" ")}>`;
        }
        return `<dyad-git ${attrs.join(" ")}></dyad-git>`;
    },

    execute: async (args, ctx: AgentContext): Promise<ToolResult> => {
        // For write operations, request explicit consent even though tool default is "always"
        if (!READ_OPERATIONS.has(args.operation)) {
            const preview = gitOperationsTool.getConsentPreview?.(args) ?? args.operation;
            const allowed = await ctx.requireConsent({
                toolName: `git_operations:${args.operation}`,
                toolDescription: `Git write operation: ${args.operation}`,
                inputPreview: preview,
            });
            if (!allowed) {
                throw new ToolError(`User denied permission for git ${args.operation}`, {
                    retryable: false,
                });
            }
        }

        try {
            switch (args.operation) {
                case "status":
                    return await executeStatus(ctx);
                case "diff":
                    return await executeDiff(ctx, args.cached ?? false);
                case "diff_file":
                    return await executeDiffFile(ctx, args.file_path!);
                case "log":
                    return await executeLog(ctx, args.limit ?? 10, args.offset ?? 0);
                case "show_commit":
                    return await executeShowCommit(ctx, args.commit_hash!);
                case "current_branch":
                    const branch = await gitCurrentBranch({ path: ctx.appPath });
                    return `Current branch: ${branch ?? "(detached HEAD)"}`;
                case "list_branches":
                    const branches = await gitListBranches({ path: ctx.appPath });
                    if (branches.length === 0) return "No branches found.";
                    return `Branches:\n${branches.map((b) => `  ${b}`).join("\n")}`;
                case "commit":
                    return await executeCommit(ctx, args.message!);
                case "create_branch":
                    return await executeCreateBranch(ctx, args.branch!, args.from);
                case "checkout":
                    return await executeCheckout(ctx, args.ref!);
                case "stash_save":
                    return await executeStashSave(ctx, args.message);
                case "stash_pop":
                    return await executeStashPop(ctx, args.index);
                case "stash_list":
                    return await executeStashList(ctx);
                case "revert_file":
                    return await executeRevertFile(ctx, args.file_path!);
                default:
                    throw new ToolError(`Unknown git operation: ${(args as any).operation}`, {
                        retryable: false,
                    });
            }
        } catch (error) {
            if (error instanceof ToolError) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new ToolError(`Git operation '${args.operation}' failed: ${msg}`, {
                retryable: true,
                hint: "Check that the repository is in a valid state and the operation parameters are correct.",
            });
        }
    },
};
