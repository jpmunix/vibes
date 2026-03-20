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
import { readSettings } from "../main/settings";
import { readTokenStats } from "../ipc/utils/token_stats_logger";

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
 * Migrate local `user-settings.json` to remote `user_settings` table.
 */
async function migrateUserSettings(userId: string): Promise<boolean> {
    try {
        const settings = readSettings();
        const remoteClient = getClient();

        // Ensure we don't overwrite user settings if they already exist in remote
        const existing = await remoteClient.execute({
            sql: `SELECT id FROM user_settings WHERE user_id = ?`,
            args: [userId],
        });

        if (existing.rows.length === 0) {
            await remoteClient.execute({
                sql: `INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?, ?, ?)`,
                // We use UTC string for mode: "timestamp" fallback, or milliseconds.
                // Usually mode timestamp saves Date values. Here we pass Date.now() integer or ISO parsing.
                args: [userId, JSON.stringify(settings), Date.now()],
            });
            logger.info("Local user-settings.json migrated successfully to user_settings table");
        }
        return true;
    } catch (error) {
        logger.error("Error migrating user-settings.json:", error);
        return false;
    }
}

/**
 * Migrate local `token-stats.jsonl` to remote `ai_query_logs` table.
 */
async function migrateTokenStats(userId: string): Promise<boolean> {
    try {
        const stats = readTokenStats(100000); // Read all stats
        if (stats.length === 0) return true;

        const remoteClient = getClient();

        // Check if there are already records migrated to avoid duplicating them
        const existing = await remoteClient.execute({
            sql: `SELECT id FROM ai_query_logs WHERE user_id = ? LIMIT 1`,
            args: [userId],
        });

        if (existing.rows.length > 0) {
            return true; // Likely already migrated
        }

        let count = 0;
        for (const stat of stats) {
            await remoteClient.execute({
                sql: `
                    INSERT INTO ai_query_logs 
                    (user_id, app_id, model, input_tokens, output_tokens, total_execution_time_ms, operation_type, payload, created_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                args: [
                    userId,
                    stat.appId ?? null,
                    stat.model ?? "unknown",
                    stat.promptTokens ?? 0,
                    stat.completionTokens ?? 0,
                    0,
                    stat.source || "chat",
                    JSON.stringify(stat),
                    stat.timestamp ?? Date.now(),
                ],
            });
            count++;
        }

        logger.info(`Migrated ${count} token stats from jsonl successfully to ai_query_logs table`);
        return true;
    } catch (error) {
        logger.error("Error migrating token-stats.jsonl:", error);
        return false;
    }
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

    // After SQLite migration, migrate JSON file states 
    broadcastProgress("Migrating", "Ajustes (user-settings)", totalEstimate, totalEstimate);
    const settingsSuccess = await migrateUserSettings(userId);
    if (!settingsSuccess) hasErrors = true;

    broadcastProgress("Migrating", "Log de Tokens (jsonl)", totalEstimate, totalEstimate);
    const tokensSuccess = await migrateTokenStats(userId);
    if (!tokensSuccess) hasErrors = true;

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
