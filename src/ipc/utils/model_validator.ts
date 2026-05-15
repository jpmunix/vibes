/**
 * Model Validator — Boot-time safety net
 *
 * On every app launch, validates that all model references in user settings
 * still exist in OpenRouter's current model catalogue. If a configured model
 * has been retired (e.g. a provider renamed or removed it), this module
 * silently replaces it with a known-good fallback and persists the change.
 *
 * This prevents the cascade of "model not found" 400/404 errors that occur
 * when a user's settings.json references a model that no longer exists.
 *
 * ⚠️  IMPORTANT: Changes must be synced to Bunny DB (remote settings), not
 * just written to disk. Otherwise getUserSettings() will merge stale remote
 * values back on top: `{ ...local, ...remote }` → dead models return.
 *
 * Called from main.ts during the splash screen phase.
 */

import log from "electron-log";
import { BrowserWindow } from "electron";
import { readSettings, writeSettings } from "../../main/settings";
import { fetchOpenRouterModels } from "./openrouter_models_service";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq } from "drizzle-orm";
import { safeSend } from "./safe_sender";
import {
    FALLBACK_SELECTED_MODEL,
    DEFAULT_ENABLED_MODELS,
} from "../shared/language_model_constants";
import { DEFAULT_STANDARD_MODEL } from "../../lib/schemas";

const logger = log.scope("model_validator");

/**
 * Validate all active model references in settings against the current
 * OpenRouter model catalogue. Replaces stale references with safe fallbacks.
 *
 * Designed to be fire-and-forget — never throws, never blocks the UI.
 */
export async function validateModelSettings(): Promise<void> {
    try {
        const settings = readSettings();

        // ── Skip validation when using a custom provider ──
        // The validator checks against the OpenRouter model catalogue.
        // If the active provider is NOT OpenRouter, all its models would be
        // falsely flagged as "dead" and replaced with OpenRouter fallbacks.
        const activeProvider = settings.activeProviderId || "openrouter";
        if (activeProvider !== "openrouter") {
            logger.info(`[ModelValidator] Skipped — active provider is "${activeProvider}", not OpenRouter`);
            return;
        }

        const models = await fetchOpenRouterModels();

        // If we got zero models (network down, API error), skip validation
        // to avoid falsely flagging everything as invalid.
        if (models.length === 0) {
            logger.info("[ModelValidator] Skipped — no models available (network/API issue)");
            return;
        }

        const availableNames = new Set(models.map(m => m.name));
        const migrated: string[] = [];

        // ── 1. selectedModel (the main chat model) ──
        if (settings.selectedModel?.name && !availableNames.has(settings.selectedModel.name)) {
            logger.warn(`[ModelValidator] selectedModel "${settings.selectedModel.name}" no longer exists → "${FALLBACK_SELECTED_MODEL}"`);
            settings.selectedModel = {
                name: FALLBACK_SELECTED_MODEL,
                provider: "openrouter",
            };
            migrated.push(`selectedModel → ${FALLBACK_SELECTED_MODEL}`);
        }

        // ── 2. executorModel (lightweight tasks) ──
        if (settings.executorModel && !availableNames.has(settings.executorModel)) {
            logger.warn(`[ModelValidator] executorModel "${settings.executorModel}" no longer exists → "${DEFAULT_STANDARD_MODEL}"`);
            settings.executorModel = DEFAULT_STANDARD_MODEL;
            migrated.push(`executorModel → ${DEFAULT_STANDARD_MODEL}`);
        }

        // ── 2b. strategistModel (reasoning agents) ──
        if (settings.strategistModel && !availableNames.has(settings.strategistModel)) {
            const fallback = "deepseek/deepseek-v3.2";
            logger.warn(`[ModelValidator] strategistModel "${settings.strategistModel}" no longer exists → "${fallback}"`);
            settings.strategistModel = fallback;
            migrated.push(`strategistModel → ${fallback}`);
        }

        // ── 3. memoriesSynthesisModelV2 (memory extraction) ──
        if (settings.memoriesSynthesisModelV2 && !availableNames.has(settings.memoriesSynthesisModelV2)) {
            logger.warn(`[ModelValidator] memoriesSynthesisModelV2 "${settings.memoriesSynthesisModelV2}" no longer exists → "${DEFAULT_STANDARD_MODEL}"`);
            settings.memoriesSynthesisModelV2 = DEFAULT_STANDARD_MODEL;
            migrated.push(`memoriesSynthesisModelV2 → ${DEFAULT_STANDARD_MODEL}`);
        }

        // ── 4. memoriesRouterModelV2 (memory selection) ──
        if ((settings as any).memoriesRouterModelV2 && !availableNames.has((settings as any).memoriesRouterModelV2)) {
            const fallback = DEFAULT_STANDARD_MODEL;
            logger.warn(`[ModelValidator] memoriesRouterModelV2 "${(settings as any).memoriesRouterModelV2}" no longer exists → "${fallback}"`);
            (settings as any).memoriesRouterModelV2 = fallback;
            migrated.push(`memoriesRouterModelV2 → ${fallback}`);
        }

        // ── 5. enabledOpenRouterModels (picker list) — prune dead entries ──
        const enabledModels = settings.enabledOpenRouterModels;
        if (enabledModels && Array.isArray(enabledModels)) {
            const alive = enabledModels.filter(name => availableNames.has(name));
            const dead = enabledModels.filter(name => !availableNames.has(name));

            if (dead.length > 0) {
                logger.warn(`[ModelValidator] Pruned ${dead.length} dead models from enabledOpenRouterModels: ${dead.join(", ")}`);
                // Ensure we don't end up with an empty list
                settings.enabledOpenRouterModels = alive.length > 0 ? alive : [...DEFAULT_ENABLED_MODELS];
                migrated.push(`enabledOpenRouterModels: removed ${dead.length} dead models`);
            }
        }

        // ── Persist if anything changed ──
        if (migrated.length > 0) {
            // Step 1: Write to disk + in-memory cache
            writeSettings(settings);
            logger.info(`[ModelValidator] Migrated ${migrated.length} stale model references: ${migrated.join("; ")}`);

            // Step 2: Sync to Bunny DB so getUserSettings merge doesn't
            // overwrite the pruned values with stale remote data.
            // This is critical — without it, `{ ...local, ...remote }` in
            // getUserSettings brings the dead models back on every boot.
            try {
                const updated = readSettings();
                const userId = updated.userId;
                if (userId) {
                    const db = getRemoteDb();
                    const { userId: _u, sessionToken: _s, ...syncable } = updated;
                    const settingsJson = JSON.stringify(syncable);
                    const existing = await db.query.userSettings.findFirst({
                        where: eq(remoteSchema.userSettings.userId, userId),
                    });
                    if (existing) {
                        await db.update(remoteSchema.userSettings)
                            .set({ settingsJson, updatedAt: new Date() })
                            .where(eq(remoteSchema.userSettings.userId, userId));
                    } else {
                        await db.insert(remoteSchema.userSettings).values({
                            userId, settingsJson, updatedAt: new Date(),
                        });
                    }
                    logger.info("[ModelValidator] Synced pruned settings to Bunny DB");
                }
            } catch (syncErr: any) {
                logger.warn(`[ModelValidator] Bunny DB sync failed (non-fatal): ${syncErr.message}`);
            }

            // Step 3: Broadcast to renderer
            const updated = readSettings();
            for (const win of BrowserWindow.getAllWindows()) {
                if (!win.isDestroyed() && win.webContents) {
                    safeSend(win.webContents, "settings:updated-from-backend", updated);
                    safeSend(win.webContents, "models:migrated", { changes: migrated });
                }
            }
        } else {
            logger.info("[ModelValidator] All model references are valid ✓");
        }
    } catch (error: any) {
        // Never crash the app — validation is best-effort
        logger.warn(`[ModelValidator] Validation failed (non-fatal): ${error.message}`);
    }
}
