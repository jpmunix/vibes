import { createTypedHandler } from "./base";
import { settingsContracts } from "../types/settings";
import { writeSettings, readSettings, resetSettingsCache } from "../../main/settings";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq } from "drizzle-orm";
import log from "electron-log";
import { app, BrowserWindow } from "electron";
import { safeSend } from "../utils/safe_sender";
import { preferencesCache } from "../../main/preferences-cache";
import type { UserSettings } from "../../lib/schemas";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

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
const _V10_DEAD_KEYS = [
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

    // If we have a userId but cache isn't hydrated yet (splash hydration still running),
    // wait for it instead of returning empty defaults.  This prevents the renderer from
    // getting providerSettings: {} on first render and flashing "configure OpenRouter" banners.
    if (context.userId && !preferencesCache.isHydrated) {
      const MAX_WAIT_MS = 5000;
      const POLL_MS = 50;
      const start = Date.now();
      while (!preferencesCache.isHydrated && Date.now() - start < MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (preferencesCache.isHydrated) {
        return composeSettingsFromCache(context.userId) as any;
      }
      logger.warn("getUserSettings: preferences cache did not hydrate within timeout, returning disk settings");
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
      // Invalidate in-memory cache so readSettings() recomposes from fresh KV data.
      // Without this, the cached object retains stale values for non-LOCAL_DISK_ONLY keys.
      resetSettingsCache();
    } else {
      // Fallback for pre-auth: write everything to disk
      writeSettings(settings);
    }

    // Hot-update OpenCode server config if model, variant, reasoning effort, verbosity, or unified model keys changed
    if (settings.selectedModel || settings.selectedModelVariant !== undefined || settings.strategistModel || settings.executorModel || settings.reasoningEffort || settings.textVerbosity || settings.inferenceTemperature !== undefined || settings.inferenceTopP !== undefined || settings.inferenceRepetitionPenalty !== undefined) {
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
          inferenceTemperature: settings.inferenceTemperature,
          inferenceTopP: settings.inferenceTopP,
          inferenceRepetitionPenalty: settings.inferenceRepetitionPenalty,
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

    // If provider settings (API keys) or active provider changed, shutdown OpenCode daemon
    // so it restarts with the correct baseURL/apiKey configuration.
    if (settings.providerSettings || settings.activeProviderId !== undefined) {
      try {
        const { shutdownOpenCode } = await import("./opencode_adapter");
        await shutdownOpenCode();
        logger.info("Shutdown OpenCode daemon to apply provider change");
      } catch (e: any) {
        logger.warn(`Failed to shutdown OpenCode for provider change: ${e.message}`);
      }
    }

    // Build the full updated settings to return to the renderer
    const updated = context.userId && preferencesCache.isHydrated
      ? composeSettingsFromCache(context.userId)
      : readSettings();

    // ── Backup: also update the legacy blob in Bunny (fire-and-forget) ──
    // The real settings are already persisted locally in the KV cache above.
    // This backup is purely for disaster recovery — no need to block the UI.
    if (context.userId) {
      const capturedUserId = context.userId;
      const capturedUpdated = { ...updated };
      setImmediate(async () => {
        try {
          const db = getRemoteDb();
          const { userId: _u, sessionToken: _s, ...syncableSettings } = capturedUpdated;
          const settingsJson = JSON.stringify(syncableSettings);

          const existing = await db.query.userSettings.findFirst({
            where: eq(remoteSchema.userSettings.userId, capturedUserId),
          });

          if (existing) {
            await db
              .update(remoteSchema.userSettings)
              .set({ settingsJson, updatedAt: new Date() })
              .where(eq(remoteSchema.userSettings.userId, capturedUserId));
          } else {
            await db.insert(remoteSchema.userSettings).values({
              userId: capturedUserId,
              settingsJson,
              updatedAt: new Date(),
            });
          }
        } catch (error) {
          logger.error("Error syncing settings backup blob:", error);
        }
      });
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

  // ── Global Skills Handlers ───────────────────────────────────────────
  const getGlobalSkillsDir = () => path.join(app.getPath("userData"), "opencode-config", "skills");

  const isSafePath = (targetPath: string) => {
    const relative = path.relative(getGlobalSkillsDir(), targetPath);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  };

  createTypedHandler(settingsContracts.listGlobalSkills, async () => {
    const baseDir = getGlobalSkillsDir();
    if (!existsSync(baseDir)) {
      return [];
    }
    
    try {
      const skills: { name: string; path: string; enabled: boolean }[] = [];
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const enabledPath = path.join(baseDir, entry.name, "SKILL.md");
          const disabledPath = path.join(baseDir, entry.name, "SKILL.disabled");
          if (existsSync(enabledPath)) {
            skills.push({
              name: entry.name,
              path: `${entry.name}/SKILL.md`,
              enabled: true,
            });
          } else if (existsSync(disabledPath)) {
            skills.push({
              name: entry.name,
              path: `${entry.name}/SKILL.disabled`,
              enabled: false,
            });
          }
        }
      }
      return skills;
    } catch (err: any) {
      logger.error("Failed to list global skills:", err);
      return [];
    }
  });

  createTypedHandler(settingsContracts.renameGlobalSkill, async (event, { oldPath, newPath }) => {
    const baseDir = getGlobalSkillsDir();
    const fullOld = path.join(baseDir, oldPath);
    const fullNew = path.join(baseDir, newPath);
    
    if (!isSafePath(fullOld) || !isSafePath(fullNew)) {
      throw new Error("Acceso no autorizado fuera del directorio de skills globales.");
    }
    
    try {
      await fs.rename(fullOld, fullNew);
    } catch (err: any) {
      logger.error("Failed to rename global skill:", err);
      throw err;
    }
  });

  createTypedHandler(settingsContracts.readGlobalSkill, async (event, { filePath }) => {
    const baseDir = getGlobalSkillsDir();
    const fullPath = path.join(baseDir, filePath);
    
    if (!isSafePath(fullPath)) {
      throw new Error("Acceso no autorizado fuera del directorio de skills globales.");
    }
    
    if (!existsSync(fullPath)) {
      throw new Error("El archivo de skill no existe.");
    }
    
    try {
      return await fs.readFile(fullPath, "utf-8");
    } catch (err: any) {
      logger.error("Failed to read global skill:", err);
      throw err;
    }
  });

  createTypedHandler(settingsContracts.editGlobalSkill, async (event, { filePath, content }) => {
    const baseDir = getGlobalSkillsDir();
    const fullPath = path.join(baseDir, filePath);
    
    if (!isSafePath(fullPath)) {
      throw new Error("Acceso no autorizado fuera del directorio de skills globales.");
    }
    
    try {
      const parentDir = path.dirname(fullPath);
      await fs.mkdir(parentDir, { recursive: true });
      await fs.writeFile(fullPath, content, "utf-8");
    } catch (err: any) {
      logger.error("Failed to write global skill:", err);
      throw err;
    }
  });

  createTypedHandler(settingsContracts.deleteGlobalSkill, async (event, { filePath }) => {
    const baseDir = getGlobalSkillsDir();
    const fullPath = path.join(baseDir, filePath);
    
    if (!isSafePath(fullPath)) {
      throw new Error("Acceso no autorizado fuera del directorio de skills globales.");
    }
    
    try {
      if (existsSync(fullPath)) {
        await fs.rm(fullPath, { recursive: true, force: true });
      }

      // Also clean up from the old global opencode directory to prevent ghost skills
      const os = require("node:os");
      const oldBaseDir = path.join(os.homedir(), ".config", "opencode", "skills");
      const oldFullPath = path.join(oldBaseDir, filePath);
      const relativeToOld = path.relative(oldBaseDir, oldFullPath);
      const isOldSafe = relativeToOld && !relativeToOld.startsWith("..") && !path.isAbsolute(relativeToOld);
      if (isOldSafe && existsSync(oldFullPath)) {
        await fs.rm(oldFullPath, { recursive: true, force: true });
      }
    } catch (err: any) {
      logger.error("Failed to delete global skill:", err);
      throw err;
    }
  });
}
