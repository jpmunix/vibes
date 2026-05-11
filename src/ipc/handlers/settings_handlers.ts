import { createTypedHandler, HandlerContext } from "./base";
import { settingsContracts } from "../types/settings";
import { writeSettings, readSettings } from "../../main/settings";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq } from "drizzle-orm";
import log from "electron-log";
import { BrowserWindow } from "electron";
import { safeSend } from "../utils/safe_sender";
import { preferencesCache } from "../../main/preferences-cache";
import type { UserSettings } from "../../lib/schemas";

const logger = log.scope("settings_handlers");

/**
 * Keys that live in `user-settings.json` only (not in the KV store).
 * These are machine-specific state, not user preferences.
 */
const LOCAL_DISK_ONLY_KEYS = new Set([
  "userId",
  "sessionToken",
  "windowState",
  "secondaryWindowStates",
  "isRunning",
  "lastKnownPerformance",
  "hasRunBefore",
  "isTestMode",
]);

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

/**
 * Build a UserSettings-shaped object from the preferences cache.
 * Falls back to local disk for LOCAL_DISK_ONLY_KEYS (windowState, session, etc.).
 */
export function composeSettingsFromCache(userId: string): Record<string, any> {
  // Start with local-only fields from disk
  const localSettings = readSettings();
  const localOnly: Record<string, any> = {};
  for (const key of LOCAL_DISK_ONLY_KEYS) {
    if (key in localSettings) {
      localOnly[key] = (localSettings as any)[key];
    }
  }

  // Get all preferences from cache
  const prefsMap = preferencesCache.getAll(userId, 0);

  // Deserialize each value from JSON string to its native type
  const deserialized: Record<string, any> = {};
  for (const [key, rawValue] of Object.entries(prefsMap)) {
    try {
      deserialized[key] = JSON.parse(rawValue);
    } catch {
      // Plain string value (not JSON)
      deserialized[key] = rawValue;
    }
  }

  // Merge: local-only fields + deserialized preferences
  return { ...deserialized, ...localOnly } as UserSettings;
}

/**
 * Decompose a partial UserSettings into KV entries and persist them.
 * Local-only fields are written to disk, everything else goes to the cache.
 */
function decomposeAndPersist(
  userId: string,
  settings: Record<string, any>,
): void {
  const localUpdates: Record<string, any> = {};
  const kvUpdates: Record<string, string> = {};

  for (const [key, value] of Object.entries(settings)) {
    if (LOCAL_DISK_ONLY_KEYS.has(key)) {
      localUpdates[key] = value;
    } else {
      // Serialize to JSON string for the KV store
      kvUpdates[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
  }

  // Write local-only fields to disk
  if (Object.keys(localUpdates).length > 0) {
    writeSettings(localUpdates);
  }

  // Write preferences to cache (async DB persist happens inside)
  if (Object.keys(kvUpdates).length > 0) {
    preferencesCache.setMany(userId, kvUpdates, 0);
  }
}

// Legacy export — kept for backward compat during migration period
export async function forceSyncRemoteSettingsToLocal(userId: string) {
  // Now just hydrates the preferences cache if needed
  if (!preferencesCache.isHydrated || preferencesCache.currentUserId !== userId) {
    await preferencesCache.hydrate(userId);
  }
  return true;
}

export function registerSettingsHandlers() {
  // Note: Settings handlers intentionally use createTypedHandler without logging
  // to avoid logging sensitive data (API keys, tokens, etc.) from args/return values.

  // ── getUserSettings ──────────────────────────────────────────────────
  // Composes a UserSettings object from:
  //   1. Preferences cache (KV store, hydrated from BunnyDB)
  //   2. Local disk (machine-specific fields: windowState, session, etc.)
  //
  // No more blob merge, no LOCAL_ONLY_FIELDS exclusion, no V10_DEAD_KEYS stripping.
  // The KV store IS the source of truth for all preferences.
  createTypedHandler(settingsContracts.getUserSettings, async (_, __, context) => {
    if (context.userId && preferencesCache.isHydrated) {
      return composeSettingsFromCache(context.userId) as any;
    }

    // Fallback: if cache isn't hydrated yet (pre-auth boot), return local disk
    return readSettings();
  });

  // ── setUserSettings ──────────────────────────────────────────────────
  // Canonical pipeline for settings changes from the renderer:
  //   1. Decompose into local-only (disk) + preferences (cache → DB)
  //   2. Hot-update OpenCode if model/variant/permissions changed
  //   3. Broadcast to all windows
  //   4. Also update the legacy blob backup in Bunny
  createTypedHandler(settingsContracts.setUserSettings, async (event, settings, context): Promise<UserSettings> => {
    if (context.userId && preferencesCache.isHydrated) {
      // New path: decompose into KV cache + local disk
      decomposeAndPersist(context.userId, settings as Record<string, any>);
    } else {
      // Fallback for pre-auth: write everything to disk
      writeSettings(settings);
    }

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
        const currentSettings = context.userId && preferencesCache.isHydrated
          ? composeSettingsFromCache(context.userId)
          : readSettings();
        await updateOpenCodePermissions(currentSettings as any);
      } catch (e: any) {
        logger.warn(`Failed to hot-update OpenCode permissions: ${e.message}`);
      }
    }

    // If provider settings (API keys) changed, shutdown OpenCode daemon
    if (settings.providerSettings) {
      try {
        const { shutdownOpenCode } = await import("./opencode_adapter");
        await shutdownOpenCode();
        logger.info("Shutdown OpenCode daemon to apply new API keys");
      } catch (e: any) {
        logger.warn(`Failed to shutdown OpenCode for API key reload: ${e.message}`);
      }
    }

    // Build the full updated settings to return to the renderer
    const updated = context.userId && preferencesCache.isHydrated
      ? composeSettingsFromCache(context.userId)
      : readSettings();

    // ── Backup: also update the legacy blob in Bunny (for disaster recovery) ──
    if (context.userId) {
      const db = getRemoteDb();
      try {
        const { userId: _u, sessionToken: _s, ...syncableSettings } = updated;
        const settingsJson = JSON.stringify(syncableSettings);

        const existing = await db.query.userSettings.findFirst({
          where: eq(remoteSchema.userSettings.userId, context.userId),
        });

        if (existing) {
          await db
            .update(remoteSchema.userSettings)
            .set({ settingsJson, updatedAt: new Date() })
            .where(eq(remoteSchema.userSettings.userId, context.userId));
        } else {
          await db.insert(remoteSchema.userSettings).values({
            userId: context.userId,
            settingsJson,
            updatedAt: new Date(),
          });
        }
      } catch (error) {
        logger.error("Error syncing settings backup blob:", error);
      }
    }

    // ── Broadcast to ALL other windows for real-time sync ──
    const senderWebContentsId = event?.sender?.id;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents && win.webContents.id !== senderWebContentsId) {
        safeSend(win.webContents, "settings:updated-from-backend", updated);
      }
    }

    return updated as UserSettings;
  });
}
