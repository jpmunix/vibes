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
export { templateContracts } from "./templates";
export { proposalContracts } from "./proposals";
export { importContracts } from "./import";
export { helpContracts, helpStreamContract } from "./help";
export { capacitorContracts } from "./capacitor";
export { contextContracts } from "./context";
export { upgradeContracts } from "./upgrade";
export { visualEditingContracts } from "./visual-editing";
export { miscContracts, miscEvents } from "./misc";
export { designContracts } from "./design";


export { todoContracts, todoAttachmentContracts } from "./todo";
export { tokenStatsContracts } from "./token_stats";
export { chatLogsContracts } from "./chat_logs";

export { debateContracts, debateStreamContract } from "./debate";
export { knowledgeContracts } from "./knowledge";
export { aiQueryLogContracts } from "../contracts/ai_query_logs";

export { authContracts } from "./auth";

// =============================================================================
// Client Exports
// =============================================================================

export { settingsClient } from "./settings";
export { appClient } from "./app";
export { chatClient, chatStreamClient } from "./chat";
export { todoClient, todoAttachmentClient } from "./todo";
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
export { templateClient } from "./templates";
export { proposalClient } from "./proposals";
export { importClient } from "./import";
export { helpClient, helpStreamClient } from "./help";
export { capacitorClient } from "./capacitor";
export { contextClient } from "./context";
export { upgradeClient } from "./upgrade";
export { visualEditingClient } from "./visual-editing";
export { tokenStatsClient } from "./token_stats";
export { chatLogsClient } from "./chat_logs";

export { debateClient, debateStreamClient } from "./debate";
export { miscClient, miscEventClient } from "./misc";

export { knowledgeClient } from "./knowledge";
export { aiQueryLogClient } from "./ai_query_logs";

export { authClient } from "./auth";
export { designClient } from "./design";

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

// Template types
export type {
  Template,
  Theme,
  SetAppThemeParams,
  GetAppThemeParams,
  CustomTheme,
  CreateCustomThemeParams,
  UpdateCustomThemeParams,
  DeleteCustomThemeParams,
} from "./templates";

// Proposal types
export type { ProposalResult, ApproveProposalResult } from "./proposals";

// Import types
export type { ImportAppParams, ImportAppResult } from "./import";

// Help types
export type { HelpChatStartParams } from "./help";

// Context types
export type { ContextPathResults, AppChatContext } from "./context";

// Upgrade types
export type { AppUpgrade } from "./upgrade";

export type {
  VisualEditingChange,
  ApplyVisualEditingChangesParams,
  AnalyseComponentParams,
  ElementType,
} from "./visual-editing";

// Design types
export type { DesignItem } from "./design";


// Misc types
export type { ChatLogsData, DeepLinkData, AppOutput, EnvVar } from "./misc";





// Todo types
export type {
  Todo,
  TodoSection,
  CreateTodoParams,
  UpdateTodoParams,
  ReorderTodosParams,
  DevelopTodoParams,
  DevelopTodoResponse,
  CreateTodoSectionParams,
  UpdateTodoSectionParams,
  UploadTodoFileParams,
  RemoveTodoAttachmentParams,
} from "./todo";

// Debate types
export type { InjectedItem, DebateMessage, DebateTag, Debate } from "./debate";

// Knowledge types
export type {
  KnowledgeEntry,
  KnowledgeCategory,
  KnowledgeSource,
  KnowledgeDurability,
  CreateKnowledgeEntryParams,
  UpdateKnowledgeEntryParams,
  ExtractKnowledgeParams,
  BulkKnowledgeParams,
  KnowledgeHealthResult,
} from "./knowledge";



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

export { ChatLogEntrySchema } from "./chat_logs";
export type { ChatLogEntry } from "./chat_logs";

// =============================================================================
// Aggregated IPC Client
// =============================================================================

import { agentClient, agentEventClient } from "./agent";
import { appClient } from "./app";
import { capacitorClient } from "./capacitor";
import { chatClient, chatStreamClient } from "./chat";
import { chatLogsClient } from "./chat_logs";
import { contextClient } from "./context";


import { gitClient, githubClient, githubEventClient } from "./github";
import { helpClient, helpStreamClient } from "./help";
import { importClient } from "./import";
import { languageModelClient } from "./language-model";
import { mcpClient, mcpEventClient } from "./mcp";
import { miscClient, miscEventClient } from "./misc";
import { neonClient } from "./neon";
import { promptClient } from "./prompts";
import { proposalClient } from "./proposals";
import { settingsClient } from "./settings";
import { supabaseClient } from "./supabase";
import { systemClient, systemEventClient } from "./system";
import { templateClient } from "./templates";
import { todoClient, todoAttachmentClient } from "./todo";
import { tokenStatsClient } from "./token_stats";
import { upgradeClient } from "./upgrade";
import { vercelClient } from "./vercel";
import { versionClient } from "./version";
import { visualEditingClient } from "./visual-editing";
import { debateClient, debateStreamClient } from "./debate";
import { knowledgeClient } from "./knowledge";
import { firebaseClient } from "./firebase";
import { bunnyClient } from "./bunny";
import { pocketbaseClient } from "./pocketbase";
import { aiQueryLogClient } from "./ai_query_logs";

import { authClient } from "./auth";
import { designClient } from "./design";

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
  todo: todoClient,
  todoAttachment: todoAttachmentClient,
  agent: agentClient,
  debate: debateClient,

  // Streaming clients
  chatStream: chatStreamClient,
  helpStream: helpStreamClient,
  debateStream: debateStreamClient,


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
  template: templateClient,
  proposal: proposalClient,
  import: importClient,
  help: helpClient,
  capacitor: capacitorClient,
  context: contextClient,
  upgrade: upgradeClient,
  visualEditing: visualEditingClient,
  misc: miscClient,

  tokenStats: tokenStatsClient,
  chatLogs: chatLogsClient,

  knowledge: knowledgeClient,
  aiQueryLogs: aiQueryLogClient,


  // Auth
  auth: authClient,

  // Design system picker
  design: designClient,

  // Event clients for main->renderer pub/sub
  events: {
    agent: agentEventClient,
    github: githubEventClient,
    mcp: mcpEventClient,
    system: systemEventClient,
    misc: miscEventClient,
  },
} as const;
