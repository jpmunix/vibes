import fs from "node:fs";
import {
  UserSettingsSchema,
  type UserSettings,
  Secret,
  DEFAULT_EXECUTOR_MODEL,
  DEFAULT_STRATEGIST_MODEL,
} from "../lib/schemas";
import { safeStorage } from "electron";
import { v4 as uuidv4 } from "uuid";
import log from "electron-log";
import { DEFAULT_TEMPLATE_ID } from "@/shared/templates";

import {
  FALLBACK_SELECTED_MODEL,
} from "@/ipc/shared/language_model_constants";
import { IS_TEST_BUILD } from "@/ipc/utils/test_utils";
import { preferencesCache } from "./preferences-cache";
import { getContextUserId } from "../lib/async_context";
import { readSession, writeSession, clearSession } from "./session";
import { readRuntimeState, writeRuntimeState, clearRuntimeState, RuntimeState } from "./runtime";
import path from "node:path";
import { getUserDataPath } from "../paths/paths";

const logger = log.scope("settings");

export const DEFAULT_SETTINGS: UserSettings = {
  selectedModel: {
    name: FALLBACK_SELECTED_MODEL,
    provider: "openrouter",
  },
  providerSettings: {},
  strategistModel: DEFAULT_STRATEGIST_MODEL,
  executorModel: DEFAULT_EXECUTOR_MODEL,
  telemetryConsent: "unset",
  telemetryUserId: uuidv4(),
  hasRunBefore: false,
  enableProLazyEditsMode: true,
  enableProSmartFilesContextMode: true,
  enableGithubAutoCommit: true,
  enableChatCompletionNotifications: true,
  enableNotificationSound: true,
  selectedChatMode: "agent",
  selectedTemplateId: DEFAULT_TEMPLATE_ID,
  isRunning: false,
  lastKnownPerformance: undefined,
  enableNativeGit: true,
  autoApproveChanges: true,
  autoExpandPreviewPanel: false,
  previewPosition: "right",
  chatLanguage: "es",
  showTokenBar: false,
  aiQueryLogRotationThreshold: "200",
  windowState: undefined,
  reasoningEffort: "medium",
  inferenceTemperature: 0.2,
  inferenceTopP: 0.95,
  inferenceRepetitionPenalty: 1.05,
  textVerbosity: "low",
  embeddingsEnabled: true,
  embeddingsModel: "openai/text-embedding-3-small",
  memoriesEnabled: true,
  memoriesAutoExtract: true,
  memoriesSynthesisModelV2: "mistralai/devstral-small",
  memoriesRouterModelV2: "mistralai/devstral-small",
  enableWebSearch: true,
  chatRenderMode: "zen",
  selectedFont: "bricolage-grotesque",
  selectedChatFont: "jetbrains-mono",
  fontScaleUI: 1,
  fontScaleSidebar: 1,
  fontScaleChat: 1,
  fontScaleBubbleWidth: 65,
  iconLibrary: "lucide",
};

// In-memory cache for composed settings to avoid recomputing every time (per-user)
const cachedSettingsMap = new Map<string, UserSettings>();

export function resetSettingsCache() {
  cachedSettingsMap.clear();
}

export function updateSettingsCache(settings: UserSettings) {
  const uid = settings.userId || getContextUserId() || preferencesCache.currentUserId || readSession()?.userId || "default";
  cachedSettingsMap.set(uid, settings);
}

export function resetSettingsToDefaults(): void {
  try {
    cachedSettingsMap.clear();
    clearSession();
    clearRuntimeState();
    logger.info("Settings reset to factory defaults and session cleared");
  } catch (error) {
    logger.error("Error resetting settings to defaults:", error);
  }
}

const RUNTIME_KEYS = new Set([
  "windowState",
  "secondaryWindowStates",
  "isRunning",
  "lastKnownPerformance",
  "hasRunBefore",
  "isTestMode",
]);

export function readSettings(): UserSettings {
  const uid = getContextUserId() || preferencesCache.currentUserId || (process.env.VIBES_CLOUD_MODE !== "1" ? readSession()?.userId : undefined) || "default";

  if (cachedSettingsMap.has(uid)) {
    return cachedSettingsMap.get(uid)!;
  }

  try {
    // 1. Get KV Preferences
    let kvPreferences: Record<string, any> = {};
    if (uid !== "default" && preferencesCache.isHydrated) {
      const prefsMap = preferencesCache.getAll(uid, 0);
      for (const [key, rawValue] of Object.entries(prefsMap)) {
        try {
          kvPreferences[key] = JSON.parse(rawValue);
        } catch {
          kvPreferences[key] = rawValue;
        }
      }
    }

    // 2. Get session & runtime
    const session = process.env.VIBES_CLOUD_MODE !== "1" ? readSession() : null;
    const runtime = readRuntimeState();

    // 3. Compose
    const combinedSettings: UserSettings = {
      ...DEFAULT_SETTINGS,
      ...kvPreferences,
      ...runtime,
    };

    if (uid !== "default") combinedSettings.userId = uid;
    else if (session?.userId) combinedSettings.userId = session.userId;

    if (session?.sessionToken) {
      combinedSettings.sessionToken = { value: session.sessionToken, encryptionType: "plaintext" };
    }

    // Normalize deprecated enum values (migration)
    if (combinedSettings.proSmartContextOption === "conservative") {
      combinedSettings.proSmartContextOption = undefined;
    }

    cachedSettingsMap.set(uid, combinedSettings as UserSettings);
    return combinedSettings as UserSettings;
  } catch (error) {
    logger.error("Error reading settings (Proxy):", error);
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: Partial<UserSettings>): void {
  try {
    const currentSettings = readSettings();
    const newSettings = { ...currentSettings, ...settings };
    
    const uid = settings.userId ?? getContextUserId() ?? preferencesCache.currentUserId ?? (process.env.VIBES_CLOUD_MODE !== "1" ? readSession()?.userId : undefined) ?? "default";

    // Update local compose cache immediately
    cachedSettingsMap.set(uid, newSettings);

    // 1. Session Updates (Only in desktop/electron mode)
    if (process.env.VIBES_CLOUD_MODE !== "1") {
      if (settings.userId !== undefined || settings.sessionToken !== undefined) {
        const sessionUid = settings.userId ?? readSession()?.userId;
        const tok = settings.sessionToken?.value ?? readSession()?.sessionToken;
        if (sessionUid && tok) {
          writeSession({ userId: sessionUid, sessionToken: tok });
        }
      }
    }

    // 2. Runtime Updates
    const runtimeUpdates: Partial<RuntimeState> = {};
    for (const key of Object.keys(settings)) {
      if (RUNTIME_KEYS.has(key)) {
        (runtimeUpdates as any)[key] = (settings as any)[key];
      }
    }
    if (Object.keys(runtimeUpdates).length > 0) {
      writeRuntimeState(runtimeUpdates);
    }

    // 3. KV Store Updates (All other keys including secrets go to KV)
    const kvUpdates: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      if (!RUNTIME_KEYS.has(key) && key !== "userId" && key !== "sessionToken") {
        kvUpdates[key] = typeof value === "string" ? value : JSON.stringify(value);
      }
    }

    if (uid !== "default" && Object.keys(kvUpdates).length > 0) {
      preferencesCache.setMany(uid, kvUpdates, 0);
    }

  } catch (error) {
    logger.error("Error writing settings (Proxy):", error);
  }
}

export function encrypt(data: string): Secret {
  if (safeStorage.isEncryptionAvailable() && !IS_TEST_BUILD) {
    return {
      value: safeStorage.encryptString(data).toString("base64"),
      encryptionType: "electron-safe-storage",
    };
  }
  return {
    value: data,
    encryptionType: "plaintext",
  };
}

export function decrypt(data: Secret): string {
  if (data.encryptionType === "electron-safe-storage") {
    if (!safeStorage?.decryptString) {
      logger.warn(
        "safeStorage.decryptString not available (possibly running in a worker thread). Returning raw value.",
      );
      return data.value;
    }
    return safeStorage.decryptString(Buffer.from(data.value, "base64"));
  }
  return data.value;
}
