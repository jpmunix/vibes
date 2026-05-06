/**
 * Remote database Drizzle schema (multi-tenant with userId)
 * Maps to Bunny Edge SQL tables created by remote.ts
 */
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import type { ModelMessage } from "ai";

export const AI_MESSAGES_SDK_VERSION = "ai@v6" as const;

export type AiMessagesJsonV6 = {
    messages: ModelMessage[];
    sdkVersion: typeof AI_MESSAGES_SDK_VERSION;
};

// =============================================================================
// USERS (auth propia)
// =============================================================================

export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull().default(""),
    photoUrl: text("photo_url"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
    sessionToken: text("session_token"),
    migrationStatus: text("migration_status", {
        enum: ["pending", "in_progress", "completed", "not_needed"],
    })
        .notNull()
        .default("not_needed"),
});

// =============================================================================
// USER SETTINGS (sync bidireccional)
// =============================================================================

export const userSettings = sqliteTable("user_settings", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    settingsJson: text("settings_json").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// APPS
// =============================================================================

export const apps = sqliteTable("apps", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    name: text("name").notNull(),
    path: text("path").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    githubOrg: text("github_org"),
    githubRepo: text("github_repo"),
    githubBranch: text("github_branch"),
    supabaseProjectId: text("supabase_project_id"),
    supabaseParentProjectId: text("supabase_parent_project_id"),
    supabaseOrganizationSlug: text("supabase_organization_slug"),
    neonProjectId: text("neon_project_id"),
    neonDevelopmentBranchId: text("neon_development_branch_id"),
    neonPreviewBranchId: text("neon_preview_branch_id"),
    vercelProjectId: text("vercel_project_id"),
    vercelProjectName: text("vercel_project_name"),
    vercelTeamId: text("vercel_team_id"),
    vercelDeploymentUrl: text("vercel_deployment_url"),
    firebaseProjectId: text("firebase_project_id"),
    firebaseConfig: text("firebase_config", { mode: "json" }),
    bunnyConfig: text("bunny_config", { mode: "json" }),
    pocketbaseConfig: text("pocketbase_config", { mode: "json" }),
    installCommand: text("install_command"),
    startCommand: text("start_command"),
    chatContext: text("chat_context", { mode: "json" }),
    isFavorite: integer("is_favorite").notNull().default(0),

    primaryLanguage: text("primary_language"),
    projectType: text("project_type"),
    isArchived: integer("is_archived").notNull().default(0),
});

// =============================================================================
// CHATS
// =============================================================================

export const chats = sqliteTable("chats", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    appId: integer("app_id")
        .notNull()
        .references(() => apps.id, { onDelete: "cascade" }),
    title: text("title"),
    initialCommitHash: text("initial_commit_hash"),
    isPlan: integer("is_plan").default(0),
    planData: text("plan_data", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    lastReadAt: integer("last_read_at", { mode: "timestamp" }),
    isRead: integer("is_read").notNull().default(1),
    isArchived: integer("is_archived").notNull().default(0),
    isPinned: integer("is_pinned").notNull().default(0),
    opencodeSessionId: text("opencode_session_id"),
});

// =============================================================================
// MESSAGES
// =============================================================================

export const messages = sqliteTable("messages", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    chatId: integer("chat_id")
        .notNull()
        .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    approvalState: text("approval_state"),
    sourceCommitHash: text("source_commit_hash"),
    commitHash: text("commit_hash"),
    requestId: text("request_id"),
    maxTokensUsed: integer("max_tokens_used"),
    model: text("model"),
    aiMessagesJson: text("ai_messages_json"),

    previousResponseId: integer("previous_response_id"),
    status: text("status").default("completed"),
    durationMs: integer("duration_ms"),
    smartModeIntent: text("smart_mode_intent"),
    /** JSON array of SelectedMemoryMeta — memories injected into this assistant response */
    injectedMemories: text("injected_memories", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});



// =============================================================================
// VERSIONS
// =============================================================================

export const versions = sqliteTable("versions", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    appId: integer("app_id")
        .notNull()
        .references(() => apps.id, { onDelete: "cascade" }),
    commitHash: text("commit_hash").notNull(),
    neonDbTimestamp: text("neon_db_timestamp"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// PROMPTS
// =============================================================================

export const prompts = sqliteTable("prompts", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});



// =============================================================================
// MCP SERVERS
// =============================================================================

export const mcpServers = sqliteTable("mcp_servers", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    name: text("name").notNull(),
    transport: text("transport").notNull(),
    command: text("command"),
    args: text("args", { mode: "json" }),
    envJson: text("env_json", { mode: "json" }),
    headersJson: text("headers_json", { mode: "json" }),
    url: text("url"),
    enabled: integer("enabled").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// MCP TOOL CONSENTS
// =============================================================================

export const mcpToolConsents = sqliteTable("mcp_tool_consents", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    serverId: integer("server_id")
        .notNull()
        .references(() => mcpServers.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    consent: text("consent").notNull().default("ask"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});



// =============================================================================
// USER PREFERENCES (key/value store, multi-tenant, optionally per-app)
// =============================================================================

export const userPreferences = sqliteTable("user_preferences", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    // app_id = 0 means global (not tied to any app); otherwise references the app
    appId: integer("app_id").notNull().default(0),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});



// =============================================================================
// MEMORIES (agent memory system — persistent structured knowledge)
// =============================================================================

export const memories = sqliteTable("memories", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    // app_id = 0 means global (not tied to any app); otherwise references the app
    appId: integer("app_id").notNull().default(0),
    type: text("type").notNull(),          // session, preference, issue (v2)
    key: text("key"),                       // For key-based overwrite (e.g. "backend_framework")
    content: text("content").notNull(),
    importance: integer("importance").notNull().default(50), // 0–100 (stored as int, mapped to 0.0–1.0)
    status: text("status"),                 // Issue lifecycle: active, fix_attempted, suspected_resolved, resolved, deprecated
    source: text("source").notNull().default("auto"), // auto | manual
    sourceChatId: integer("source_chat_id"),
    enabled: integer("enabled").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    lastUsed: integer("last_used", { mode: "timestamp" }),  // When the Router last selected this memory
});

// =============================================================================
// MEMORY TELEMETRY (temporary — for tuning the extraction pipeline)
// =============================================================================

export const memoryTelemetry = sqliteTable("memory_telemetry", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    appId: integer("app_id"),
    action: text("action").notNull(),  // skipped_trivial, skipped_no_tech, synthesized, routed, merged, discarded_quality
    reason: text("reason"),
    extractedKeys: text("extracted_keys"),  // JSON array of processed keys
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// MEMORY PIPELINE LOGS (raw — full payloads for deep analysis)
// =============================================================================

export const memoryPipelineLogs = sqliteTable("memory_pipeline_logs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    appId: integer("app_id").notNull(),
    chatId: integer("chat_id"),
    /** Pipeline stage: "synthesis" | "router" | "guardian" */
    stage: text("stage").notNull(),
    /** Model used for this LLM call */
    model: text("model"),
    /** Full system prompt sent to the LLM */
    systemPrompt: text("system_prompt"),
    /** Full user message sent to the LLM */
    userMessage: text("user_message"),
    /** Raw LLM response (unparsed) */
    rawResponse: text("raw_response"),
    /** Parsed operations/IDs as JSON */
    parsedResult: text("parsed_result"),
    /** Number of operations/IDs produced */
    resultCount: integer("result_count").notNull().default(0),
    /** Duration in ms */
    durationMs: integer("duration_ms"),
    /** Whether the call succeeded */
    success: integer("success").notNull().default(1),
    /** Error message if failed */
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// MEMORY DEBUG LOGS (one row = one complete pipeline run markdown file)
// =============================================================================

export const memoryDebugLogs = sqliteTable("memory_debug_logs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    appId: integer("app_id").notNull().default(0),
    appName: text("app_name").notNull().default(""),
    /** Original filename (e.g. "minube-phalcon.md") */
    filename: text("filename").notNull(),
    /** Full markdown content of the pipeline run */
    contentMd: text("content_md").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// RELATIONS
// =============================================================================

export const usersRelations = relations(users, ({ one, many }) => ({
    settings: one(userSettings, {
        fields: [users.id],
        references: [userSettings.userId],
    }),
    apps: many(apps),
}));

export const appsRelations = relations(apps, ({ one, many }) => ({
    user: one(users, { fields: [apps.userId], references: [users.id] }),
    chats: many(chats),
    versions: many(versions),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
    user: one(users, { fields: [chats.userId], references: [users.id] }),
    app: one(apps, { fields: [chats.appId], references: [apps.id] }),
    messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    user: one(users, { fields: [messages.userId], references: [users.id] }),
    chat: one(chats, { fields: [messages.chatId], references: [chats.id] }),
}));

