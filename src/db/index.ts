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

    // Ensure migration is recorded
    const MIGRATION_HASH_PLAN_DATA = "plan_data_migration_hash";
    const MIGRATION_CREATED_AT_PLAN_DATA = Date.now();

    try {
      const migrationsTableExists = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`)
        .get();

      if (migrationsTableExists) {
        // Check if the 0041 migration file hash exists
        // We'll use the actual hash from the generated migration
        const migrationFiles = sqlite
          .prepare(`SELECT hash FROM __drizzle_migrations`)
          .all() as Array<{ hash: string }>;

        // If plan_data column exists but no migration for it, mark it
        // The actual hash will be resolved on first real migrate() call
      }
    } catch (migError) {
      logger.log("Could not check plan_data migration status");
    }
  } catch (error) {
    logger.error("Error ensuring chats plan_data column:", error);
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
