import { z } from "zod";
import { isOpenAIOrAnthropicSetup } from "./providerUtils";

/**
 * Default fallback model for standard-mode tasks (titles, summaries, stack detection, etc.)
 * Used when `settings.standardModeModel` is not configured.
 */
export const DEFAULT_STANDARD_MODEL = "google/gemini-2.5-flash-lite" as const;

export const SecretSchema = z.object({
  value: z.string(),
  encryptionType: z.enum(["electron-safe-storage", "plaintext"]).optional(),
});
export type Secret = z.infer<typeof SecretSchema>;

/**
 * Zod schema for chat summary objects returned by the get-chats IPC
 */
export const ChatSummarySchema = z.object({
  id: z.number(),
  appId: z.number(),
  title: z.string().nullable(),
  createdAt: z.date(),
  isPlan: z.boolean().optional().default(false),
  lastReadAt: z.date().nullable().optional(),
});

/**
 * Type derived from the ChatSummarySchema
 */
export type ChatSummary = z.infer<typeof ChatSummarySchema>;

/**
 * Zod schema for an array of chat summaries
 */
export const ChatSummariesSchema = z.array(ChatSummarySchema);

/**
 * Zod schema for chat search result objects returned by the search-chats IPC
 */
export const ChatSearchResultSchema = z.object({
  id: z.number(),
  appId: z.number(),
  title: z.string().nullable(),
  createdAt: z.date(),
  matchedMessageContent: z.string().nullable(),
  isPlan: z.boolean().optional().default(false),
});

/**
 * Type derived from the ChatSearchResultSchema
 */
export type ChatSearchResult = z.infer<typeof ChatSearchResultSchema>;

export const ChatSearchResultsSchema = z.array(ChatSearchResultSchema);


// Zod schema for app search result objects returned by the search-app IPC
export const AppSearchResultSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.date(),
  matchedChatTitle: z.string().nullable(),
  matchedChatMessage: z.string().nullable(),
});

// Type derived from AppSearchResultSchema
export type AppSearchResult = z.infer<typeof AppSearchResultSchema>;

export const AppSearchResultsSchema = z.array(AppSearchResultSchema);

const providers = [
  "openai",
  "anthropic",
  "google",
  "vertex",
  "auto",
  "openrouter",
  "ollama",
  "lmstudio",
  "azure",
  "xai",
  "bedrock",
] as const;

export const cloudProviders = providers.filter(
  (provider) => provider !== "ollama" && provider !== "lmstudio",
);

/**
 * Zod schema for large language model configuration
 */
export const LargeLanguageModelSchema = z.object({
  name: z.string(),
  provider: z.string(),
  customModelId: z.number().optional(),
});

/**
 * Type derived from the LargeLanguageModelSchema
 */
export type LargeLanguageModel = z.infer<typeof LargeLanguageModelSchema>;

/**
 * Zod schema for provider settings
 * Regular providers use only apiKey. Vertex has additional optional fields.
 */
export const RegularProviderSettingSchema = z.object({
  apiKey: SecretSchema.optional(),
});

export const AzureProviderSettingSchema = z.object({
  apiKey: SecretSchema.optional(),
  resourceName: z.string().optional(),
});

export const VertexProviderSettingSchema = z.object({
  // We make this undefined so that it makes existing callsites easier.
  apiKey: z.undefined(),
  projectId: z.string().optional(),
  location: z.string().optional(),
  serviceAccountKey: SecretSchema.optional(),
});

export const OpenRouterKeySchema = z.object({
  id: z.string(),
  key: SecretSchema,
  alias: z.string().optional(),
});

export const OpenRouterProviderSettingSchema = z.object({
  apiKey: SecretSchema.optional(), // Legacy/Fallback
  keys: z.array(OpenRouterKeySchema).optional(),
  selectedKeyId: z.string().optional(),
});

export const ProviderSettingSchema = z.union([
  // Must use more specific type first!
  // Zod uses the first type that matches.
  //
  // We use passthrough as a hack because Azure and Vertex
  // will match together since their required fields overlap.
  //
  // In addition, there may be future provider settings that
  // we may want to preserve (e.g. user downgrades to older version)
  // so doing passthrough keeps these extra fields.
  AzureProviderSettingSchema.passthrough(),
  VertexProviderSettingSchema.passthrough(),
  RegularProviderSettingSchema.passthrough(),
]);



/**
 * Type derived from the ProviderSettingSchema
 */
export type ProviderSetting = z.infer<typeof ProviderSettingSchema>;
export type RegularProviderSetting = z.infer<
  typeof RegularProviderSettingSchema
>;
export type AzureProviderSetting = z.infer<typeof AzureProviderSettingSchema>;
export type VertexProviderSetting = z.infer<typeof VertexProviderSettingSchema>;

export const RuntimeModeSchema = z.enum(["web-sandbox", "local-node", "unset"]);
export type RuntimeMode = z.infer<typeof RuntimeModeSchema>;

export const RuntimeMode2Schema = z.enum(["host", "docker"]);
export type RuntimeMode2 = z.infer<typeof RuntimeMode2Schema>;

export const ChatModeSchema = z.enum(["agent", "plan", "ask", "mockup"]);
export type ChatMode = z.infer<typeof ChatModeSchema>;

export const GitHubSecretsSchema = z.object({
  accessToken: SecretSchema.nullable(),
});
export type GitHubSecrets = z.infer<typeof GitHubSecretsSchema>;

export const GithubUserSchema = z.object({
  email: z.string(),
});
export type GithubUser = z.infer<typeof GithubUserSchema>;

/**
 * Supabase organization credentials.
 * Each organization has its own OAuth tokens.
 */
export const SupabaseOrganizationCredentialsSchema = z.object({
  accessToken: SecretSchema,
  refreshToken: SecretSchema,
  expiresIn: z.number(),
  tokenTimestamp: z.number(),
});
export type SupabaseOrganizationCredentials = z.infer<
  typeof SupabaseOrganizationCredentialsSchema
>;

export const SupabaseSchema = z.object({
  // Map keyed by organizationSlug -> organization credentials
  organizations: z
    .record(z.string(), SupabaseOrganizationCredentialsSchema)
    .optional(),

  // Legacy fields - kept for backwards compat
  accessToken: SecretSchema.optional(),
  refreshToken: SecretSchema.optional(),
  expiresIn: z.number().optional(),
  tokenTimestamp: z.number().optional(),
});
export type Supabase = z.infer<typeof SupabaseSchema>;

export const NeonSchema = z.object({
  accessToken: SecretSchema.optional(),
  refreshToken: SecretSchema.optional(),
  expiresIn: z.number().optional(),
  tokenTimestamp: z.number().optional(),
});
export type Neon = z.infer<typeof NeonSchema>;

export const FirebaseSchema = z.object({
  accessToken: SecretSchema.optional(),
  refreshToken: SecretSchema.optional(),
  expiresIn: z.number().optional(),
  tokenTimestamp: z.number().optional(),
});
export type Firebase = z.infer<typeof FirebaseSchema>;

export const ExperimentsSchema = z.object({
  enableSupabaseIntegration: z.boolean().describe("DEPRECATED").optional(),
  enableFileEditing: z.boolean().describe("DEPRECATED").optional(),
});
export type Experiments = z.infer<typeof ExperimentsSchema>;

// VibesProBudgetSchema removed — Pro concept eliminated after acquisition

export const GlobPathSchema = z.object({
  globPath: z.string(),
});

export type GlobPath = z.infer<typeof GlobPathSchema>;

export const AppChatContextSchema = z.object({
  contextPaths: z.array(GlobPathSchema),
  smartContextAutoIncludes: z.array(GlobPathSchema),
  excludePaths: z.array(GlobPathSchema).optional(),
});
export type AppChatContext = z.infer<typeof AppChatContextSchema>;

export type ContextPathResult = GlobPath & {
  files: number;
  tokens: number;
};

export type ContextPathResults = {
  contextPaths: ContextPathResult[];
  smartContextAutoIncludes: ContextPathResult[];
  excludePaths: ContextPathResult[];
};

export const ReleaseChannelSchema = z.enum(["stable", "beta"]);
export type ReleaseChannel = z.infer<typeof ReleaseChannelSchema>;

export const ZoomLevelSchema = z.enum(["90", "100", "110", "125", "150"]);
export type ZoomLevel = z.infer<typeof ZoomLevelSchema>;

export const DeviceModeSchema = z.enum(["desktop", "tablet", "mobile"]);
export type DeviceMode = z.infer<typeof DeviceModeSchema>;

export const ChatLanguageSchema = z.enum(["es", "en"]);
export type ChatLanguage = z.infer<typeof ChatLanguageSchema>;

export const SmartContextModeSchema = z.enum([
  "balanced",
  "conservative",
  "deep",
]);
export type SmartContextMode = z.infer<typeof SmartContextModeSchema>;

export const AgentToolConsentSchema = z.enum(["ask", "always", "never"]);
export type AgentToolConsent = z.infer<typeof AgentToolConsentSchema>;

export const ChatRenderModeSchema = z.enum(["full", "zen"]);
export type ChatRenderMode = z.infer<typeof ChatRenderModeSchema>;

/**
 * Zod schema for user settings
 */
export const UserSettingsSchema = z
  .object({
    ////////////////////////////////
    // E2E TESTING ONLY.
    ////////////////////////////////
    isTestMode: z.boolean().optional(),

    ////////////////////////////////
    // DEPRECATED.
    ////////////////////////////////
    enableProSaverMode: z.boolean().optional(),
    // vibesProBudget: removed (Pro eliminated)
    runtimeMode: RuntimeModeSchema.optional(),

    ////////////////////////////////
    // ACTIVE FIELDS.
    ////////////////////////////////
    selectedModel: LargeLanguageModelSchema,
    providerSettings: z.record(z.string(), ProviderSettingSchema),
    // DEPRECATED — legacy individual model fields. Use standardModeModel / proModeModel instead.
    // Kept in schema for backwards-compat (.passthrough() preserves them in settings files).
    turboEditModel: z.string().optional(),
    appTitleGenerationModel: z.string().optional(),
    todoAnalysisModel: z.string().optional(),
    debateModel: z.string().optional(),
    summaryModel: z.string().optional(),
    knowledgeExtractionModel: z.string().optional(),
    dossierModel: z.string().optional(),
    // Unified model keys — two tiers that replace all 7 individual fields above
    standardModeModel: z.string().optional(),   // cheap/fast (titles, summaries, todos, debates)
    proModeModel: z.string().optional(),         // thinking/strong (turbo edits, knowledge extraction)
    agentToolConsents: z.record(z.string(), AgentToolConsentSchema).optional(),
    githubUser: GithubUserSchema.optional(),
    githubAccessToken: SecretSchema.optional(),
    vercelAccessToken: SecretSchema.optional(),
    supabase: SupabaseSchema.optional(),
    neon: NeonSchema.optional(),
    firebase: FirebaseSchema.optional(),
    autoApproveChanges: z.boolean().optional(),
    telemetryConsent: z.enum(["opted_in", "opted_out", "unset"]).optional(),
    telemetryUserId: z.string().optional(),
    hasRunBefore: z.boolean().optional(),
    // enableVibesPro: removed (Pro eliminated — always Pro)
    experiments: ExperimentsSchema.optional(),
    lastShownReleaseNotesVersion: z.string().optional(),
    maxChatTurnsInContext: z.number().optional(),
    thinkingBudget: z.enum(["low", "medium", "high"]).optional(),
    agentMaxSteps: z.number().optional(), // retained for migration compat — no longer used
    reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
    textVerbosity: z.enum(["low", "medium", "high"]).optional(),
    enabledOpenRouterModels: z.array(z.string()).optional(),
    // OpenRouter model variant suffix (e.g. ":nitro", ":exacto", ":extended")
    // Applied globally; ignored for free models at runtime.
    selectedModelVariant: z.string().optional(),
    enableProLazyEditsMode: z.boolean().optional(),
    proLazyEditsMode: z.enum(["off", "v1", "v2"]).optional(),
    enableTurboEditsV2: z.boolean().optional(),
    enableProSmartFilesContextMode: z.boolean().optional(),
    // Persist token stats for charts/logging
    enableTokenStats: z.boolean().optional(),
    // Enable verbose internal chat logs (debugging/diagnostics)
    enableVerboseChatLogs: z.boolean().optional(),
    // Master switch: enable all stats, logs, and metrics (default off for performance)
    enableAllStatsAndLogs: z.boolean().optional(),
    // Notifications when el chat termina
    enableChatCompletionNotifications: z.boolean().optional(),
    // Control GitHub auto-commit behavior
    enableGithubAutoCommit: z.boolean().optional(),

    proSmartContextOption: SmartContextModeSchema.optional(),
    selectedTemplateId: z.string(),
    selectedThemeId: z.string().optional(),
    enableSupabaseWriteSqlMigration: z.boolean().optional(),
    skipPruneEdgeFunctions: z.boolean().optional(),

    // Ripgrep ignore patterns — written as .ignore in project dirs before each session.
    // Synced via Bunny DB so the user gets the same config on all devices.
    openCodeIgnorePatterns: z.array(z.string()).optional(),
    selectedChatMode: z.preprocess(
    (val) => {
        // Migrate all legacy mode values to "agent"
        if (val === "local-agent" || val === "crush-agent" || val === "build" || val === "legacy-agent" || val === "smart") return "agent";
        return val;
      },
      ChatModeSchema.optional(),
    ),
    defaultChatMode: z.preprocess(
      (val) => {
        if (val === "local-agent" || val === "crush-agent" || val === "build" || val === "legacy-agent" || val === "smart") return "agent";
        return val;
      },
      ChatModeSchema.optional(),
    ),
    acceptedCommunityCode: z.boolean().optional(),
    zoomLevel: ZoomLevelSchema.optional(),
    previewDeviceMode: DeviceModeSchema.optional(),

    autoExpandPreviewPanel: z.boolean().optional(),
    previewPosition: z.enum(["left", "right"]).optional(),
    showTokenBar: z.boolean().optional(),
    enableNativeGit: z.boolean().optional(),
    enableAutoUpdate: z.boolean().optional(),
    releaseChannel: ReleaseChannelSchema.optional(),
    runtimeMode2: RuntimeMode2Schema.optional(),
    customNodePath: z.string().optional().nullable(),
    isRunning: z.boolean().optional(),
    lastKnownPerformance: z
      .object({
        timestamp: z.number(),
        memoryUsageMB: z.number(),
        cpuUsagePercent: z.number().optional(),
        systemMemoryUsageMB: z.number().optional(),
        systemMemoryTotalMB: z.number().optional(),
        systemCpuPercent: z.number().optional(),
      })
      .optional(),

    chatLanguage: ChatLanguageSchema.optional(),

    themeIntensity: z.number().optional(),
    primaryColorLight: z.string().optional(),
    primaryColorDark: z.string().optional(),
    primaryChromaLight: z.number().optional(),
    primaryChromaDark: z.number().optional(),
    customPrompts: z.record(z.string(), z.string()).optional(),
    aiQueryLogRotationThreshold: z.enum(["50", "100", "200", "500", "1000"]).optional(),
    // Embeddings for semantic search
    embeddingsEnabled: z.boolean().optional(),
    embeddingsModel: z.string().optional(),
    // OpenRouter web search (server tool) — model decides when to search
    enableWebSearch: z.boolean().optional(),
    // OpenCode LSP: when true, language servers send diagnostics after each file write
    // (auto-corrects TS errors inline). When false, the agent must run tsc manually.
    enableOpenCodeLsp: z.boolean().optional(),
    // Chat render mode: "full" (all badges/modals/tools) or "zen" (minimal DOM, only prose + cost)
    chatRenderMode: ChatRenderModeSchema.optional(),
    // Selected UI font family (id from shared/fonts.ts)
    selectedFont: z.string().optional(),
    // Selected Chat font family
    selectedChatFont: z.string().optional(),
    // OpenCode binary auto-update tracking
    lastOpenCodeUpdateCheck: z.string().optional(),

    // Auth (Vibes System)
    sessionToken: SecretSchema.optional(),
    userId: z.string().optional(),

    windowState: z
      .object({
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        isMaximized: z.boolean().optional(),
      })
      .optional(),
    iconLibrary: z.enum(["lucide", "iconoir"]).optional(),
  })
  // Allow unknown properties to pass through (e.g. future settings
  // that should be preserved if user downgrades to an older version)
  .passthrough();

/**
 * Type derived from the UserSettingsSchema
 */
export type UserSettings = z.infer<typeof UserSettingsSchema>;

/**
 * Gets the effective default chat mode.
 * The schema preprocessor already migrates legacy values, so this is straightforward.
 */
export function getEffectiveDefaultChatMode(
  settings: UserSettings,
): ChatMode {
  return settings.defaultChatMode ?? "agent";
}



export function isSupabaseConnected(settings: UserSettings | null): boolean {
  if (!settings) {
    return false;
  }
  return Boolean(
    settings.supabase?.accessToken ||
    (settings.supabase?.organizations &&
      Object.keys(settings.supabase.organizations).length > 0),
  );
}






export interface FileChange {
  name: string;
  path: string;
  summary: string;
  type: "write" | "rename" | "delete";
  isServerFunction: boolean;
}

export interface CodeProposal {
  type: "code-proposal";
  title: string;
  filesChanged: FileChange[];
  packagesAdded: string[];
  sqlQueries: SqlQuery[];
}

export type SuggestedAction =
  | RestartAppAction
  | RefactorFileAction
  | WriteCodeProperlyAction
  | RebuildAction
  | RestartAction
  | RefreshAction
  | KeepGoingAction;

export interface RestartAppAction {
  id: "restart-app";
}


export interface WriteCodeProperlyAction {
  id: "write-code-properly";
}

export interface RefactorFileAction {
  id: "refactor-file";
  path: string;
}

export interface RebuildAction {
  id: "rebuild";
}

export interface RestartAction {
  id: "restart";
}

export interface RefreshAction {
  id: "refresh";
}

export interface KeepGoingAction {
  id: "keep-going";
}

export interface ActionProposal {
  type: "action-proposal";
  actions: SuggestedAction[];
}

export interface TipProposal {
  type: "tip-proposal";
  title: string;
  description: string;
}

export type Proposal = CodeProposal | ActionProposal | TipProposal;

export interface ProposalResult {
  proposal: Proposal;
  chatId: number;
  messageId: number;
}

export interface SqlQuery {
  content: string;
  description?: string;
}
