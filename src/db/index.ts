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

    if (!columnNames.has("durability")) {
      logger.log("Adding missing 'durability' column to knowledge_entries");
      sqlite.exec(`ALTER TABLE \`knowledge_entries\` ADD \`durability\` text DEFAULT 'permanent'`);
    }
    if (!columnNames.has("superseded_by")) {
      logger.log("Adding missing 'superseded_by' column to knowledge_entries");
      sqlite.exec(`ALTER TABLE \`knowledge_entries\` ADD \`superseded_by\` integer`);
    }
    if (!columnNames.has("last_confirmed_at")) {
      logger.log("Adding missing 'last_confirmed_at' column to knowledge_entries");
      sqlite.exec(`ALTER TABLE \`knowledge_entries\` ADD \`last_confirmed_at\` integer`);
    }
  } catch (error) {
    logger.error("Error ensuring knowledge columns:", error);
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
