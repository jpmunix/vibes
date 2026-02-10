import { createTypedHandler } from "./base";
import { backupContracts } from "../types/backup";
import { getSettingsFilePath } from "../../main/settings";
import { getDatabasePath, getDb } from "../../db";
import { getUserDataPath } from "@/paths/paths";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import zlib from "node:zlib";
import log from "electron-log";

const logger = log.scope("backup_handlers");

// Internal function to perform backup logic, reusable by scheduler
export async function performBackupInternal(params: {
    includeSettings: boolean;
    includeDatabase: boolean;
    includeStats: boolean;
}) {
    const { includeSettings, includeDatabase, includeStats } = params;
    const backupData: Array<{ name: string; content: string; contentType: string }> = [];

    try {
        if (includeSettings) {
            const settingsPath = getSettingsFilePath();
            if (fs.existsSync(settingsPath)) {
                const content = fs.readFileSync(settingsPath);
                backupData.push({
                    name: "user-settings.json",
                    content: content.toString("base64"),
                    contentType: "application/json"
                });
            }
        }

        if (includeDatabase) {
            const dbPath = getDatabasePath();
            if (fs.existsSync(dbPath)) {
                // Strategy: Use native backup API to avoid locs/corruption + Gzip compression
                const tempBackupPath = path.join(os.tmpdir(), `backup-${Date.now()}.db`);

                try {
                    logger.info("Starting database backup to temp file:", tempBackupPath);

                    // 1. Create consistent backup using better-sqlite3 native API
                    // This uses a separate thread and doesn't block the main process or lock the DB
                    await getDb().$client.backup(tempBackupPath);

                    // 2. Read the temp backup file
                    const dbBuffer = fs.readFileSync(tempBackupPath);

                    // 3. Compress using Gzip (Sync is fine for <100MB here, or use async if needed)
                    // For 30MB, gzipSync is very fast (< 1s)
                    const compressedBuffer = zlib.gzipSync(dbBuffer);

                    backupData.push({
                        name: "sqlite.db.gz",
                        content: compressedBuffer.toString("base64"),
                        contentType: "application/gzip"
                    });

                    // 4. Cleanup temp file
                    fs.unlinkSync(tempBackupPath);

                    logger.info(`Database backup completed. Size: ${dbBuffer.length} -> ${compressedBuffer.length} bytes`);
                } catch (dbError) {
                    logger.error("Error during database backup/compression:", dbError);
                    // Fallback? No, improved safety means we fail if we can't do it right.
                    // But maybe allow "raw" read if backup API fails? 
                    // Better to just throw and let user know.
                    if (fs.existsSync(tempBackupPath)) {
                        try { fs.unlinkSync(tempBackupPath); } catch { }
                    }
                    throw dbError;
                }
            }
        }

        if (includeStats) {
            const statsPath = path.join(getUserDataPath(), "token-stats.jsonl");
            if (fs.existsSync(statsPath)) {
                const content = fs.readFileSync(statsPath);
                backupData.push({
                    name: "token-stats.jsonl",
                    content: content.toString("base64"),
                    contentType: "application/json" // corrected from jsonl to json or similar is fine
                });
            }
        }

        return {
            success: true,
            message: "Datos listos para subir a Firebase (Comprimidos)",
            backupData
        };
    } catch (error: any) {
        logger.error("Backup data collection failed:", error);
        return {
            success: false,
            message: error.message || "Error al generar backup",
            backupData: []
        };
    }
}

export function registerBackupHandlers() {
    createTypedHandler(backupContracts.performBackup, async (_, params) => {
        return performBackupInternal(params);
    });
}
