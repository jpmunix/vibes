/**
 * Crush Diagnostic IPC Handlers
 * 
 * Registers IPC handlers for testing and diagnosing the Crush integration
 * from within the Electron app (where electron-safe-storage is available).
 * 
 * Usage from DevTools console:
 *   // Check health
 *   await window.electron.invoke("crush:health-check")
 *   
 *   // Run a test prompt
 *   await window.electron.invoke("crush:test-run", { 
 *     prompt: "List the 3 most important files in this project",
 *     appPath: "your-app-folder-name" 
 *   })
 */

import { ipcMain } from "electron";
import log from "electron-log";
import {
    checkCrushHealth,
    buildCrushConfig,
    handleCrushStream,
} from "./crush_adapter";
import { getDyadAppPath } from "../../paths/paths";
import { readSettings, decrypt } from "../../main/settings";
import type { Secret } from "../../lib/schemas";

const logger = log.scope("crush_diagnostic");

export function registerCrushDiagnosticHandlers() {
    // ──────────────────────────────────────────────
    // Health Check
    // ──────────────────────────────────────────────
    ipcMain.handle("crush:health-check", async () => {
        logger.info("[Crush Diagnostic] Running health check...");
        try {
            const health = await checkCrushHealth();

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
                        logger.info(`[Crush Diagnostic] Key "${selectedAlias}" decrypted successfully: ${keyDecryptionOk}`);
                    } catch (e) {
                        logger.error("[Crush Diagnostic] Key decryption failed:", e);
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
            logger.error("[Crush Diagnostic] Health check failed:", error);
            return { error: error.message };
        }
    });

    // ──────────────────────────────────────────────
    // Test Run (non-interactive)
    // ──────────────────────────────────────────────
    ipcMain.handle("crush:test-run", async (event, params: { prompt: string; appPath?: string }) => {
        logger.info("[Crush Diagnostic] Starting test run...");

        const { prompt, appPath } = params;

        // Use current app or default
        const targetAppPath = appPath || ".";

        try {
            const config = buildCrushConfig(targetAppPath);
            logger.info(`[Crush Diagnostic] Config built. Model: ${config.model}`);
            logger.info(`[Crush Diagnostic] CWD: ${config.cwd}`);
            logger.info(`[Crush Diagnostic] API keys available: ${Object.keys(config.env)
                    .filter(k => k.endsWith("_KEY") || k.endsWith("_TOKEN"))
                    .filter(k => config.env[k])
                    .join(", ")
                }`);

            const abortController = new AbortController();

            // Set a 60s timeout for the test
            const timeout = setTimeout(() => {
                logger.warn("[Crush Diagnostic] Test timed out after 60s");
                abortController.abort();
            }, 60000);

            const result = await handleCrushStream(
                event,
                {
                    chatId: -1, // Diagnostic chat ID
                    prompt,
                    attachments: [],
                } as any,
                abortController,
                {
                    placeholderMessageId: -1,
                    appPath: targetAppPath,
                },
            );

            clearTimeout(timeout);

            return {
                success: result.success,
                response: result.fullResponse,
                responseLength: result.fullResponse.length,
            };
        } catch (error: any) {
            logger.error("[Crush Diagnostic] Test run failed:", error);
            return { error: error.message };
        }
    });

    // ──────────────────────────────────────────────
    // Extract Key (for manual testing outside Electron)
    // ──────────────────────────────────────────────
    ipcMain.handle("crush:extract-env", async () => {
        logger.info("[Crush Diagnostic] Extracting API keys as env vars...");

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
                    logger.error("[Crush Diagnostic] Failed to decrypt OpenRouter key");
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
            // This can be pasted into a terminal for testing outside Electron
            shellExport: exports.join("\n"),
            note: "⚠️ Use the shellExport in a terminal to test Crush outside Electron. Keep your keys safe!",
        };
    });

    logger.info("[Crush Diagnostic] Handlers registered: crush:health-check, crush:test-run, crush:extract-env");
}
