// db.ts — Local SQLite database (legacy, kept minimal for Drizzle ORM)
import {
  type BetterSQLite3Database,
  drizzle,
} from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import fs from "node:fs";
import { getVibesAppPath, getUserDataPath } from "../paths/paths";
import log from "electron-log";

const logger = log.scope("db");

// Database connection factory
let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Get the database path based on the current environment
 */
export function getDatabasePath(): string {
  return path.join(getUserDataPath(), "sqlite.db");
}

/**
 * Initialize the database connection.
 * Can be called multiple times safely — returns immediately if already initialized.
 */
export function initializeDatabase(): BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
} {
  if (_db) return _db as any;

  const dbPath = getDatabasePath();
  logger.log("Initializing database at:", dbPath);

  // Remove corrupted database files
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
  fs.mkdirSync(getVibesAppPath("."), { recursive: true });

  const sqlite = new Database(dbPath, { timeout: 10000 });
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");

  _db = drizzle(sqlite, { schema });

  try {
    // Production: drizzle folder is in resources/ (extraResource)
    let migrationsFolder = path.join(process.resourcesPath, "drizzle");

    // Development fallback: project root
    if (!fs.existsSync(migrationsFolder)) {
      migrationsFolder = path.join(__dirname, "..", "..", "drizzle");
    }

    if (!fs.existsSync(migrationsFolder)) {
      logger.error("Migrations folder not found (Critical):", migrationsFolder);
      throw new Error(`Migrations folder not found at: ${migrationsFolder}`);
    }

    logger.log("Running migrations from:", migrationsFolder);
    migrate(_db, { migrationsFolder });
  } catch (error) {
    logger.error("Migration error:", error);
    throw error;
  }

  logger.log("Database initialized successfully");
  return _db as any;
}

/**
 * Get the database instance (initializes if not already initialized).
 */
export function getDb(): BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
} {
  if (!_db) {
    logger.warn("Database accessed before initialization — auto-initializing now");
    return initializeDatabase();
  }
  return _db as any;
}

/**
 * Lazy proxy for the database — auto-initializes on first access.
 */
export const db = new Proxy({} as any, {
  get(target, prop) {
    const database = getDb();
    return database[prop as keyof typeof database];
  },
}) as BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};
