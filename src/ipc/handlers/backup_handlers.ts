import { createTypedHandler, HandlerContext } from "./base";
import { backupContracts } from "../types/backup";
import { getSettingsFilePath } from "../../main/settings";
import { getDatabasePath, getDb } from "../../db";
import { getUserDataPath } from "@/paths/paths";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import https from "node:https";
import log from "electron-log";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";

const logger = log.scope("backup_handlers");

/**
 * Create a safe backup of the SQLite database using the backup API
 * This prevents corruption issues that can occur with direct file copying
 */
async function backupDatabase(sourcePath: string, destPath: string): Promise<void> {
    const source = new Database(sourcePath, { readonly: true });

    try {
        // Use SQLite's backup API for safe database copying
        // The backup() method accepts a destination path and returns a promise
        await source.backup(destPath);
    } finally {
        source.close();
    }
}

export function registerBackupHandlers() {
    createTypedHandler(backupContracts.performBackup, async (_, params, context) => {
        if (!context.userId) throw new Error(\"Unauthorized\");
        const { includeSettings, includeDatabase, includeStats } = params;

        // Create a temporary directory for the backup files
        const tempDir = path.join(os.tmpdir(), `vibes-backup-${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });

        try {
            const zip = new AdmZip();

            // Add settings file
            if (includeSettings) {
                const settingsPath = getSettingsFilePath();
                if (fs.existsSync(settingsPath)) {
                    logger.log("Adding settings to backup");
                    zip.addLocalFile(settingsPath, "", "user-settings.json");
                }
            }

            // ----------------------------------------------------
            // NOTE: Local database backup is disabled in V3
            // because the data is now stored remotely (Bunny).
            // ----------------------------------------------------
            if (includeDatabase) {
                logger.warn("El backup de la base de datos local está deshabilitado.");
            }

            // Add stats file
            if (includeStats) {
                const statsPath = path.join(getUserDataPath(), "token-stats.jsonl");
                if (fs.existsSync(statsPath)) {
                    logger.log("Adding stats to backup");
                    zip.addLocalFile(statsPath, "", "token-stats.jsonl");
                }
            }

            // Generate the ZIP file as a buffer
            const zipBuffer = zip.toBuffer();

            logger.log(`Backup ZIP created, size: ${(zipBuffer.length / 1024).toFixed(2)} KB`);

            return {
                success: true,
                message: "Backup ZIP creado correctamente",
                backupData: [{
                    name: "backup.zip",
                    content: zipBuffer.toString("base64"),
                    contentType: "application/zip"
                }]
            };
        } catch (error: any) {
            logger.error("Backup creation failed:", error);
            return {
                success: false,
                message: error.message || "Error al crear el backup",
                backupData: []
            };
        } finally {
            // Clean up temp directory
            try {
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            } catch (cleanupError) {
                logger.warn("Failed to clean up temp directory:", cleanupError);
            }
        }
    });

    createTypedHandler(backupContracts.restoreBackup, async (_, params, context) => {
        if (!context.userId) throw new Error(\"Unauthorized\");
        const { downloadUrl } = params;

        // Create a temporary directory for extraction
        const tempDir = path.join(os.tmpdir(), `vibes-restore-${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });

        try {
            logger.log("Starting backup restoration from URL");

            // Download ZIP file
            const tempZipPath = path.join(tempDir, "backup.zip");
            await new Promise<void>((resolve, reject) => {
                const file = fs.createWriteStream(tempZipPath);
                https.get(downloadUrl, (response) => {
                    if (response.statusCode === 200) {
                        response.pipe(file);
                        file.on('finish', () => {
                            file.close();
                            resolve();
                        });
                    } else {
                        reject(new Error(`Failed to download: ${response.statusCode}`));
                    }
                }).on('error', (err) => {
                    fs.unlink(tempZipPath, () => { });
                    reject(err);
                });
            });

            logger.log("ZIP downloaded successfully");

            // Extract ZIP
            const zip = new AdmZip(tempZipPath);
            zip.extractAllTo(tempDir, true);

            // Restore settings
            const settingsPath = getSettingsFilePath();
            const extractedSettings = path.join(tempDir, "user-settings.json");
            if (fs.existsSync(extractedSettings)) {
                logger.log("Restoring user settings");
                fs.copyFileSync(extractedSettings, settingsPath);
            }

            // Restoring database is no longer supported locally
            if (fs.existsSync(path.join(tempDir, "sqlite.db"))) {
                logger.warn("Ignorando backup de base de datos local (V3 usa BD remota).");
            }

            // Restore stats
            const statsPath = path.join(getUserDataPath(), "token-stats.jsonl");
            const extractedStats = path.join(tempDir, "token-stats.jsonl");
            if (fs.existsSync(extractedStats)) {
                logger.log("Restoring stats");
                fs.copyFileSync(extractedStats, statsPath);
            }

            logger.log("Backup restoration completed successfully");

            // Schedule app restart after a short delay
            setTimeout(() => {
                const { app } = require("electron");
                app.relaunch();
                app.exit(0);
            }, 1000);

            return {
                success: true,
                message: "Backup restaurado correctamente. La aplicación se reiniciará.",
            };
        } catch (error: any) {
            logger.error("Backup restoration failed:", error);
            return {
                success: false,
                message: error.message || "Error al restaurar el backup",
            };
        } finally {
            // Clean up temp directory (after a delay to allow restart)
            setTimeout(() => {
                try {
                    if (fs.existsSync(tempDir)) {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                    }
                } catch (cleanupError) {
                    logger.warn("Failed to clean up temp directory:", cleanupError);
                }
            }, 2000);
        }
    });
}
