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
    themeId: text("theme_id"),
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
    todoId: integer("todo_id"),
    title: text("title"),
    initialCommitHash: text("initial_commit_hash"),
    isPlan: integer("is_plan").default(0),
    planData: text("plan_data", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
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
    usingFreeAgentModeQuota: integer("using_free_agent_mode_quota"),
    previousResponseId: integer("previous_response_id"),
    status: text("status").default("completed"),
    durationMs: integer("duration_ms"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// CHAT LOGS
// =============================================================================

export const chatLogs = sqliteTable("chat_logs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    chatId: integer("chat_id")
        .notNull()
        .references(() => chats.id, { onDelete: "cascade" }),
    messageId: integer("message_id").references(() => messages.id, {
        onDelete: "cascade",
    }),
    level: text("level").notNull(),
    category: text("category").notNull(),
    message: text("message").notNull(),
    metadata: text("metadata"),
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
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
// LANGUAGE MODEL PROVIDERS
// =============================================================================

export const languageModelProviders = sqliteTable("language_model_providers", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    name: text("name").notNull(),
    apiBaseUrl: text("api_base_url").notNull(),
    envVarName: text("env_var_name"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// LANGUAGE MODELS
// =============================================================================

export const languageModels = sqliteTable("language_models", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    displayName: text("display_name").notNull(),
    apiName: text("api_name").notNull(),
    builtinProviderId: text("builtin_provider_id"),
    customProviderId: text("custom_provider_id").references(
        () => languageModelProviders.id,
        { onDelete: "cascade" },
    ),
    description: text("description"),
    maxOutputTokens: integer("max_output_tokens"),
    contextWindow: integer("context_window"),
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
// CUSTOM THEMES
// =============================================================================

export const customThemes = sqliteTable("custom_themes", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    name: text("name").notNull(),
    description: text("description"),
    prompt: text("prompt").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// NOTES
// =============================================================================

export const notes = sqliteTable("notes", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    title: text("title").notNull().default("Nueva nota"),
    content: text("content").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// TODO SECTIONS
// =============================================================================

export const todoSections = sqliteTable("todo_sections", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    appId: integer("app_id")
        .notNull()
        .references(() => apps.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Nueva sección"),
    order: integer("order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// TODOS
// =============================================================================

export const todos = sqliteTable("todos", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    appId: integer("app_id")
        .notNull()
        .references(() => apps.id, { onDelete: "cascade" }),
    sectionId: integer("section_id").references(() => todoSections.id, {
        onDelete: "set null",
    }),
    content: text("content").notNull().default(""),
    description: text("description"),
    prompt: text("prompt"),
    completed: integer("completed").notNull().default(0),
    order: integer("order").notNull().default(0),
    developmentSummary: text("development_summary"),
    checklist: text("checklist"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// DEBATES
// =============================================================================

export const debates = sqliteTable("debates", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    title: text("title").notNull(),
    summary: text("summary"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// DEBATE MESSAGES
// =============================================================================

export const debateMessages = sqliteTable("debate_messages", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    debateId: integer("debate_id")
        .notNull()
        .references(() => debates.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    isSummary: integer("is_summary").default(0),
    injectedItems: text("injected_items"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// DEBATE TAGS
// =============================================================================

export const debateTags = sqliteTable("debate_tags", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    name: text("name").notNull(),
    color: text("color"),
});

// =============================================================================
// DEBATE TO TAGS (junction table)
// =============================================================================

export const debateToTags = sqliteTable("debate_to_tags", {
    debateId: integer("debate_id")
        .notNull()
        .references(() => debates.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
        .notNull()
        .references(() => debateTags.id, { onDelete: "cascade" }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
});

// =============================================================================
// KNOWLEDGE ENTRIES
// =============================================================================

export const knowledgeEntries = sqliteTable("knowledge_entries", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    appId: integer("app_id")
        .notNull()
        .references(() => apps.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    content: text("content").notNull(),
    source: text("source").notNull().default("manual"),
    confidence: integer("confidence").notNull().default(100),
    enabled: integer("enabled").notNull().default(1),
    durability: text("durability").default("permanent"),
    supersededBy: integer("superseded_by"),
    lastConfirmedAt: integer("last_confirmed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// AI QUERY LOGS
// =============================================================================

export const aiQueryLogs = sqliteTable("ai_query_logs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    queryType: text("query_type").notNull(),
    model: text("model").notNull(),
    promptSnippet: text("prompt_snippet").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    response: text("response", { mode: "json" }).notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// EMBEDDINGS CACHE
// =============================================================================

export const embeddingsCache = sqliteTable("embeddings_cache", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    scope: text("scope").notNull(),
    sourceId: integer("source_id").notNull(),
    contentKey: text("content_key").notNull(),
    contentHash: text("content_hash").notNull(),
    embedding: text("embedding").notNull(),
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// DOSSIERS (NEW — linked to apps)
// =============================================================================

export const dossiers = sqliteTable("dossiers", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    appId: integer("app_id")
        .notNull()
        .references(() => apps.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
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
    dossiers: many(dossiers),
}));

export const appsRelations = relations(apps, ({ one, many }) => ({
    user: one(users, { fields: [apps.userId], references: [users.id] }),
    chats: many(chats),
    versions: many(versions),
    todoSections: many(todoSections),
    todos: many(todos),
    knowledgeEntries: many(knowledgeEntries),
    dossiers: many(dossiers),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
    user: one(users, { fields: [chats.userId], references: [users.id] }),
    app: one(apps, { fields: [chats.appId], references: [apps.id] }),
    messages: many(messages),
    chatLogs: many(chatLogs),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    user: one(users, { fields: [messages.userId], references: [users.id] }),
    chat: one(chats, { fields: [messages.chatId], references: [chats.id] }),
}));

export const dossiersRelations = relations(dossiers, ({ one }) => ({
    user: one(users, { fields: [dossiers.userId], references: [users.id] }),
    app: one(apps, { fields: [dossiers.appId], references: [apps.id] }),
}));

export const debatesRelations = relations(debates, ({ many, one }) => ({
    user: one(users, { fields: [debates.userId], references: [users.id] }),
    messages: many(debateMessages),
    tags: many(debateToTags),
}));

export const debateMessagesRelations = relations(debateMessages, ({ one }) => ({
    debate: one(debates, { fields: [debateMessages.debateId], references: [debates.id] }),
    user: one(users, { fields: [debateMessages.userId], references: [users.id] }),
}));

export const debateTagsRelations = relations(debateTags, ({ many, one }) => ({
    user: one(users, { fields: [debateTags.userId], references: [users.id] }),
    debates: many(debateToTags),
}));

export const debateToTagsRelations = relations(debateToTags, ({ one }) => ({
    debate: one(debates, { fields: [debateToTags.debateId], references: [debates.id] }),
    tag: one(debateTags, { fields: [debateToTags.tagId], references: [debateTags.id] }),
    user: one(users, { fields: [debateToTags.userId], references: [users.id] }),
}));
