/**
 * IPC handlers for data migration (local SQLite → remote Bunny).
 */
import log from "electron-log";
import { createTypedHandler } from "./base";
import { migrationContracts } from "../types/migration";
import { estimateMigration, runMigration, resetMigration } from "../../migration/DataMigrator";

const logger = log.scope("migration-handlers");

export function registerMigrationHandlers(): void {
    logger.info("Registering migration handlers...");

    // ─── ESTIMATE ──────────────────────────────────────────────────────────
    createTypedHandler(migrationContracts.getMigrationEstimate, async (_event, _input) => {
        const tables = estimateMigration();
        const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);
        return { tables, totalRows };
    });

    // ─── START MIGRATION ───────────────────────────────────────────────────
    createTypedHandler(migrationContracts.startMigration, async (_event, input) => {
        logger.info("Starting migration for user:", input.userId);
        const result = await runMigration(input.userId);
        return result;
    });

    // ─── RESET MIGRATION ───────────────────────────────────────────────────
    createTypedHandler(migrationContracts.resetMigration, async (_event, input) => {
        logger.info("Resetting migration for user:", input.userId);
        const success = await resetMigration(input.userId);
        return { success };
    });

    logger.info("Migration handlers registered");
}
