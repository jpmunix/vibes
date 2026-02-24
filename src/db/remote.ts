/**
 * Remote database connection using @libsql/client + drizzle-orm/libsql
 * Connects to Bunny Edge SQL (minube-vibes database)
 */
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./remote-schema";
import log from "electron-log";
const logger = log.scope("remote-db");

// Bunny Edge SQL credentials (hardcoded — private project)
const BUNNY_DB_URL =
  "libsql://01KJ783WM1SD8X465A3VPAGHG6-minube-vibes.lite.bunnydb.net/";
const BUNNY_DB_TOKEN =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJtaW51YmUtdmliZXMiXSwidGFncyI6bnVsbH0sInJvYSI6bnVsbCwicndhIjpudWxsLCJkZGwiOm51bGx9LCJpYXQiOjE3NzE5MTc0MDl9.m-5EAVWjKG0kPM72fPFpeAg25seNnUY65gtSzTJlhnD697C1mmCRoXZWkmcreHoV9vTRw22supEVIp342D_2CA";

let _client: Client | null = null;
let _remoteDb: LibSQLDatabase<typeof schema> | null = null;

/**
 * Get or create the libSQL client connection to Bunny Edge SQL
 */
export function getClient(): Client {
  if (!_client) {
    logger.info("Creating libSQL client connection to Bunny Edge SQL...");
    if (typeof fetch === 'undefined') {
      logger.error("Global fetch is not available. Remote DB will fail.");
    }

    _client = createClient({
      url: BUNNY_DB_URL,
      authToken: BUNNY_DB_TOKEN,
      fetch: async (input: any, init: any) => {
        try {
          const url = typeof input === 'string' ? input : input.url;
          const options = init || {};

          // Merge from Request if input is an object
          if (typeof input === 'object' && input !== null) {
            if (!options.method && input.method) options.method = input.method;
            if (!options.headers && input.headers) options.headers = input.headers;
            if (!options.body && input.body) options.body = input.body;
          }

          const resp = await fetch(url, options);
          if (resp.body && typeof (resp.body as any).cancel !== 'function') {
            const body = resp.body as any;
            body.cancel = async () => {
              if (typeof body.destroy === 'function') body.destroy();
              else if (typeof body.close === 'function') body.close();
            };
          }
          return resp;
        } catch (e) {
          logger.error("Fetch error in libSQL client wrapper:", e);
          throw e;
        }
      },
    });
    logger.info("libSQL client created successfully");
  }
  return _client;
}

/**
 * Get the remote Drizzle database instance.
 * Uses drizzle-orm/libsql which has the same query API as better-sqlite3
 * but all operations are async.
 */
export function getRemoteDb(): LibSQLDatabase<typeof schema> {
  if (!_remoteDb) {
    const client = getClient();
    _remoteDb = drizzle(client, { schema });
    logger.info("Remote Drizzle ORM instance initialized");
  }
  return _remoteDb;
}

/**
 * Test the remote database connection
 */
export async function testRemoteConnection(): Promise<boolean> {
  try {
    const client = getClient();
    await client.execute("SELECT 1 as test");
    return true;
  } catch (error) {
    logger.error("Remote DB connection test failed with error:", error);
    if (error instanceof Error) {
      logger.error("Error stack:", error.stack);
    }
    return false;
  }
}

/**
 * Initialize the remote database schema (create tables if not exist)
 */
export async function initializeRemoteSchema(): Promise<void> {
  const client = getClient();

  logger.info("Initializing remote database schema...");

  // Create tables in dependency order
  const statements = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      photo_url TEXT,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER,
      session_token TEXT,
      migration_status TEXT NOT NULL DEFAULT 'not_needed'
    )`,

    // User settings
    `CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      settings_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,

    // Apps
    `CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      github_org TEXT,
      github_repo TEXT,
      github_branch TEXT,
      supabase_project_id TEXT,
      supabase_parent_project_id TEXT,
      supabase_organization_slug TEXT,
      neon_project_id TEXT,
      neon_development_branch_id TEXT,
      neon_preview_branch_id TEXT,
      vercel_project_id TEXT,
      vercel_project_name TEXT,
      vercel_team_id TEXT,
      vercel_deployment_url TEXT,
      firebase_project_id TEXT,
      firebase_config TEXT,
      bunny_config TEXT,
      install_command TEXT,
      start_command TEXT,
      chat_context TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      theme_id TEXT
    )`,

    // Chats
    `CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      todo_id INTEGER,
      title TEXT,
      initial_commit_hash TEXT,
      is_plan INTEGER DEFAULT 0,
      plan_data TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // Messages
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      approval_state TEXT,
      source_commit_hash TEXT,
      commit_hash TEXT,
      request_id TEXT,
      max_tokens_used INTEGER,
      model TEXT,
      ai_messages_json TEXT,
      using_free_agent_mode_quota INTEGER,
      previous_response_id INTEGER,
      status TEXT DEFAULT 'completed',
      duration_ms INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // Chat logs
    `CREATE TABLE IF NOT EXISTS chat_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // Versions
    `CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      commit_hash TEXT NOT NULL,
      neon_db_timestamp TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, app_id, commit_hash)
    )`,

    // Prompts
    `CREATE TABLE IF NOT EXISTS prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // Language model providers
    `CREATE TABLE IF NOT EXISTS language_model_providers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      api_base_url TEXT NOT NULL,
      env_var_name TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // Language models
    `CREATE TABLE IF NOT EXISTS language_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      display_name TEXT NOT NULL,
      api_name TEXT NOT NULL,
      builtin_provider_id TEXT,
      custom_provider_id TEXT REFERENCES language_model_providers(id) ON DELETE CASCADE,
      description TEXT,
      max_output_tokens INTEGER,
      context_window INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // MCP servers
    `CREATE TABLE IF NOT EXISTS mcp_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      transport TEXT NOT NULL,
      command TEXT,
      args TEXT,
      env_json TEXT,
      headers_json TEXT,
      url TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // MCP tool consents
    `CREATE TABLE IF NOT EXISTS mcp_tool_consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      server_id INTEGER NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL,
      consent TEXT NOT NULL DEFAULT 'ask',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, server_id, tool_name)
    )`,

    // Custom themes
    `CREATE TABLE IF NOT EXISTS custom_themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      prompt TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // Notes
    `CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL DEFAULT 'Nueva nota',
      content TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // Todo sections
    `CREATE TABLE IF NOT EXISTS todo_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Nueva sección',
      "order" INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // Todos
    `CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      section_id INTEGER REFERENCES todo_sections(id) ON DELETE SET NULL,
      content TEXT NOT NULL DEFAULT '',
      description TEXT,
      prompt TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      "order" INTEGER NOT NULL DEFAULT 0,
      development_summary TEXT,
      checklist TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // Debates
    `CREATE TABLE IF NOT EXISTS debates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      summary TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // Debate messages
    `CREATE TABLE IF NOT EXISTS debate_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      debate_id INTEGER NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      is_summary INTEGER DEFAULT 0,
      injected_items TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // Debate tags
    `CREATE TABLE IF NOT EXISTS debate_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      color TEXT,
      UNIQUE(user_id, name)
    )`,

    // Debate to tags
    `CREATE TABLE IF NOT EXISTS debate_to_tags (
      debate_id INTEGER NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES debate_tags(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      UNIQUE(debate_id, tag_id)
    )`,

    // Knowledge entries
    `CREATE TABLE IF NOT EXISTS knowledge_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence INTEGER NOT NULL DEFAULT 100,
      enabled INTEGER NOT NULL DEFAULT 1,
      durability TEXT DEFAULT 'permanent',
      superseded_by INTEGER,
      last_confirmed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // AI query logs
    `CREATE TABLE IF NOT EXISTS ai_query_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      query_type TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_snippet TEXT NOT NULL,
      payload TEXT NOT NULL,
      response TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // Embeddings cache
    `CREATE TABLE IF NOT EXISTS embeddings_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      scope TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      content_key TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedding TEXT NOT NULL,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, scope, source_id, content_key, model)
    )`,

    // Dossiers (NEW — linked to apps)
    `CREATE TABLE IF NOT EXISTS dossiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      storage_path TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
  ];

  for (const sql of statements) {
    try {
      await client.execute(sql);
    } catch (error) {
      logger.error("Failed to execute schema statement:", error);
      throw error;
    }
  }

  logger.info("Remote database schema initialized successfully");
}
