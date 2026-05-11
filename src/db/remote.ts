/**
 * Remote database connection using @libsql/client + drizzle-orm/libsql
 * Connects to Bunny Edge SQL (minube-vibes database)
 */
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./remote-schema";
import log from "electron-log";
import { retryWithRateLimit } from "../ipc/utils/retryWithRateLimit";
const logger = log.scope("remote-db");

// Bunny Edge SQL credentials (hardcoded — private project)
const BUNNY_DB_URL =
  "libsql://01KJ783WM1SD8X465A3VPAGHG6-minube-vibes.lite.bunnydb.net/";
const BUNNY_DB_TOKEN =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJtaW51YmUtdmliZXMiXSwidGFncyI6bnVsbH0sInJvYSI6bnVsbCwicndhIjpudWxsLCJkZGwiOm51bGx9LCJpYXQiOjE3NzE5MTc0MDl9.m-5EAVWjKG0kPM72fPFpeAg25seNnUY65gtSzTJlhnD697C1mmCRoXZWkmcreHoV9vTRw22supEVIp342D_2CA";

let _client: Client | null = null;
let _remoteDb: LibSQLDatabase<typeof schema> | null = null;
let _remoteSchemaInitialized = false;

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
        return retryWithRateLimit(
          async () => {
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
          },
          "libSQL-fetch",
          { maxRetries: 3, baseDelay: 1_000, maxDelay: 10_000 },
        );
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
 * Initialize the remote database schema.
 *
 * The schema is fully defined by Drizzle ORM in `remote-schema.ts` and all
 * tables/columns already exist in the production Bunny Edge SQL database.
 * No DDL is executed at runtime — this function is a no-op guard that
 * ensures callers can safely assume the schema is ready.
 *
 * To recreate the schema from scratch (disaster recovery):
 *   npx drizzle-kit push
 *
 * Historical migrations (all applied — kept as documentation):
 *   - ALTER TABLE chats ADD COLUMN last_read_at INTEGER
 *   - ALTER TABLE chats ADD COLUMN is_read INTEGER NOT NULL DEFAULT 1
 *   - ALTER TABLE chats ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0
 *   - ALTER TABLE chats ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0
 *   - ALTER TABLE todos ADD COLUMN attachments TEXT
 *   - ALTER TABLE messages ADD COLUMN smart_mode_intent TEXT
 *   - ALTER TABLE messages ADD COLUMN injected_memories TEXT
 *   - ALTER TABLE apps ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0
 *   - ALTER TABLE memories ADD COLUMN last_used INTEGER
 *   - CREATE TABLE memory_telemetry (...)
 *   - CREATE TABLE memory_pipeline_logs (...)
 *   - CREATE TABLE artifact_comments (...)
 */
export async function initializeRemoteSchema(): Promise<void> {
  try {
    const client = getClient();
    // Auto-create artifact_comments if missing (added v8.5)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS artifact_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artifact_id INTEGER NOT NULL REFERENCES chat_artifacts(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id),
        selected_text TEXT,
        block_ref TEXT,
        comment TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    // Add accepted column if missing (added v8.5)
    await client.execute(`ALTER TABLE chat_artifacts ADD COLUMN accepted INTEGER DEFAULT 0`).catch(() => {});
    
    // Auto-create chat_labels if missing
    await client.execute(`
      CREATE TABLE IF NOT EXISTS chat_labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id),
        label TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    // Auto-create language_models if missing (custom model presets)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS language_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id),
        display_name TEXT NOT NULL,
        api_name TEXT NOT NULL,
        builtin_provider_id TEXT,
        custom_provider_id TEXT,
        description TEXT,
        max_output_tokens INTEGER,
        context_window INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).catch(() => {});
  } catch (e) {
    logger.warn("schema migration (non-fatal):", e);
  }
  _remoteSchemaInitialized = true;
}
