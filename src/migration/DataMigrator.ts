/**
 * DataMigrator — Reads all data from local SQLite (better-sqlite3)
 * and writes it to the remote Bunny Edge SQL database.
 *
 * Uses raw SQL on local DB to avoid Drizzle type/mode conflicts.
 * Writes to remote via raw SQL as well, to bypass Drizzle column type
 * mismatches (local stores timestamps as integers, remote schema declares
 * them as { mode: "timestamp" } which expects Date objects).
 *
 * Keeps original IDs to preserve foreign key relationships.
 * Idempotent: uses INSERT OR IGNORE for safe re-runs.
 */
import log from "electron-log";
import { BrowserWindow } from "electron";
import { db } from "../db/index";
import { getRemoteDb, getClient, initializeRemoteSchema } from "../db/remote";
import * as remoteSchema from "../db/remote-schema";

const logger = log.scope("data-migrator");

/**
 * Table migration order — respects foreign key dependencies.
 * Parent tables first, then children.
 */
const MIGRATION_ORDER = [
    "prompts",
    "apps",
    "notes",
    "language_model_providers",
    "language_models",
    "release_notes",
    "custom_themes",
    "mcp_servers",
    "mcp_tool_consents",
    "chats",
    "messages",
    "chat_logs",
    "versions",
    "todo_sections",
    "todos",
    "debates",
    "debate_messages",
    "debate_tags",
    "debate_to_tags",
    "knowledge_entries",
    "ai_query_logs",
    "embeddings_cache",
] as const;

/**
 * Estimate row counts for all local tables.
 */
export function estimateMigration(): { name: string; rowCount: number }[] {
    const localDb = db.$client;
    const result: { name: string; rowCount: number }[] = [];

    for (const tableName of MIGRATION_ORDER) {
        try {
            const stmt = localDb.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
            const row = stmt.get() as { count: number } | undefined;
            result.push({ name: tableName, rowCount: row?.count ?? 0 });
        } catch {
            // Table might not exist in older schemas
            result.push({ name: tableName, rowCount: 0 });
        }
    }

    return result;
}

/**
 * Broadcast migration progress to all renderer windows.
 */
function broadcastProgress(phase: string, table: string, current: number, total: number): void {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    const payload = { phase, table, current, total, percentage };

    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("migration:progress", payload);
    }
}

/**
 * Migrate a single table from local to remote using raw SQL.
 * Drizzle's ORM insert is bypassed to avoid timestamp Date conversion issues.
 */
async function migrateTable(
    tableName: string,
    userId: string,
    globalProcessed: number,
    totalEstimate: number,
): Promise<number> {
    const localDb = db.$client;
    const remoteClient = getClient();

    // Read all rows from local table
    let rows: any[];
    try {
        const stmt = localDb.prepare(`SELECT * FROM ${tableName}`);
        rows = stmt.all();
    } catch (error) {
        logger.warn(`Table ${tableName} does not exist locally, skipping`);
        return 0;
    }

    if (rows.length === 0) {
        return 0;
    }

    const BATCH_SIZE = 50;
    let processed = 0;

    // Get column names from the first row
    const sampleRow = rows[0];
    const localColumns = Object.keys(sampleRow);

    // All remote tables have user_id — add it
    const remoteColumns = [...localColumns, "user_id"];

    // Build INSERT OR IGNORE SQL statement
    const placeholders = remoteColumns.map(() => "?").join(", ");
    const columnNames = remoteColumns.map((col) => `"${col}"`).join(", ");
    const insertSql = `INSERT OR IGNORE INTO ${tableName} (${columnNames}) VALUES (${placeholders})`;

    // Process in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);

        try {
            // Execute each row as a separate INSERT OR IGNORE via raw SQL
            for (const row of batch) {
                const values = localColumns.map((col) => row[col]);
                values.push(userId); // Add user_id at the end
                await remoteClient.execute({ sql: insertSql, args: values });
            }
        } catch (error: any) {
            logger.error(`Error migrating batch in ${tableName}:`, error.message || error);
            // Continue with remaining batches
        }

        processed += batch.length;
        broadcastProgress("Migrating", tableName, globalProcessed + processed, totalEstimate);
    }

    logger.info(`Migrated ${processed} rows from ${tableName}`);
    return processed;
}

/**
 * Run the full migration from local SQLite to remote Bunny Edge SQL.
 */
export async function runMigration(userId: string): Promise<{
    success: boolean;
    tablesProcessed: number;
    totalRows: number;
}> {
    logger.info("Starting data migration for user:", userId);

    // Ensure remote schema exists
    await initializeRemoteSchema();

    let tablesProcessed = 0;
    let totalRows = 0;

    broadcastProgress("Preparing", "Estimating data...", 0, 1);

    // Get total estimate
    const estimates = estimateMigration();
    const totalEstimate = estimates.reduce((sum, e) => sum + e.rowCount, 0);
    let globalProcessed = 0;
    let hasErrors = false;

    for (const tableName of MIGRATION_ORDER) {
        broadcastProgress("Migrating", tableName, globalProcessed, totalEstimate);

        const tableEstimate = estimates.find(e => e.name === tableName)?.rowCount ?? 0;

        if (tableEstimate === 0) {
            continue;
        }

        try {
            const rowsMigrated = await migrateTable(tableName, userId, globalProcessed, totalEstimate);

            globalProcessed += rowsMigrated;
            totalRows += rowsMigrated;
            tablesProcessed++;
        } catch (error) {
            logger.error(`Failed to migrate table ${tableName}:`, error);
            hasErrors = true;
            // Continue with other tables
        }
    }

    // Mark migration as completed in user record ONLY if no fatal errors
    if (!hasErrors) {
        try {
            const remoteClient = getClient();
            await remoteClient.execute({
                sql: `UPDATE users SET migration_status = 'completed' WHERE id = ?`,
                args: [userId],
            });
            logger.info(`Migration marked as completed for ${userId}`);
        } catch (error) {
            logger.error("Failed to update migration status:", error);
        }
    } else {
        logger.warn(`Migration finished with errors. Status NOT marked as completed.`);
    }

    broadcastProgress("Complete", "¡Migración completada!", totalEstimate, totalEstimate);

    logger.info(`Migration complete: ${tablesProcessed} tables, ${totalRows} rows`);

    return {
        success: !hasErrors,
        tablesProcessed,
        totalRows,
    };
}

/**
 * Reset migration status for a user (for testing)
 */
export async function resetMigration(userId: string): Promise<boolean> {
    try {
        const remoteClient = getClient();
        await remoteClient.execute({
            sql: `UPDATE users SET migration_status = 'pending' WHERE id = ?`,
            args: [userId],
        });
        logger.info(`Migration status reset to 'pending' for ${userId}`);
        return true;
    } catch (error) {
        logger.error("Failed to reset migration status:", error);
        return false;
    }
}
