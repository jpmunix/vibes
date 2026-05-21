/**
 * Type-Safe IPC Layer
 *
 * This module provides a unified, type-safe interface for all IPC operations.
 * Contracts define the single source of truth for channel names, input schemas,
 * and output schemas. Clients are auto-generated from contracts.
 *
 * @example
 * // Invoke-response pattern
 * const settings = await ipc.settings.getUserSettings();
 * const { app, chatId } = await ipc.app.createApp({ name: "my-app" });
 *
 * // Streaming pattern
 * ipc.chatStream.start(
 *   { chatId: 123, prompt: "Hello" },
 *   { onChunk, onEnd, onError }
 * );
 *
 * // Event subscription pattern
 * const unsubscribe = ipc.events.agent.onTodosUpdate((payload) => {
 *   updateTodoList(payload.todos);
 * });
 */

// =============================================================================
// Contract Exports
// =============================================================================

export { settingsContracts } from "./settings";
export { appContracts } from "./app";
export { chatContracts, chatStreamContract } from "./chat";
export { agentContracts, agentEvents } from "./agent";
export { githubContracts, gitContracts, githubEvents } from "./github";
export { mcpContracts, mcpEvents } from "./mcp";
export { vercelContracts } from "./vercel";
export { supabaseContracts } from "./supabase";
export { neonContracts } from "./neon";
export { firebaseContracts } from "./firebase";
export { bunnyContracts } from "./bunny";
export { pocketbaseContracts } from "./pocketbase";
export { systemContracts, systemEvents } from "./system";
export { versionContracts } from "./version";
export { languageModelContracts } from "./language-model";
export { promptContracts } from "./prompts";
export { customAgentsContracts } from "./custom_agents";
export { templateContracts } from "./templates";
export { proposalContracts } from "./proposals";
export { importContracts } from "./import";
export { helpContracts, helpStreamContract } from "./help";
export { capacitorContracts } from "./capacitor";
export { contextContracts } from "./context";
export { visualEditingContracts } from "./visual-editing";
export { miscContracts, miscEvents } from "./misc";
export { designContracts } from "./design";
export { memoryContracts } from "./memory";
export { markdownShareContracts } from "./markdown-share";


export { authContracts } from "./auth";
export { adminContracts } from "./admin";

export { memoryClient } from "./memory";
export { markdownShareClient } from "./markdown-share";

// =============================================================================
// Client Exports
// =============================================================================

export { settingsClient } from "./settings";
export { appClient } from "./app";
export { chatClient, chatStreamClient } from "./chat";
export { agentClient, agentEventClient } from "./agent";
export { githubClient, gitClient, githubEventClient } from "./github";
export { mcpClient, mcpEventClient } from "./mcp";
export { vercelClient } from "./vercel";
export { supabaseClient } from "./supabase";
export { neonClient } from "./neon";
export { firebaseClient } from "./firebase";
export { bunnyClient } from "./bunny";
export { pocketbaseClient } from "./pocketbase";
export { systemClient, systemEventClient } from "./system";
export { versionClient } from "./version";
export { languageModelClient } from "./language-model";
export { promptClient } from "./prompts";
export { customAgentsClient } from "./custom_agents";
export { templateClient } from "./templates";
export { proposalClient } from "./proposals";
export { importClient } from "./import";
export { helpClient, helpStreamClient } from "./help";
export { capacitorClient } from "./capacitor";
export { contextClient } from "./context";
export { visualEditingClient } from "./visual-editing";
export { miscClient, miscEventClient } from "./misc";

export { authClient } from "./auth";
export { designClient } from "./design";
export { adminClient } from "./admin";

// =============================================================================
// Type Exports
// =============================================================================

// Settings types
export type {
  GetUserSettingsInput,
  GetUserSettingsOutput,
  SetUserSettingsInput,
  SetUserSettingsOutput,
} from "./settings";

// App types
export type {
  App,
  CreateAppParams,
  CreateAppResult,
  CopyAppParams,
  EditAppFileReturnType,
  RespondToAppInputParams,
  AppFileSearchResult,
  ChangeAppLocationParams,
  ChangeAppLocationResult,
  ListAppsResponse,
  RenameBranchParams,
  ExecuteShellCommandParams,
  ExecuteShellCommandResult,
  CancelShellCommandParams,
} from "./app";

// Chat types
export type {
  Message,
  Chat,
  ComponentSelection,
  FileAttachment,
  ChatAttachment,
  ChatStreamParams,
  ChatResponseEnd,
  UpdateChatParams,
  TokenCountParams,
  TokenCountResult,
} from "./chat";

// Agent types
export type {
  AgentTool,
  AgentTodo,
  AgentToolConsentRequestPayload,
  AgentToolConsentDecision,
  AgentToolConsentResponseParams,
  AskUserRequestPayload,
  AskUserResponseParams,
  AgentTodosUpdatePayload,
  AgentProblemsUpdatePayload,
  SetAgentToolConsentParams,
  Problem,
  ProblemReport,
} from "./agent";

// GitHub types
export type {
  GitBranchAppIdParams,
  GitBranchParams,
  CreateGitBranchParams,
  RenameGitBranchParams,
  ListRemoteGitBranchesParams,
  CommitChangesParams,
  UncommittedFile,
  UncommittedFileStatus,
  GithubSyncOptions,
  CloneRepoParams,
  GithubRepository,
  GitDiffFile,
  GitCommit,
  GitPreview,
  CommitHistoryEntry,
  CommitHistoryFile,
} from "./github";

// MCP types
export type {
  McpServer,
  McpTransport,
  CreateMcpServer,
  McpServerUpdate,
  McpTool,
  McpToolConsent,
  McpConsentValue,
  McpConsentDecision,
  SetMcpToolConsentParams,
  McpConsentRequestPayload,
  McpConsentResponseParams,
} from "./mcp";

// Vercel types
export type {
  VercelProject,
  VercelDeployment,
  SaveVercelAccessTokenParams,
  ConnectToExistingVercelProjectParams,
  IsVercelProjectAvailableParams,
  IsVercelProjectAvailableResponse,
  CreateVercelProjectParams,
  GetVercelDeploymentsParams,
  DisconnectVercelProjectParams,
} from "./vercel";

// Supabase types
export type {
  SupabaseOrganizationInfo,
  SupabaseProject,
  SupabaseBranch,
  DeleteSupabaseOrganizationParams,
  SetSupabaseAppProjectParams,
  ConsoleEntry,
} from "./supabase";

// Neon types
export type {
  NeonProject,
  NeonBranch,
  CreateNeonProjectParams,
  GetNeonProjectParams,
  GetNeonProjectResponse,
} from "./neon";

// Firebase types
export type {
  FirebaseProject,
  FirebaseWebConfig,
  SetFirebaseAppProjectParams,
  CreateFirebaseProjectParams,
} from "./firebase";

// Bunny types
export type {
  BunnyConfig,
  BunnyDatabaseEntry,
  BunnyStorageZoneEntry,
} from "./bunny";

// PocketBase types
export type { PocketBaseConfig } from "./pocketbase";

// System types
export type {
  NodeSystemInfo,
  SystemDebugInfo,
  SelectNodeFolderResult,
  DoesReleaseNoteExistParams,
  UserBudgetInfo,
  TelemetryEventPayload,
  OpenRouterCredits,
} from "./system";

// Version types
export type {
  Version,
  BranchResult,
  RevertVersionParams,
  RevertVersionResponse,
} from "./version";

// Language model types
export type {
  LanguageModelProvider,
  LanguageModel,
  LocalModel,
  CreateCustomLanguageModelProviderParams,
  CreateCustomLanguageModelParams,
} from "./language-model";

// Prompt types
export type {
  PromptDto,
  CreatePromptParamsDto,
  UpdatePromptParamsDto,
} from "./prompts";

// Custom Agent types
export type {
  CustomAgentDto,
  CreateCustomAgentParams,
  UpdateCustomAgentParams,
} from "./custom_agents";

export type {
  Template,
} from "./templates";

// Proposal types
export type { ProposalResult, ApproveProposalResult } from "./proposals";

// Import types
export type { ImportAppParams, ImportAppResult } from "./import";

// Help types
export type { HelpChatStartParams } from "./help";

// Context types
export type { ContextPathResults, AppChatContext } from "./context";


export type {
  VisualEditingChange,
  ApplyVisualEditingChangesParams,
  AnalyseComponentParams,
  ElementType,
} from "./visual-editing";

// Design types
export type { DesignItem } from "./design";

// Markdown Share types
export type { MarkdownShareDocument } from "./markdown-share";


// Misc types
export type { DeepLinkData, AppOutput, EnvVar } from "./misc";





// Memory types
export type {
  MemoryEntry,
  MemoryType,
  MemorySource,
  IssueStatus,
  CreateMemoryParams,
  UpdateMemoryParams,
  ExtractMemoriesParams,
} from "./memory";



// =============================================================================
// Schema Exports (for validation in handlers/components)
// =============================================================================

export {
  AppSchema,
  CreateAppParamsSchema,
  CreateAppResultSchema,
  AppFileSearchResultSchema,
} from "./app";

export {
  MessageSchema,
  ChatSchema,
  ChatAttachmentSchema,
  ChatStreamParamsSchema,
  ChatResponseEndSchema,
} from "./chat";

export {
  AgentTodoSchema,
  AgentTodosUpdateSchema,
  AgentToolSchema,
  AgentToolConsentRequestSchema,
} from "./agent";

export { UserBudgetInfoSchema } from "./system";

// =============================================================================
// Aggregated IPC Client
// =============================================================================

import { agentClient, agentEventClient } from "./agent";
import { appClient } from "./app";
import { capacitorClient } from "./capacitor";
import { chatClient, chatStreamClient } from "./chat";
import { contextClient } from "./context";


import { gitClient, githubClient, githubEventClient } from "./github";
import { helpClient, helpStreamClient } from "./help";
import { importClient } from "./import";
import { languageModelClient } from "./language-model";
import { mcpClient, mcpEventClient } from "./mcp";
import { miscClient, miscEventClient } from "./misc";
import { neonClient } from "./neon";
import { promptClient } from "./prompts";
import { customAgentsClient } from "./custom_agents";
import { proposalClient } from "./proposals";
import { settingsClient } from "./settings";
import { supabaseClient } from "./supabase";
import { systemClient, systemEventClient } from "./system";
import { templateClient } from "./templates";
import { vercelClient } from "./vercel";
import { versionClient } from "./version";
import { visualEditingClient } from "./visual-editing";

import { firebaseClient } from "./firebase";
import { bunnyClient } from "./bunny";
import { pocketbaseClient } from "./pocketbase";
import { authClient } from "./auth";
import { designClient } from "./design";
import { memoryClient } from "./memory";
import { adminClient } from "./admin";
import { markdownShareClient } from "./markdown-share";

/**
 * Unified IPC client with all domains organized by namespace.
 *
 * @example
 * // Settings
 * const settings = await ipc.settings.getUserSettings();
 *
 * // App management
 * const app = await ipc.app.getApp(appId);
 *
 * // Chat operations
 * const chat = await ipc.chat.getChat(chatId);
 *
 * // Streaming
 * ipc.chatStream.start(params, callbacks);
 *
 * // Event subscriptions
 * ipc.events.agent.onTodosUpdate(handler);
 */
export const ipc = {
  // Core domains
  settings: settingsClient,
  app: appClient,
  chat: chatClient,
  agent: agentClient,


  // Streaming clients
  chatStream: chatStreamClient,
  helpStream: helpStreamClient,



  // Integrations
  github: githubClient,
  git: gitClient,
  mcp: mcpClient,
  vercel: vercelClient,
  supabase: supabaseClient,
  neon: neonClient,
  firebase: firebaseClient,
  bunny: bunnyClient,
  pocketbase: pocketbaseClient,

  // Features
  system: systemClient,
  version: versionClient,
  languageModel: languageModelClient,
  prompt: promptClient,
  customAgents: customAgentsClient,
  template: templateClient,
  proposal: proposalClient,
  import: importClient,
  help: helpClient,
  capacitor: capacitorClient,
  context: contextClient,
  visualEditing: visualEditingClient,
  misc: miscClient,


  // Auth
  auth: authClient,

  // Design system picker
  design: designClient,

  // Memory system
  memory: memoryClient,

  // Admin panel
  admin: adminClient,

  // Markdown share (md.mnstatic.com)
  markdownShare: markdownShareClient,

  // Event clients for main->renderer pub/sub
  events: {
    agent: agentEventClient,
    github: githubEventClient,
    mcp: mcpEventClient,
    system: systemEventClient,
    misc: miscEventClient,
  },
} as const;
