/**
 * Tool definitions for Local Agent v2
 * Each tool includes a zod schema, description, and execute function
 */

import { IpcMainInvokeEvent } from "electron";
import crypto from "node:crypto";
import { readSettings, writeSettings } from "@/main/settings";
import { fileEditorTool } from "./tools/file_editor";
import { exploreCodebaseTool } from "./tools/explore_codebase";
import { deleteFileTool } from "./tools/delete_file";
import { renameFileTool } from "./tools/rename_file";
import { addDependencyTool } from "./tools/add_dependency";
import { executeSqlTool } from "./tools/execute_sql";
import * as remoteSchema from "@/db/remote-schema";
import { getRemoteDb } from "@/db/remote";
import { eq } from "drizzle-orm";

import { getSupabaseProjectInfoTool } from "./tools/get_supabase_project_info";
import { getSupabaseTableSchemaTool } from "./tools/get_supabase_table_schema";
import { getFirebaseProjectInfoTool } from "./tools/get_firebase_project_info";
import { getBunnyDbInfoTool } from "./tools/get_bunny_db_info";
import { getBunnyStorageInfoTool } from "./tools/get_bunny_storage_info";
import { setChatSummaryTool } from "./tools/set_chat_summary";
import { addIntegrationTool } from "./tools/add_integration";
import { readLogsTool } from "./tools/read_logs";

import { webCrawlTool } from "./tools/web_crawl";
import { updateTodosTool } from "./tools/update_todos";
import { runTypeChecksTool } from "./tools/run_type_checks";
import { gitOperationsTool } from "./tools/git_operations";
import { askUserTool, clearPendingAskUsersForChat } from "./tools/ask_user";
import { runCommandTool } from "./tools/run_command";
import { startProcessTool, stopProcessTool, listProcessesTool } from "./tools/process_management";
import { waitForHttpTool } from "./tools/wait_for_http";
import type { LanguageModelV3ToolResultOutput } from "@ai-sdk/provider";
import {
  type ToolDefinition,
  type AgentContext,
  type ToolResult,
  type StructuredToolResult,
  ToolError,
  type FileEditToolName,
  FILE_EDIT_TOOL_NAMES,
} from "./tools/types";
import { AgentToolConsent } from "@/lib/schemas";
import { getSupabaseClientCode } from "@/supabase_admin/supabase_context";
import { getFirebaseConfigCode } from "@/firebase_admin/firebase_context";
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  fileEditorTool,
  deleteFileTool,
  renameFileTool,
  addDependencyTool,
  executeSqlTool,
  exploreCodebaseTool,
  runCommandTool,
  startProcessTool,
  stopProcessTool,
  listProcessesTool,
  waitForHttpTool,
  getSupabaseProjectInfoTool,
  getSupabaseTableSchemaTool,
  getFirebaseProjectInfoTool,
  getBunnyDbInfoTool,
  getBunnyStorageInfoTool,
  setChatSummaryTool,
  addIntegrationTool,
  readLogsTool,

  webCrawlTool,
  updateTodosTool,
  runTypeChecksTool,
  gitOperationsTool,
  askUserTool,
];
// ============================================================================
// Agent Tool Name Type (derived from TOOL_DEFINITIONS)
// ============================================================================

export type AgentToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

// ============================================================================
// Agent Tool Consent Management
// ============================================================================

interface PendingConsentEntry {
  chatId: number;
  resolve: (d: "accept-once" | "accept-always" | "decline") => void;
}

const pendingConsentResolvers = new Map<string, PendingConsentEntry>();

export function waitForAgentToolConsent(
  requestId: string,
  chatId: number,
): Promise<"accept-once" | "accept-always" | "decline"> {
  return new Promise((resolve) => {
    pendingConsentResolvers.set(requestId, { chatId, resolve });
  });
}

export function resolveAgentToolConsent(
  requestId: string,
  decision: "accept-once" | "accept-always" | "decline",
) {
  const entry = pendingConsentResolvers.get(requestId);
  if (entry) {
    pendingConsentResolvers.delete(requestId);
    entry.resolve(decision);
  }
}

/**
 * Clean up all pending consent requests for a given chat.
 * Called when a stream is cancelled/aborted to prevent orphaned promises
 * and stale UI banners.
 */
export function clearPendingConsentsForChat(chatId: number): void {
  for (const [requestId, entry] of pendingConsentResolvers) {
    if (entry.chatId === chatId) {
      pendingConsentResolvers.delete(requestId);
      // Resolve with decline so the tool execution fails gracefully
      entry.resolve("decline");
    }
  }
  // Also clean up any pending ask_user requests for this chat
  clearPendingAskUsersForChat(chatId);
}

export function getDefaultConsent(toolName: AgentToolName): AgentToolConsent {
  const tool = TOOL_DEFINITIONS.find((t) => t.name === toolName);
  return tool?.defaultConsent ?? "ask";
}

export function getAgentToolConsent(toolName: AgentToolName): AgentToolConsent {
  const settings = readSettings();
  const stored = settings.agentToolConsents?.[toolName];
  if (stored) {
    return stored;
  }
  return getDefaultConsent(toolName);
}

export function setAgentToolConsent(
  toolName: AgentToolName,
  consent: AgentToolConsent,
): void {
  const settings = readSettings();
  writeSettings({
    agentToolConsents: {
      ...settings.agentToolConsents,
      [toolName]: consent,
    },
  });
}

export function getAllAgentToolConsents(): Record<
  AgentToolName,
  AgentToolConsent
> {
  const settings = readSettings();
  const stored = settings.agentToolConsents ?? {};
  const result: Record<string, AgentToolConsent> = {};

  // Start with defaults, override with stored values
  for (const tool of TOOL_DEFINITIONS) {
    const storedConsent = stored[tool.name];
    if (storedConsent) {
      result[tool.name] = storedConsent;
    } else {
      result[tool.name] = getDefaultConsent(tool.name as AgentToolName);
    }
  }

  return result as Record<AgentToolName, AgentToolConsent>;
}

export async function requireAgentToolConsent(
  event: IpcMainInvokeEvent,
  params: {
    chatId: number;
    toolName: AgentToolName;
    toolDescription?: string | null;
    inputPreview?: string | null;
  },
): Promise<boolean> {
  const current = getAgentToolConsent(params.toolName);

  if (current === "always") return true;
  if (current === "never")
    throw new Error("Should not ask for consent for a tool marked as 'never'");

  // If autoApproveChanges is enabled globally, skip the consent prompt
  const settings = readSettings();
  if (settings.autoApproveChanges) return true;

  // Ask renderer for a decision via event bridge
  const requestId = `agent:${params.toolName}:${crypto.randomUUID()}`;
  (event.sender as any).send("agent-tool:consent-request", {
    requestId,
    ...params,
  });

  const response = await waitForAgentToolConsent(requestId, params.chatId);

  if (response === "accept-always") {
    setAgentToolConsent(params.toolName, "always");
    return true;
  }
  if (response === "decline") {
    return false;
  }
  return response === "accept-once";
}

// ============================================================================
// Build Agent Tool Set
// ============================================================================

/**
 * Process placeholders in tool args (e.g. $$SUPABASE_CLIENT_CODE$$)
 * Recursively processes all string values in the args object.
 */
async function processArgPlaceholders<T extends Record<string, any>>(
  args: T,
  ctx: AgentContext,
): Promise<T> {
  const argsStr = JSON.stringify(args);
  const hasSupabase = argsStr.includes("$$SUPABASE_CLIENT_CODE$$");
  const hasFirebase = argsStr.includes("$$FIREBASE_CLIENT_CODE$$");

  if (!hasSupabase && !hasFirebase) {
    return args;
  }

  let supabaseClientCode = "";
  if (hasSupabase && ctx.supabaseProjectId) {
    supabaseClientCode = await getSupabaseClientCode({
      projectId: ctx.supabaseProjectId,
      organizationSlug: ctx.supabaseOrganizationSlug ?? null,
    });
  }

  let firebaseClientCode = "";
  if (hasFirebase && ctx.firebaseProjectId) {
    const app = await getRemoteDb().query.apps.findFirst({
      where: eq(remoteSchema.apps.id, ctx.appId),
    });
    if (app?.firebaseConfig) {
      firebaseClientCode = await getFirebaseConfigCode({
        appId: ctx.appId,
        projectId: ctx.firebaseProjectId,
        config: app.firebaseConfig,
      });
    }
  }

  const processValue = (value: any): any => {
    if (typeof value === "string") {
      let result = value;
      if (supabaseClientCode) {
        result = result.replace(/\$\$SUPABASE_CLIENT_CODE\$\$/g, supabaseClientCode);
      }
      if (firebaseClientCode) {
        result = result.replace(/\$\$FIREBASE_CLIENT_CODE\$\$/g, firebaseClientCode);
      }
      return result;
    }
    if (Array.isArray(value)) {
      return value.map(processValue);
    }
    if (value && typeof value === "object") {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = processValue(v);
      }
      return result;
    }
    return value;
  };

  return processValue(args) as T;
}

/**
 * Convert our ToolResult to AI SDK format.
 * StructuredToolResult with isError=true formats the error message
 * with context so the model can self-correct.
 */
function convertToolResultForAiSdk(
  result: ToolResult,
): LanguageModelV3ToolResultOutput {
  if (typeof result === "string") {
    return { type: "text", value: result };
  }
  // StructuredToolResult
  const parts: string[] = [result.content];
  if (result.hint) {
    parts.push(`Hint: ${result.hint}`);
  }
  if (result.isError && result.retryable) {
    parts.push("This error is retryable. Please try again with corrected input.");
  }
  // Truncate long error messages to avoid bloating the conversation context
  let value = parts.join("\n");
  if (result.isError && value.length > 500) {
    value = value.slice(0, 500) + "\n[error truncated — use read_file to see actual file content]";
  }
  return { type: "text", value };
}

export interface BuildAgentToolSetOptions {
  /**
   * If true, exclude tools that modify state (files, database, etc.).
   * Used for read-only modes like "ask" mode.
   */
  readOnly?: boolean;
}

const FILE_EDIT_TOOLS: Set<FileEditToolName> = new Set(FILE_EDIT_TOOL_NAMES);

/**
 * Track file edit tool usage for telemetry
 */
function trackFileEditTool(
  ctx: AgentContext,
  toolName: string,
  args: { file_path?: string; path?: string },
): void {
  if (!FILE_EDIT_TOOLS.has(toolName as FileEditToolName)) {
    return;
  }
  const filePath = args.file_path ?? args.path;
  if (!filePath) {
    return;
  }
  if (!ctx.fileEditTracker[filePath]) {
    ctx.fileEditTracker[filePath] = {
      write_file: 0,
      edit_file: 0,
      search_replace: 0,
      patch_file: 0,
      file_editor: 0,
    };
  }
  ctx.fileEditTracker[filePath][toolName as FileEditToolName]++;
}

function isTransientError(error: any): boolean {
  const msg = String(error?.message || error);
  // File system locks
  if (
    msg.includes("EBUSY") ||
    msg.includes("ETXTBSY") ||
    msg.includes("EAGAIN")
  )
    return true;
  // Network (if applicable)
  if (
    msg.includes("ETIMEDOUT") ||
    msg.includes("ECONNRESET") ||
    msg.includes("network timeout")
  )
    return true;
  // Generic "Too many open files"
  if (msg.includes("EMFILE")) return true;
  return false;
}

/**
 * Build ToolSet for AI SDK from tool definitions
 */
export function buildAgentToolSet(
  ctx: AgentContext,
  options: BuildAgentToolSetOptions = {},
) {
  const toolSet: Record<string, any> = {};

  for (const tool of TOOL_DEFINITIONS) {
    const consent = getAgentToolConsent(tool.name);
    if (consent === "never") {
      continue;
    }

    // In read-only mode, skip tools that modify state
    if (options.readOnly && tool.modifiesState) {
      continue;
    }

    if (tool.isEnabled && !tool.isEnabled(ctx)) {
      continue;
    }

    toolSet[tool.name] = {
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: async (args: any) => {
        try {
          const processedArgs = await processArgPlaceholders(args, ctx);

          // Check consent before executing the tool
          const allowed = await ctx.requireConsent({
            toolName: tool.name,
            toolDescription: tool.description,
            inputPreview: tool.getConsentPreview?.(processedArgs) ?? null,
          });
          if (!allowed) {
            throw new Error(`User denied permission for ${tool.name}`);
          }



          let result;
          let retries = 2;
          while (true) {
            try {
              result = await tool.execute(processedArgs, ctx);
              break;
            } catch (err) {
              if (retries > 0 && isTransientError(err)) {
                retries--;
                await new Promise((r) => setTimeout(r, 300)); // Wait 300ms before retry
                continue;
              }
              throw err;
            }
          }

          return convertToolResultForAiSdk(result);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          // Return error as structured tool result so the model can self-correct
          // instead of aborting the step with an exception.
          return convertToolResultForAiSdk({
            content: `Error: ${errorMessage}`,
            isError: true,
            retryable: error instanceof ToolError ? error.retryable : true,
            hint: error instanceof ToolError ? error.hint : undefined,
          });
        }
      },
    };
  }

  return toolSet;
}
