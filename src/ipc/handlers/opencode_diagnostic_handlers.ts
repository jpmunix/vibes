/**
 * OpenCode Diagnostic IPC Handlers
 * 
 * Registers IPC handlers for testing and diagnosing the OpenCode AI integration
 * from within the Electron app (where electron-safe-storage is available).
 * 
 * Usage from DevTools console:
 *   // Check health
 *   await window.electron.invoke("opencode:health-check")
 *   
 *   // Run a test prompt
 *   await window.electron.invoke("opencode:test-run", { 
 *     appPath: "your-app-folder-name" 
 *   })
 *   
 *   // Extract API keys for manual testing
 *   await window.electron.invoke("opencode:extract-env")
 */

import { ipcMain } from "electron";
import log from "electron-log";
import { openCodeHealthCheck, openCodeTestRun } from "./opencode_adapter";
import { getDyadAppPath } from "../../paths/paths";
import { readSettings, decrypt } from "../../main/settings";
import type { Secret } from "../../lib/schemas";

const logger = log.scope("opencode_diagnostic");

export function registerOpenCodeDiagnosticHandlers() {
    // ──────────────────────────────────────────────
    // Health Check
    // ──────────────────────────────────────────────
    ipcMain.handle("opencode:health-check", async () => {
        logger.info("[OpenCode Diagnostic] Running health check...");
        try {
            const health = await openCodeHealthCheck();

            // Also try to extract the actual OpenRouter key to verify decryption works
            const settings = readSettings();
            const openRouterSettings = settings.providerSettings?.openrouter as any;
            let keyDecryptionOk = false;
            let selectedAlias = "unknown";

            if (openRouterSettings?.keys?.length > 0) {
                const selectedKeyId = openRouterSettings.selectedKeyId;
                const selectedKey = openRouterSettings.keys.find(
                    (k: any) => k.id === selectedKeyId
                );

                if (selectedKey) {
                    selectedAlias = selectedKey.alias || "unnamed";
                    try {
                        const secret: Secret = selectedKey.key;
                        const decryptedKey = secret.encryptionType === "plaintext"
                            ? secret.value
                            : decrypt(secret);
                        keyDecryptionOk = decryptedKey?.startsWith("sk-");
                        logger.info(`[OpenCode Diagnostic] Key "${selectedAlias}" decrypted successfully: ${keyDecryptionOk}`);
                    } catch (e) {
                        logger.error("[OpenCode Diagnostic] Key decryption failed:", e);
                    }
                }
            }

            return {
                ...health,
                keyDecryption: {
                    ok: keyDecryptionOk,
                    selectedAlias,
                    provider: "openrouter",
                },
            };
        } catch (error: any) {
            logger.error("[OpenCode Diagnostic] Health check failed:", error);
            return { error: error.message };
        }
    });

    // ──────────────────────────────────────────────
    // Test Run
    // ──────────────────────────────────────────────
    ipcMain.handle("opencode:test-run", async (_event, params?: { appPath?: string }) => {
        logger.info("[OpenCode Diagnostic] Starting test run...");

        const appPath = params?.appPath || ".";

        try {
            const result = await openCodeTestRun(getDyadAppPath(appPath));
            return result;
        } catch (error: any) {
            logger.error("[OpenCode Diagnostic] Test run failed:", error);
            return { success: false, error: error.message };
        }
    });

    // ──────────────────────────────────────────────
    // Extract Key (for manual testing outside Electron)
    // ──────────────────────────────────────────────
    ipcMain.handle("opencode:extract-env", async () => {
        logger.info("[OpenCode Diagnostic] Extracting API keys as env vars...");

        const settings = readSettings();
        const env: Record<string, string> = {};

        // Extract OpenRouter key
        const openRouterSettings = settings.providerSettings?.openrouter as any;
        if (openRouterSettings?.keys?.length > 0) {
            const selectedKeyId = openRouterSettings.selectedKeyId;
            const selectedKey = openRouterSettings.keys.find(
                (k: any) => k.id === selectedKeyId
            );

            if (selectedKey?.key) {
                try {
                    const decrypted = selectedKey.key.encryptionType === "plaintext"
                        ? selectedKey.key.value
                        : decrypt(selectedKey.key);
                    env.OPENROUTER_API_KEY = decrypted;
                } catch (e) {
                    logger.error("[OpenCode Diagnostic] Failed to decrypt OpenRouter key");
                }
            }
        }

        // Return masked keys for display + a shell export command
        const masked: Record<string, string> = {};
        const exports: string[] = [];
        for (const [key, value] of Object.entries(env)) {
            masked[key] = value.substring(0, 12) + "..." + value.substring(value.length - 4);
            exports.push(`export ${key}="${value}"`);
        }

        return {
            masked,
            shellExport: exports.join("\n"),
            note: "⚠️ Use the shellExport in a terminal to test OpenCode outside Electron. Keep your keys safe!",
        };
    });

    logger.info("[OpenCode Diagnostic] Handlers registered: opencode:health-check, opencode:test-run, opencode:extract-env");
}
