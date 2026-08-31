import { z } from "zod";
import { isOpenAIOrAnthropicSetup } from "./providerUtils";

/**
 * Default model for lightweight/mechanical tasks (titles, summaries, compaction,
 * mockups, commit messages, stack detection, etc.).
 * Used when `settings.executorModel` is not configured.
 */
export const DEFAULT_EXECUTOR_MODEL = "google/gemini-2.5-flash-lite" as const;

/**
 * Default model for reasoning agents (plan, explore, general).
 * Used when `settings.strategistModel` is not configured.
 * Build always uses selectedModel (the chat picker model).
 */
export const DEFAULT_STRATEGIST_MODEL = "deepseek/deepseek-v4-flash" as const;

// ── Legacy aliases (kept for migration compat — DO NOT USE in new code) ──
/** @deprecated Use DEFAULT_EXECUTOR_MODEL */
export const DEFAULT_STANDARD_MODEL = DEFAULT_EXECUTOR_MODEL;
/** @deprecated Use DEFAULT_STRATEGIST_MODEL */
export const DEFAULT_AGENT_MODEL = DEFAULT_STRATEGIST_MODEL;

// ── Multi-provider model string utilities ──────────────────────────────────
// Format: "provider::model-name" e.g. "ollama::qwen2.5-coder:7b"
// Legacy format (plain string without ::) defaults to the active provider.

/** Separator used in multi-provider model strings */
export const MODEL_PROVIDER_SEPARATOR = "::" as const;

/**
 * Parse a model string that may include a provider prefix.
 * Examples:
 *   "ollama::qwen2.5-coder:7b"  → { provider: "ollama", name: "qwen2.5-coder:7b" }
 *   "google/gemini-2.5-flash-lite" → { provider: fallbackProvider, name: "google/gemini-2.5-flash-lite" }
 */
export function parseModelString(
  raw: string,
  fallbackProvider: string,
): { provider: string; name: string } {
  const sep = raw.indexOf(MODEL_PROVIDER_SEPARATOR);
  if (sep > 0) {
    return {
      provider: raw.slice(0, sep),
      name: raw.slice(sep + MODEL_PROVIDER_SEPARATOR.length),
    };
  }
  return { provider: fallbackProvider, name: raw };
}

/**
 * Compose a provider::model string.
 * If provider matches fallbackProvider, returns just the model name (backward compat).
 */
export function composeModelString(
  provider: string,
  name: string,
  fallbackProvider?: string,
): string {
  if (fallbackProvider && provider === fallbackProvider) return name;
  return `${provider}${MODEL_PROVIDER_SEPARATOR}${name}`;
}

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
  isRead: z.boolean().optional().default(true),
  lastReadAt: z.date().nullable().optional(),
  messageCount: z.number().optional().default(0),
  labels: z
    .array(
      z.object({
        id: z.number(),
        label: z.string(),
        color: z.string(),
      }),
    )
    .optional()
    .default([]),
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
  isRead: z.boolean().optional().default(true),
  labels: z
    .array(
      z.object({
        id: z.number(),
        label: z.string(),
        color: z.string(),
      }),
    )
    .optional()
    .default([]),
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

// ── Custom AI Provider (OpenAI-compatible endpoints) ──
export const CustomProviderConfigSchema = z.object({
  id: z.string(), // e.g. "custom::litellm-proxy"
  name: z.string(), // Display name: "Mi Proxy LiteLLM"
  apiBaseUrl: z.string(), // "https://my-proxy.example.com/v1"
  apiKey: SecretSchema.optional(),
  // How to discover models:
  modelsSource: z
    .enum([
      "openai-compatible", // GET /models (standard OpenAI endpoint)
      "manual", // User adds them manually
    ])
    .optional(), // default: "openai-compatible"
});
export type CustomProviderConfig = z.infer<typeof CustomProviderConfigSchema>;

// ── Per-provider model snapshot (restored when switching providers) ──
export const ProviderModelConfigSchema = z.object({
  selectedModel: LargeLanguageModelSchema.optional(),
  strategistModel: z.string().optional(),
  executorModel: z.string().optional(),
  enabledModels: z.array(z.string()).optional(),
});
export type ProviderModelConfig = z.infer<typeof ProviderModelConfigSchema>;

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

export const ChatModeSchema = z.union([
  z.enum(["agent", "plan", "ask", "mockup"]),
  z.string(),
]);
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

export const ChatRenderModeSchema = z.enum(["full", "flow", "zen"]);
export type ChatRenderMode = z.infer<typeof ChatRenderModeSchema>;

// ── Slice 3.2: Permissions config (clean shape, no OpenCode baggage) ──
//
// Renamed from `openCodePermissions2` to `permissions`. Vibes-owned policy.
// No migration from the old key — users start fresh. The old key remains
// in the schema as a deprecated optional so existing on-disk data doesn't
// crash the boot, but the code never reads it.

export const PermissionDecisionSchema = z.enum(["allow", "ask", "deny"]);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

export const PermissionCustomRuleSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  permission: PermissionDecisionSchema,
});
export type PermissionCustomRule = z.infer<
  typeof PermissionCustomRuleSchema
>;

// Per-tool global pill. Open Record keyed by toolId → decision so the catalog
// (single source of truth) drives which tools appear, and new tools work
// without schema changes. Unknown keys pass through (`.passthrough` on the
// parent preserves them).
export const PermissionsToolsSchema = z.record(
  z.string(),
  PermissionDecisionSchema,
);

// Shell sub-pills (granular rules for shell commands).
export const PermissionsShellSubPillsSchema = z
  .object({
    rm: PermissionDecisionSchema.optional(),
    gitReset: PermissionDecisionSchema.optional(),
    gitPush: PermissionDecisionSchema.optional(),
    gitPushForce: PermissionDecisionSchema.optional(),
    gitPushDelete: PermissionDecisionSchema.optional(),
  })
  .optional();

// Custom rules (prefix-match patterns for shell commands).
export const PermissionsCustomRulesSchema = z
  .array(PermissionCustomRuleSchema)
  .optional();

export const PermissionsConfigSchema = z.object({
  tools: PermissionsToolsSchema.optional(),
  shellSubPills: PermissionsShellSubPillsSchema,
  customRules: PermissionsCustomRulesSchema,
});
export type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;

// Re-export for backwards compatibility with code that still uses the old
// names. The old schema is preserved as-is so existing data doesn't crash.
export const BashCustomRuleSchema = PermissionCustomRuleSchema;
export type BashCustomRule = PermissionCustomRule;
export const OpenCodePermissionSchema = PermissionDecisionSchema;
export type OpenCodePermission = PermissionDecision;
export const OpenCodePermissionsConfigSchema = z
  .object({
    edit: PermissionDecisionSchema.optional(),
    bash: PermissionDecisionSchema.optional(),
    read: PermissionDecisionSchema.optional(),
    webfetch: PermissionDecisionSchema.optional(),
    websearch: PermissionDecisionSchema.optional(),
    lsp: PermissionDecisionSchema.optional(),
    task: PermissionDecisionSchema.optional(),
    skill: PermissionDecisionSchema.optional(),
    externalDirectory: PermissionDecisionSchema.optional(),
    bashRm: PermissionDecisionSchema.optional(),
    gitAdd: PermissionDecisionSchema.optional(),
    gitCommit: PermissionDecisionSchema.optional(),
    gitReset: PermissionDecisionSchema.optional(),
    gitCheckout: PermissionDecisionSchema.optional(),
    gitRestore: PermissionDecisionSchema.optional(),
    gitClean: PermissionDecisionSchema.optional(),
    gitRebase: PermissionDecisionSchema.optional(),
    gitMergeAbort: PermissionDecisionSchema.optional(),
    gitStashDrop: PermissionDecisionSchema.optional(),
    gitBranchDelete: PermissionDecisionSchema.optional(),
    gitCherryPickAbort: PermissionDecisionSchema.optional(),
    gitPush: PermissionDecisionSchema.optional(),
    gitPushForce: PermissionDecisionSchema.optional(),
    gitPushDelete: PermissionDecisionSchema.optional(),
    bashGitCommit: PermissionDecisionSchema.optional(),
    bashGitPush: PermissionDecisionSchema.optional(),
    bashCustomRules: z.array(BashCustomRuleSchema).optional(),
  })
  .optional();
export type OpenCodePermissionsConfig = z.infer<
  typeof OpenCodePermissionsConfigSchema
>;

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
    // DEPRECATED — legacy individual model fields. Kept for backwards-compat (.passthrough()).
    appTitleGenerationModel: z.string().optional(),
    todoAnalysisModel: z.string().optional(),
    debateModel: z.string().optional(),
    summaryModel: z.string().optional(),
    knowledgeExtractionModel: z.string().optional(),
    dossierModel: z.string().optional(),
    // DEPRECATED — superseded by strategistModel + executorModel
    standardModeModel: z.string().optional(),
    proModeModel: z.string().optional(),
    // ── Active unified model keys (v2: support provider::model format) ──
    // Format: "provider::model-name" (e.g. "ollama::qwen2.5-coder:7b")
    // Legacy plain strings (e.g. "google/gemini-2.5-flash-lite") default to activeProviderId.
    strategistModel: z.string().optional(), // reasoning agents (plan, explore, general)
    executorModel: z.string().optional(), // lightweight tasks (titles, summaries, compaction, mockup, commits)
    agentToolConsents: z.record(z.string(), AgentToolConsentSchema).optional(),
    visionPreprocessorEnabled: z.boolean().optional(),
    // B5: routes chat streams through the vibes-core runtime instead of
    // OpenCode when true. Default false — OpenCode remains the engine until
    // the runtime bridge is validated (see phase1-tasks.md).
    runtimeBridgeEnabled: z.boolean().optional(),
    visionPreprocessorModel: z.string().optional(),
    // DEPRECATED (card #195): el prompt de visión es ahora un prompt de
    // sistema (systemId="vision", default en DEFAULT_PROMPTS + override en la
    // tabla prompts). Este campo se conserva SOLO como fuente de lectura para
    // la migración perezosa del override legado (vision_preprocessor.ts);
    // ningún writer lo sigue usando. No borrar hasta retirar la migración.
    visionPreprocessorPrompt: z.string().optional(),
    // DEPRECATED — openCodePermissions (v1 defaults). Superseded by `permissions`.
    openCodePermissions: OpenCodePermissionsConfigSchema.optional(),
    // DEPRECATED — openCodePermissions2 (v2 OpenCode-era). Superseded by `permissions`.
    // Kept so existing on-disk data doesn't crash the boot. The code never reads it.
    openCodePermissions2: OpenCodePermissionsConfigSchema.optional(),
    // ACTIVE — Vibes-owned permission policy (Slice 3.2). Read by the runtime
    // permission gate (runtime_host.ts → permissionResolver). Written by the
    // Settings UI (AgentPermissionsSettings.tsx).
    permissions: PermissionsConfigSchema.optional(),
    githubUser: GithubUserSchema.optional(),
    githubAccessToken: SecretSchema.optional(),
    vercelAccessToken: SecretSchema.optional(),
    supabase: SupabaseSchema.optional(),
    neon: NeonSchema.optional(),
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
    // #165: límites duros del loop del agente, configurables desde
    // Ajustes > Agente. undefined = usar el default de vibes-core
    // (1000 iteraciones / 4 horas de reloj). La carcasa los aplica EN
    // CALIENTE mutando el LoopConfig del runtime (no se recrea).
    agentMaxIterations: z.number().min(1).max(100_000).optional(),
    agentMaxWallClockMinutes: z.number().min(1).max(60 * 24 * 7).optional(),
    // #215: modelo de respaldo del loop (fallbackModel), en formato
    // "provider::model" (mismo que strategistModel/executorModel). undefined =
    // sin fallback. Se resuelve a ModelProvider en runtime_host al aplicar
    // settings → runtime (hot-reload sobre loopConfigMutable.fallbackModel).
    fallbackModel: z.string().optional(),
    reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
    // ── Inference hyperparameters (user-tunable from chat input) ──
    inferenceTemperature: z.number().min(0).max(2).optional(),
    inferenceTopP: z.number().min(0).max(1).optional(),
    inferenceRepetitionPenalty: z.number().min(0.5).max(2).optional(),
    textVerbosity: z.enum(["low", "medium", "high"]).optional(),
    enabledOpenRouterModels: z.array(z.string()).optional(),
    // Card #160 — clave neutral multi-provider (antes: enabledOpenRouterModels).
    // El validator migra la clave legacy → esta al boot.
    enabledModels: z.array(z.string()).optional(),

    // ── Multi-provider support ──
    // Active provider for all AI operations. "openrouter" when undefined (backward-compat).
    activeProviderId: z.string().optional(),
    // User-configured custom OpenAI-compatible providers
    customProviders: z.array(CustomProviderConfigSchema).optional(),
    // Per-provider model snapshots — restored when switching back to a provider
    providerModelConfigs: z
      .record(z.string(), ProviderModelConfigSchema)
      .optional(),

    enableProLazyEditsMode: z.boolean().optional(),
    proLazyEditsMode: z.enum(["off", "v1", "v2"]).optional(),
    enableProSmartFilesContextMode: z.boolean().optional(),
    // Persist token stats for charts/logging
    enableTokenStats: z.boolean().optional(),
    // Enable verbose internal chat logs (debugging/diagnostics)
    enableVerboseChatLogs: z.boolean().optional(),
    // Master switch: enable all stats, logs, and metrics (default off for performance)
    enableAllStatsAndLogs: z.boolean().optional(),
    // Notifications when el chat termina
    enableChatCompletionNotifications: z.boolean().optional(),
    // Play a programmatic sound (Web Audio API) when a notification fires
    enableNotificationSound: z.boolean().optional(),
    // Control GitHub auto-commit behavior
    enableGithubAutoCommit: z.boolean().optional(),

    proSmartContextOption: SmartContextModeSchema.optional(),
    selectedTemplateId: z.string(),
    enableSupabaseWriteSqlMigration: z.boolean().optional(),
    skipPruneEdgeFunctions: z.boolean().optional(),

    // Ripgrep ignore patterns — written as .ignore in project dirs before each session.
    // Synced via Bunny DB so the user gets the same config on all devices.
    openCodeIgnorePatterns: z.array(z.string()).optional(),
    selectedChatMode: z.preprocess((val) => {
      // Migrate all legacy mode values to "agent"
      if (
        val === "local-agent" ||
        val === "crush-agent" ||
        val === "build" ||
        val === "legacy-agent" ||
        val === "smart" ||
        val === "mockup"
      )
        return "agent";
      return val;
    }, ChatModeSchema.optional()),
    defaultChatMode: z.preprocess((val) => {
      if (
        val === "local-agent" ||
        val === "crush-agent" ||
        val === "build" ||
        val === "legacy-agent" ||
        val === "smart" ||
        val === "mockup"
      )
        return "agent";
      return val;
    }, ChatModeSchema.optional()),
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

    theme: z.enum(["system", "light", "dark"]).optional(),
    themeIntensity: z.number().optional(),
    primaryColorLight: z.string().optional(),
    primaryColorDark: z.string().optional(),
    primaryChromaLight: z.number().optional(),
    primaryChromaDark: z.number().optional(),
    themeFlavorDark: z.string().optional(),
    themeFlavorLight: z.string().optional(),
    loaderStyle: z.string().optional(),
    aiQueryLogRotationThreshold: z
      .enum(["50", "100", "200", "500", "1000"])
      .optional(),
    // Embeddings for semantic search
    embeddingsEnabled: z.boolean().optional(),
    embeddingsModel: z.string().optional(),
    // Memory system — agent persistent knowledge
    memoriesEnabled: z.boolean().optional(),
    memoriesAutoExtract: z.boolean().optional(),
    memoriesSynthesisModelV2: z.string().optional(),
    memoriesRouterModelV2: z.string().optional(),
    memoriesMaxSelection: z.number().optional(),
    // OpenRouter web search (server tool) — model decides when to search
    enableWebSearch: z.boolean().optional(),
    // OpenCode LSP: when true, language servers send diagnostics after each file write
    // (auto-corrects TS errors inline). When false, the agent must run tsc manually.
    enableOpenCodeLsp: z.boolean().optional(),
    // Ollama server configuration (default: http://localhost:11434)
    ollamaBaseUrl: z.string().optional(),
    // Whether the Ollama local provider is enabled in the UI + model pickers
    ollamaEnabled: z.boolean().optional(),
    // List of provider IDs that the user has explicitly disabled (e.g. ["custom-cortecs", "openrouter"])
    // Models from disabled providers are hidden from all selectors.
    disabledProviders: z.array(z.string()).optional(),
    // Chat render mode: "full" (all badges/modals/tools) or "zen" (minimal DOM, only prose + cost)
    chatRenderMode: ChatRenderModeSchema.optional(),
    // Selected UI font family (id from shared/fonts.ts)
    selectedFont: z.string().optional(),
    // Selected Chat font family
    selectedChatFont: z.string().optional(),
    // Font size multiplier (1 = default, 1.3 = 30% larger) — per group
    fontScaleUI: z.number().optional(),
    fontScaleSidebar: z.number().optional(),
    fontScaleChat: z.number().optional(),
    fontScaleBubbleWidth: z.number().optional(),
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
    // Per-window-type saved bounds (each secondary window remembers its own position/size)
    secondaryWindowStates: z
      .record(
        z.string(),
        z.object({
          x: z.number().optional(),
          y: z.number().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
          isMaximized: z.boolean().optional(),
        }),
      )
      .optional(),
    // Playground — saved model presets
    playgroundModelSets: z
      .array(
        z.object({
          name: z.string(),
          models: z.array(z.string()),
        }),
      )
      .optional(),
    // Git commit panel: persisted vertical split size (percentage, 0-100)
    gitCommitPanelSize: z.number().optional(),
    // Plan sidebar: persisted horizontal split size (percentage, 0-100)
    planSidebarSize: z.number().optional(),
    // Show/hide cost display in chat headers and message footers (data is always saved)
    showCostDisplay: z.boolean().optional(),
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
export function getEffectiveDefaultChatMode(settings: UserSettings): ChatMode {
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
