import { createTypedHandler, HandlerContext } from "./base";
import { settingsContracts } from "../types/settings";
import { writeSettings, readSettings } from "../../main/settings";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq } from "drizzle-orm";
import log from "electron-log";
import { BrowserWindow } from "electron";
import { safeSend } from "../utils/safe_sender";

const logger = log.scope("settings_handlers");

/**
 * Fields that are LOCAL-ONLY and must NEVER be overwritten by remote settings.
 * - providerSettings: contains API keys encrypted with machine-specific electron safeStorage.
 *   They cannot be decrypted on other machines and would corrupt the local config.
 * - Session fields (userId, sessionToken) are stripped separately.
 */
const LOCAL_ONLY_FIELDS = [
  "providerSettings",
  "githubAccessToken",
  "vercelAccessToken",
] as const;

/**
 * Keys removed by the v10 settings cleanup migration.
 * Must be stripped from remote settings during merge to prevent stale Bunny data
 * from re-introducing them after the local migration has cleaned them up.
 */
const V10_DEAD_KEYS = [
  'turboEditModel', 'todoAnalysisModel', 'debateModel',
  'summaryModel', 'appTitleGenerationModel',
  'memoriesExtractionModel', 'hideLocalAgentNewChatToast',
  'enableLocalSmartContext', 'enableMcpSmartContext',
  'enableBackgroundProblemAutoFix', 'enableAutoRepairRuntimeErrors',
  'autoFixModel', 'autoFixMaxDurationMs', 'autoFixMaxAttempts',
  'autoFixMaxIssues', 'agentMaxSteps',
  'enableOpenCodeLsp', 'thinkingBudget', 'experiments',
  'releaseChannel', 'dossierModel', 'enableTurboEditsV2',
] as const;

export async function forceSyncRemoteSettingsToLocal(userId: string) {
  const db = getRemoteDb();
  try {
    const remoteRecord = await db.query.userSettings.findFirst({
      where: eq(remoteSchema.userSettings.userId, userId),
    });
    if (remoteRecord) {
      const remoteSettings = JSON.parse(remoteRecord.settingsJson);

      // --- SESSION DATA EXCLUSION ---
      // We must NEVER overwrite local session data with remote settings data.
      // Remote settings are for user preferences, not for session management.
      // If we overwrite these, the user will be logged out on the next launch.
      delete remoteSettings.userId;
      delete remoteSettings.sessionToken;

      // --- LOCAL-ONLY FIELDS EXCLUSION ---
      // API keys and secrets are encrypted with machine-specific safeStorage.
      // They MUST NOT be overwritten by remote data (which may contain stale or
      // differently-encrypted values from another machine/session).
      for (const field of LOCAL_ONLY_FIELDS) {
        delete remoteSettings[field];
      }

      // --- MEMORY MODEL EXCLUSION ---
      // Memory model fields are managed by local migrations (v9g+).
      // They MUST NOT be overwritten by remote data.
      delete remoteSettings.memoriesSynthesisModelV2;
      delete remoteSettings.memoriesRouterModelV2;
      // --- MIGRATION FLAGS EXCLUSION ---
      // Migration state is local-only — remote may have stale flags.
      delete remoteSettings._migrations;

      // --- DEAD KEY EXCLUSION (v10) ---
      for (const key of V10_DEAD_KEYS) {
        delete remoteSettings[key];
      }

      // We must explicitly save these to disk so they immediately become the local truth
      // without needing an initial save from the React frontend.
      writeSettings(remoteSettings);
      return true;
    }
  } catch (error) {
    logger.error("Error force syncing remote user settings to local:", error);
  }
  return false;
}

export function registerSettingsHandlers() {
  // Note: Settings handlers intentionally use createTypedHandler without logging
  // to avoid logging sensitive data (API keys, tokens, etc.) from args/return values.

  // ── getUserSettings ──────────────────────────────────────────────────
  // Merges LOCAL settings (disk) with REMOTE settings (Bunny DB).
  // Merge order: { ...local, ...remote } — remote wins for all fields
  // EXCEPT those listed in LOCAL_ONLY_FIELDS (API keys, tokens) and
  // session data (userId, sessionToken), which always come from local.
  //
  // ⚠️  This means any setting written to disk via writeSettings() but NOT
  //     synced to Bunny will be overwritten by stale remote values on
  //     the next getUserSettings call. Always sync to Bunny after writing.
  createTypedHandler(settingsContracts.getUserSettings, async (_, __, context) => {
    const localSettings = readSettings();
    if (context.userId) {
      const db = getRemoteDb();
      try {
        const remoteRecord = await db.query.userSettings.findFirst({
          where: eq(remoteSchema.userSettings.userId, context.userId),
        });
        if (remoteRecord) {
          try {
            const remoteSettings = JSON.parse(remoteRecord.settingsJson);

            // Strip LOCAL-ONLY fields from remote to prevent stale/encrypted
            // API keys from overwriting the local machine's current keys.
            for (const field of LOCAL_ONLY_FIELDS) {
              delete remoteSettings[field];
            }
            // Also strip session data
            delete remoteSettings.userId;
            delete remoteSettings.sessionToken;
            // Strip memory model fields — managed by local migration v9
            delete remoteSettings.memoriesSynthesisModelV2;
            delete remoteSettings.memoriesRouterModelV2;
            // Strip _migrations — always trust local migration state,
            // otherwise remote overwrites local flags and re-triggers migrations
            delete remoteSettings._migrations;

            // Strip dead/abandoned keys (v10 cleanup) — remote may still hold stale values
            for (const key of V10_DEAD_KEYS) {
              delete remoteSettings[key];
            }

            // Merge: local wins for secrets, remote wins for preferences
            const merged = { ...localSettings, ...remoteSettings };
            // Hard migration: upgrade stale strategist model from remote
            if (merged.strategistModel === "deepseek/deepseek-v3.2" || !merged.strategistModel) {
              merged.strategistModel = "deepseek/deepseek-v4-flash";
            }
            return merged;
          } catch (e) {
            logger.error("Failed to parse remote settings JSON", e);
          }
        }
      } catch (error) {
        logger.error("Error fetching remote user settings:", error);
      }
    }
    return localSettings;
  });

  // ── setUserSettings ──────────────────────────────────────────────────
  // Canonical "full pipeline" for settings changes initiated by the renderer.
  // Performs ALL sync steps in sequence:
  //   1. writeSettings()      → local disk + in-memory cache
  //   2. Hot-update OpenCode  → config/permissions applied to running daemon
  //   3. Sync to Bunny DB     → remote persistence across devices
  //   4. Returns `updated`    → renderer sets the Jotai atom
  //
  // ⚠️  Main-process code that needs the same pipeline must replicate these
  //     steps manually — see persistPermissionToSettings() in opencode_adapter.ts.
  createTypedHandler(settingsContracts.setUserSettings, async (event, settings, context) => {
    writeSettings(settings);
    const updated = readSettings();

    // Hot-update OpenCode server config if model, variant, reasoning effort, verbosity, or unified model keys changed
    if (settings.selectedModel || settings.selectedModelVariant !== undefined || settings.strategistModel || settings.executorModel || settings.reasoningEffort || settings.textVerbosity) {
      try {
        const { updateOpenCodeConfig } = await import("./opencode_adapter");
        await updateOpenCodeConfig({
          // If only variant changed (no model change), pass current model so the config gets rebuilt
          selectedModel: settings.selectedModel ?? (settings.selectedModelVariant !== undefined ? readSettings().selectedModel : undefined),
          selectedModelVariant: settings.selectedModelVariant,
          strategistModel: settings.strategistModel,
          executorModel: settings.executorModel,
          reasoningEffort: settings.reasoningEffort,
          textVerbosity: settings.textVerbosity,
        });
      } catch (e: any) {
        logger.warn(`Failed to hot-update OpenCode config: ${e.message}`);
      }
    }

    // Hot-update OpenCode permissions when the user changes permission pills
    if (settings.openCodePermissions2) {
      try {
        const { updateOpenCodePermissions } = await import("./opencode_adapter");
        await updateOpenCodePermissions(updated);
      } catch (e: any) {
        logger.warn(`Failed to hot-update OpenCode permissions: ${e.message}`);
      }
    }

    // If provider settings (API keys) changed, we must completely shutdown the OpenCode
    // daemon so it picks up the new process.env variables upon the next spawn.
    if (settings.providerSettings) {
      try {
        const { shutdownOpenCode } = await import("./opencode_adapter");
        await shutdownOpenCode();
        logger.info("Shutdown OpenCode daemon to apply new API keys");
      } catch (e: any) {
        logger.warn(`Failed to shutdown OpenCode for API key reload: ${e.message}`);
      }
    }

    if (context.userId) {
      const db = getRemoteDb();
      try {
        // --- SESSION DATA EXCLUSION ---
        // We strip session data before saving to the remote DB to keep it clean.
        const { userId: _u, sessionToken: _s, ...syncableSettings } = updated;
        const settingsJson = JSON.stringify(syncableSettings);

        const existing = await db.query.userSettings.findFirst({
          where: eq(remoteSchema.userSettings.userId, context.userId),
        });

        if (existing) {
          await db
            .update(remoteSchema.userSettings)
            .set({
              settingsJson,
              updatedAt: new Date(),
            })
            .where(eq(remoteSchema.userSettings.userId, context.userId));
        } else {
          await db.insert(remoteSchema.userSettings).values({
            userId: context.userId,
            settingsJson,
            updatedAt: new Date(),
          });
        }
      } catch (error) {
        logger.error("Error syncing settings to remote DB:", error);
      }
    }

    // ── Broadcast to ALL other windows for real-time sync ──
    // The calling window already receives `updated` as the return value;
    // other windows (admin panel, chat sub-windows) need the IPC push.
    const senderWebContentsId = event?.sender?.id;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents && win.webContents.id !== senderWebContentsId) {
        safeSend(win.webContents, "settings:updated-from-backend", updated);
      }
    }

    return updated;
  });
}
