import { createTypedHandler } from "./base";
import { backupContracts } from "../types/backup";
import { getSettingsFilePath } from "../../main/settings";
import { getDatabasePath } from "../../db";
import { getUserDataPath } from "@/paths/paths";
import path from "node:path";
import fs from "node:fs";
import log from "electron-log";

const logger = log.scope("backup_handlers");

export function registerBackupHandlers() {
    createTypedHandler(backupContracts.performBackup, async (_, params) => {
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
                    const content = fs.readFileSync(dbPath);
                    backupData.push({
                        name: "sqlite.db",
                        content: content.toString("base64"),
                        contentType: "application/x-sqlite3"
                    });
                }
            }

            if (includeStats) {
                const statsPath = path.join(getUserDataPath(), "token-stats.jsonl");
                if (fs.existsSync(statsPath)) {
                    const content = fs.readFileSync(statsPath);
                    backupData.push({
                        name: "token-stats.jsonl",
                        content: content.toString("base64"),
                        contentType: "application/jsonl"
                    });
                }
            }

            return {
                success: true,
                message: "Datos listos para subir a Firebase",
                backupData
            };
        } catch (error: any) {
            logger.error("Backup data collection failed:", error);
            return {
                success: false,
                message: error.message || "Error al leer archivos para backup",
                backupData: []
            };
        }
    });
}
