// db.ts
import {
  type BetterSQLite3Database,
  drizzle,
} from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import fs from "node:fs";
import { getDyadAppPath, getUserDataPath } from "../paths/paths";
import log from "electron-log";

const logger = log.scope("db");

/**
 * Known migrations that might have been applied without recording
 * Format: { tableName: { hash: string, created_at: number } }
 */
const ORPHANED_MIGRATION_FIXES: Record<
  string,
  { hash: string; created_at: number }
> = {
  // Migration 0031_perfect_titanium_man.sql - creates todo_sections table
  todo_sections: {
    hash: "81998c23b15504ffb86df0e9e6d3bcd1c3c4487e0fce304d82e66fe49e14a293",
    created_at: 1770540464274,
  },
};

/**
 * Fix orphaned migrations where tables exist but migration records are missing.
 * This can happen if the app crashed mid-migration or database was restored.
 */
function fixOrphanedMigrations(sqlite: Database.Database): void {
  try {
    for (const [tableName, migrationInfo] of Object.entries(
      ORPHANED_MIGRATION_FIXES,
    )) {
      // Check if the table exists
      const tableExists = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(tableName);

      if (!tableExists) continue;

      // Check if migration record exists
      const migrationExists = sqlite
        .prepare(`SELECT 1 FROM __drizzle_migrations WHERE hash = ?`)
        .get(migrationInfo.hash);

      if (!migrationExists) {
        logger.log(
          `Fixing orphaned migration for table "${tableName}" - adding migration record`,
        );
        sqlite
          .prepare(
            `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`,
          )
          .run(migrationInfo.hash, migrationInfo.created_at);
      }
    }
  } catch (error) {
    // If __drizzle_migrations doesn't exist yet, that's fine - migrations will create it
    logger.log(
      "Orphaned migration check skipped (migrations table may not exist yet)",
    );
  }
}

/**
 * Ensure required columns exist in knowledge_entries table.
 * Migration 0040 adds durability, superseded_by, and last_confirmed_at but can
 * fail if the migration was partially applied. This is a safety net.
 * When columns are ensured, also mark migration 0040 as applied so migrate() skips it.
 */
function ensureKnowledgeColumns(sqlite: Database.Database): void {
  try {
    const tableExists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_entries'`)
      .get();
    if (!tableExists) return;

    const columns = sqlite
      .prepare(`PRAGMA table_info(knowledge_entries)`)
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((c) => c.name));

    let columnsAdded = false;

    if (!columnNames.has("durability")) {
      logger.log("Adding missing 'durability' column to knowledge_entries");
      sqlite.exec(`ALTER TABLE \`knowledge_entries\` ADD \`durability\` text DEFAULT 'permanent'`);
      columnsAdded = true;
    }
    if (!columnNames.has("superseded_by")) {
      logger.log("Adding missing 'superseded_by' column to knowledge_entries");
      sqlite.exec(`ALTER TABLE \`knowledge_entries\` ADD \`superseded_by\` integer`);
      columnsAdded = true;
    }
    if (!columnNames.has("last_confirmed_at")) {
      logger.log("Adding missing 'last_confirmed_at' column to knowledge_entries");
      sqlite.exec(`ALTER TABLE \`knowledge_entries\` ADD \`last_confirmed_at\` integer`);
      columnsAdded = true;
    }

    // If columns already exist (or were just added), ensure migration 0040 is recorded
    // so that migrate() doesn't try to re-add them and crash
    const MIGRATION_0040_HASH = "465652dbf63a5cb30415f442ff29e9b4f7cec3a44be6d4a271a308b2c107dfa0";
    const MIGRATION_0040_CREATED_AT = 1771008266213;

    try {
      const migrationsTableExists = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`)
        .get();

      if (migrationsTableExists) {
        const migrationExists = sqlite
          .prepare(`SELECT 1 FROM __drizzle_migrations WHERE hash = ?`)
          .get(MIGRATION_0040_HASH);

        if (!migrationExists) {
          logger.log("Marking migration 0040 (knowledge columns) as applied");
          sqlite
            .prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`)
            .run(MIGRATION_0040_HASH, MIGRATION_0040_CREATED_AT);
        }
      }
    } catch (migError) {
      logger.log("Could not mark migration 0040 as applied (will likely be handled by migrate)");
    }
  } catch (error) {
    logger.error("Error ensuring knowledge columns:", error);
  }
}

/**
 * Ensure the is_plan column exists in chats table.
 * Migration 0040_mixed_red_hulk adds this column but can fail if db:push already applied it.
 * When the column is ensured, also mark migration 0040_mixed_red_hulk as applied so migrate() skips it.
 */
function ensureChatsIsPlanColumn(sqlite: Database.Database): void {
  try {
    const tableExists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='chats'`)
      .get();
    if (!tableExists) return;

    const columns = sqlite
      .prepare(`PRAGMA table_info(chats)`)
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has("is_plan")) {
      logger.log("Adding missing 'is_plan' column to chats");
      sqlite.exec(`ALTER TABLE \`chats\` ADD \`is_plan\` integer DEFAULT false`);
    }

    // Whether column already existed or was just added, ensure migration is recorded
    const MIGRATION_HASH = "a2aabf4fc6dd33661c1a4def26c8c3022570593c9c524e7b466ee080bf713d68";
    const MIGRATION_CREATED_AT = 1771110607425;

    try {
      const migrationsTableExists = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`)
        .get();

      if (migrationsTableExists) {
        const migrationExists = sqlite
          .prepare(`SELECT 1 FROM __drizzle_migrations WHERE hash = ?`)
          .get(MIGRATION_HASH);

        if (!migrationExists) {
          logger.log("Marking migration 0040_mixed_red_hulk (is_plan) as applied");
          sqlite
            .prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`)
            .run(MIGRATION_HASH, MIGRATION_CREATED_AT);
        }
      }
    } catch (migError) {
      logger.log("Could not mark migration 0040_mixed_red_hulk as applied");
    }
  } catch (error) {
    logger.error("Error ensuring chats is_plan column:", error);
  }
}

/**
 * Ensure the plan_data column exists in chats table.
 */
function ensureChatsPlanDataColumn(sqlite: Database.Database): void {
  try {
    const tableExists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='chats'`)
      .get();
    if (!tableExists) return;

    const columns = sqlite
      .prepare(`PRAGMA table_info(chats)`)
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has("plan_data")) {
      logger.log("Adding missing 'plan_data' column to chats");
      sqlite.exec(`ALTER TABLE \`chats\` ADD \`plan_data\` text`);
    }

    // Ensure migration 0041 is recorded
    const MIGRATION_HASH_PLAN_DATA = "755d79856101ae8f46da1ce66f9bc2e7b285d1c52860f09c7424e04fc7f34a60";
    const MIGRATION_CREATED_AT_PLAN_DATA = 1771148269145;

    try {
      const migrationsTableExists = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`)
        .get();

      if (migrationsTableExists) {
        const migrationExists = sqlite
          .prepare(`SELECT 1 FROM __drizzle_migrations WHERE hash = ?`)
          .get(MIGRATION_HASH_PLAN_DATA);

        if (!migrationExists) {
          logger.log("Marking migration 0041 (plan_data) as applied");
          sqlite
            .prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`)
            .run(MIGRATION_HASH_PLAN_DATA, MIGRATION_CREATED_AT_PLAN_DATA);
        }
      }
    } catch (migError) {
      logger.log("Could not record plan_data migration status");
    }
  } catch (error) {
    logger.error("Error ensuring chats plan_data column:", error);
  }
}

/**
 * Ensure the previous_response_id and status columns exist in messages table.
 * These columns were added to the schema for agent state recovery but no
 * Drizzle migration was generated. This is a safety net for existing databases.
 */
function ensureMessagesAgentColumns(sqlite: Database.Database): void {
  try {
    const tableExists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='messages'`)
      .get();
    if (!tableExists) return;

    const columns = sqlite
      .prepare(`PRAGMA table_info(messages)`)
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has("previous_response_id")) {
      logger.log("Adding missing 'previous_response_id' column to messages");
      sqlite.exec(`ALTER TABLE \`messages\` ADD \`previous_response_id\` integer`);
    }
    if (!columnNames.has("status")) {
      logger.log("Adding missing 'status' column to messages");
      sqlite.exec(`ALTER TABLE \`messages\` ADD \`status\` text DEFAULT 'completed'`);
    }
  } catch (error) {
    logger.error("Error ensuring messages agent columns:", error);
  }
}

/**
 * Ensure the duration_ms column exists in messages table.
 * Migration 0043 adds this column but can fail if partially applied.
 */
function ensureMessagesDurationColumn(sqlite: Database.Database): void {
  try {
    const tableExists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='messages'`)
      .get();
    if (!tableExists) return;

    const columns = sqlite
      .prepare(`PRAGMA table_info(messages)`)
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has("duration_ms")) {
      logger.log("Adding missing 'duration_ms' column to messages");
      sqlite.exec(`ALTER TABLE \`messages\` ADD \`duration_ms\` integer`);
    }

    // Ensure migration 0043 is recorded so migrate() skips it
    const MIGRATION_0043_HASH_PLACEHOLDER = "duration_ms_migration_0043";
    const MIGRATION_0043_CREATED_AT = 1771700000000;

    try {
      const migrationsTableExists = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`)
        .get();

      if (migrationsTableExists) {
        // Check if the column already exists and migration is not recorded
        // We check by content since we don't know the real hash until drizzle-kit generates it
        const existingMigration = sqlite
          .prepare(`SELECT 1 FROM __drizzle_migrations WHERE created_at = ?`)
          .get(MIGRATION_0043_CREATED_AT);

        if (!existingMigration && columnNames.has("duration_ms")) {
          // Column exists but migration not recorded — will be handled by migrate()
          logger.log("duration_ms column exists, migration record will be handled by migrate()");
        }
      }
    } catch (migError) {
      logger.log("Could not check migration 0043 status");
    }
  } catch (error) {
    logger.error("Error ensuring messages duration_ms column:", error);
  }
}

/**
 * Ensure the embeddings_cache table exists.
 * Migration 0042_sad_iron_fist creates this table but can fail on upgrade.
 * This is a safety net that creates the table if missing and marks the migration as applied.
 */
function ensureEmbeddingsCacheTable(sqlite: Database.Database): void {
  try {
    const tableExists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings_cache'`)
      .get();

    if (!tableExists) {
      logger.log("Creating missing 'embeddings_cache' table (migration fallback)");
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS \`embeddings_cache\` (
          \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          \`scope\` text NOT NULL,
          \`source_id\` integer NOT NULL,
          \`content_key\` text NOT NULL,
          \`content_hash\` text NOT NULL,
          \`embedding\` text NOT NULL,
          \`model\` text NOT NULL,
          \`dimensions\` integer NOT NULL,
          \`created_at\` integer DEFAULT (unixepoch()) NOT NULL
        )
      `);
      sqlite.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS \`embeddings_scope_source_key_model\`
          ON \`embeddings_cache\` (\`scope\`, \`source_id\`, \`content_key\`, \`model\`)
      `);
    }

    // Ensure the index exists even if table was partially created
    const indexExists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='embeddings_scope_source_key_model'`)
      .get();
    if (!indexExists) {
      sqlite.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS \`embeddings_scope_source_key_model\`
          ON \`embeddings_cache\` (\`scope\`, \`source_id\`, \`content_key\`, \`model\`)
      `);
    }

    // Mark migration 0042 as applied so migrate() skips it
    const MIGRATION_0042_HASH = "f601278af7fdde66d4c53494515f825e571a85672d6cc8f139f51c6f7efb9636";
    const MIGRATION_0042_CREATED_AT = 1771607647967;

    try {
      const migrationsTableExists = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`)
        .get();

      if (migrationsTableExists) {
        const migrationExists = sqlite
          .prepare(`SELECT 1 FROM __drizzle_migrations WHERE hash = ?`)
          .get(MIGRATION_0042_HASH);

        if (!migrationExists) {
          logger.log("Marking migration 0042 (embeddings_cache) as applied");
          sqlite
            .prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`)
            .run(MIGRATION_0042_HASH, MIGRATION_0042_CREATED_AT);
        }
      }
    } catch (migError) {
      logger.log("Could not mark migration 0042 as applied (will likely be handled by migrate)");
    }
  } catch (error) {
    logger.error("Error ensuring embeddings_cache table:", error);
  }
}

/**
 * Ensure the bunny_config column exists in apps table.
 * Migration 0044 adds this column but can fail on existing databases.
 */
function ensureBunnyConfigColumn(sqlite: Database.Database): void {
  try {
    const tableExists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='apps'`)
      .get();
    if (!tableExists) return;

    const columns = sqlite
      .prepare(`PRAGMA table_info(apps)`)
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has("bunny_config")) {
      logger.log("Adding missing 'bunny_config' column to apps");
      sqlite.exec(`ALTER TABLE \`apps\` ADD \`bunny_config\` text`);
    }
  } catch (error) {
    logger.error("Error ensuring bunny_config column:", error);
  }
}

// Database connection factory
let _db: ReturnType<typeof drizzle> | null = null;
let _dbInitializing = false;
let _dbInitPromise: Promise<void> | null = null;

/**
 * Get the database path based on the current environment
 */
export function getDatabasePath(): string {
  return path.join(getUserDataPath(), "sqlite.db");
}

/**
 * Initialize the database connection
 * Can be called multiple times safely - will return immediately if already initialized
 */
export function initializeDatabase(): BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
} {
  if (_db) return _db as any;

  const dbPath = getDatabasePath();
  logger.log("Initializing database at:", dbPath);

  // Check if the database file exists and remove it if it has issues
  try {
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      if (stats.size < 100) {
        logger.log("Database file exists but may be corrupted. Removing it...");
        fs.unlinkSync(dbPath);
      }
    }
  } catch (error) {
    logger.error("Error checking database file:", error);
  }

  fs.mkdirSync(getUserDataPath(), { recursive: true });
  fs.mkdirSync(getDyadAppPath("."), { recursive: true });

  const sqlite = new Database(dbPath, { timeout: 10000 });
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");

  _db = drizzle(sqlite, { schema });

  try {
    // In development: drizzle folder is at project root
    // In production (packaged): drizzle folder is in resources/ (extraResource)

    // DEFAULT: Try to use the resources folder first (Production/Packaged priority)
    // This allows creating new migrations in the external folder which overrides internal/asar ones
    let migrationsFolder = path.join(process.resourcesPath, "drizzle");

    // FALLBACK: If not found (Likely Development), look at project root using __dirname
    if (!fs.existsSync(migrationsFolder)) {
      migrationsFolder = path.join(__dirname, "..", "..", "drizzle");
    }

    if (!fs.existsSync(migrationsFolder)) {
      logger.error("Migrations folder not found (Critical):", migrationsFolder);
      throw new Error(`Migrations folder not found at: ${migrationsFolder}`);
    } else {
      // Fix orphaned migrations before running migrate()
      // This handles the case where a table exists but the migration record is missing
      fixOrphanedMigrations(sqlite);

      // Ensure knowledge_entries has all required columns (safety net for migration 0040)
      ensureKnowledgeColumns(sqlite);

      // Ensure chats has is_plan column (safety net for migration 0040_mixed_red_hulk)
      ensureChatsIsPlanColumn(sqlite);

      // Ensure chats has plan_data column (safety net for migration 0041)
      ensureChatsPlanDataColumn(sqlite);

      // Ensure messages has previous_response_id and status columns (agent recovery)
      ensureMessagesAgentColumns(sqlite);

      // Ensure messages has duration_ms column (response timer, migration 0043)
      ensureMessagesDurationColumn(sqlite);

      // Ensure embeddings_cache table exists (semantic search, migration 0042 fallback)
      ensureEmbeddingsCacheTable(sqlite);

      // Ensure apps has bunny_config column (Bunny.net integration, migration 0044 fallback)
      ensureBunnyConfigColumn(sqlite);

      logger.log("Running migrations from:", migrationsFolder);
      migrate(_db, { migrationsFolder });
    }
  } catch (error) {
    logger.error("Migration error:", error);
    // Rethrow the error to prevent the app from starting with a broken database state
    throw error;
  }

  logger.log("Database initialized successfully");
  return _db as any;
}

/**
 * Get the database instance (initializes if not already initialized)
 * This ensures DB is always ready when accessed
 */
export function getDb(): BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
} {
  if (!_db) {
    // Auto-initialize if not already done
    logger.warn(
      "Database accessed before initialization - auto-initializing now",
    );
    return initializeDatabase();
  }
  return _db as any;
}

export const db = new Proxy({} as any, {
  get(target, prop) {
    const database = getDb();
    return database[prop as keyof typeof database];
  },
}) as BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};
