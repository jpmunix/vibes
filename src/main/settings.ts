import fs from "node:fs";
import path from "node:path";
import { getUserDataPath } from "../paths/paths";
import {
  UserSettingsSchema,
  type UserSettings,
  Secret,
  VertexProviderSetting,
} from "../lib/schemas";
import { safeStorage } from "electron";
import { v4 as uuidv4 } from "uuid";
import log from "electron-log";
import { DEFAULT_TEMPLATE_ID } from "@/shared/templates";
import { DEFAULT_THEME_ID } from "@/shared/themes";
import { IS_TEST_BUILD } from "@/ipc/utils/test_utils";

const logger = log.scope("settings");

const DEFAULT_SETTINGS: UserSettings = {
  selectedModel: {
    name: "google/gemini-3-flash-preview",
    provider: "openrouter",
  },
  providerSettings: {},
  turboEditModel: "openai/gpt-4.1",
  appTitleGenerationModel: "openai/gpt-5-mini",
  debateModel: "x-ai/grok-4.1-fast",
  summaryModel: "x-ai/grok-4.1-fast",
  telemetryConsent: "unset",
  telemetryUserId: uuidv4(),
  hasRunBefore: false,
  experiments: {},
  enableProLazyEditsMode: true,
  enableTurboEditsV2: true,
  enableProSmartFilesContextMode: true,
  enableLocalSmartContext: true,
  enableMcpSmartContext: false,
  enableTokenStats: true,
  enableVerboseChatLogs: true,
  enableGithubAutoCommit: true,
  enableChatCompletionNotifications: true,
  autoFixModel: {
    name: "google/gemini-3-flash-preview",
    provider: "openrouter",
  },
  autoFixMaxDurationMs: 20_000,
  autoFixMaxAttempts: 1,
  autoFixMaxIssues: 5,
  selectedChatMode: "build",
  enableAutoFixProblems: false,
  enableBackgroundProblemAutoFix: false,
  enableAutoRepairRuntimeErrors: true,
  selectedTemplateId: DEFAULT_TEMPLATE_ID,
  selectedThemeId: DEFAULT_THEME_ID,
  isRunning: false,
  lastKnownPerformance: undefined,
  // Enabled by default in 0.33.0-beta.1
  enableNativeGit: true,
  autoExpandPreviewPanel: false,
  chatLanguage: "es",
  showTokenBar: false,
  aiQueryLogRotationThreshold: "200",
  windowState: undefined,
};

const SETTINGS_FILE = "user-settings.json";

// In-memory cache for settings to avoid blocking I/O
let cachedSettings: UserSettings | null = null;

export function getSettingsFilePath(): string {
  return path.join(getUserDataPath(), SETTINGS_FILE);
}

export function readSettings(): UserSettings {
  // Return cached settings if available
  if (cachedSettings) {
    return cachedSettings;
  }

  try {
    const filePath = getSettingsFilePath();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(DEFAULT_SETTINGS, null, 2));
      cachedSettings = DEFAULT_SETTINGS;
      return DEFAULT_SETTINGS;
    }
    const rawSettings = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const combinedSettings: UserSettings = {
      ...DEFAULT_SETTINGS,
      ...rawSettings,
    };
    const supabase = combinedSettings.supabase;

    // Decrypt legacy tokens
    if (supabase) {
      const decryptLegacy = (secret: Secret | undefined): Secret | undefined => {
        if (!secret || secret.encryptionType !== "electron-safe-storage") return secret;
        try {
          return {
            value: decrypt(secret),
            encryptionType: "plaintext",
          };
        } catch (e) {
          logger.error("Failed to decrypt legacy secret:", e);
          return secret;
        }
      };
      supabase.refreshToken = decryptLegacy(supabase.refreshToken);
      supabase.accessToken = decryptLegacy(supabase.accessToken);
    }

    // Decrypt tokens for each organization in the organizations map
    if (supabase && supabase.organizations) {
      for (const orgId in supabase.organizations) {
        const org = supabase.organizations[orgId];
        try {
          if (org.accessToken && org.accessToken.encryptionType === "electron-safe-storage") {
            org.accessToken = {
              value: decrypt(org.accessToken),
              encryptionType: "plaintext",
            };
          }
        } catch (e) {
          logger.error(`Failed to decrypt accessToken for org ${orgId}:`, e);
        }

        try {
          if (org.refreshToken && org.refreshToken.encryptionType === "electron-safe-storage") {
            org.refreshToken = {
              value: decrypt(org.refreshToken),
              encryptionType: "plaintext",
            };
          }
        } catch (e) {
          logger.error(`Failed to decrypt refreshToken for org ${orgId}:`, e);
        }
      }
    }

    const decryptSafe = (secret: Secret | undefined): Secret | undefined => {
      if (!secret || secret.encryptionType !== "electron-safe-storage") return secret;
      try {
        return {
          value: decrypt(secret),
          encryptionType: "plaintext",
        };
      } catch (e) {
        logger.error("Failed to decrypt field, keeping encrypted value:", e);
        return secret;
      }
    };

    if (combinedSettings.neon) {
      combinedSettings.neon.accessToken = decryptSafe(combinedSettings.neon.accessToken);
      combinedSettings.neon.refreshToken = decryptSafe(combinedSettings.neon.refreshToken);
    }

    if (combinedSettings.firebase) {
      combinedSettings.firebase.accessToken = decryptSafe(combinedSettings.firebase.accessToken);
      combinedSettings.firebase.refreshToken = decryptSafe(combinedSettings.firebase.refreshToken);
    }

    if (combinedSettings.githubAccessToken) {
      combinedSettings.githubAccessToken = decryptSafe(combinedSettings.githubAccessToken);
    }

    if (combinedSettings.vercelAccessToken) {
      combinedSettings.vercelAccessToken = decryptSafe(combinedSettings.vercelAccessToken);
    }

    for (const provider in combinedSettings.providerSettings) {
      const p = combinedSettings.providerSettings[provider] as any;
      if (p.apiKey) {
        p.apiKey = decryptSafe(p.apiKey);
      }
      if (provider === "vertex" && p.serviceAccountKey) {
        p.serviceAccountKey = decryptSafe(p.serviceAccountKey);
      }
      if (p.keys && Array.isArray(p.keys)) {
        for (const keyEntry of p.keys) {
          keyEntry.key = decryptSafe(keyEntry.key);
        }
      }
    }

    // Validate and merge with defaults
    const validatedSettings = UserSettingsSchema.parse(combinedSettings);
    // "conservative" is deprecated, use undefined to use the default value
    if (validatedSettings.proSmartContextOption === "conservative") {
      validatedSettings.proSmartContextOption = undefined;
    }

    // Update cache
    cachedSettings = validatedSettings;

    return validatedSettings;
  } catch (error) {
    logger.error("Error reading settings:", error);
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: Partial<UserSettings>): void {
  try {
    const filePath = getSettingsFilePath();

    // Use readSettings which now uses cache
    const currentSettings = readSettings();
    const newSettings = { ...currentSettings, ...settings };

    // Update cache immediately with UNENCRYPTED values
    cachedSettings = newSettings;

    // Create a deep clone for encryption/writing to avoid mutating the cache
    const settingsToWrite = JSON.parse(JSON.stringify(newSettings));

    const encryptSafe = (secret: Secret | undefined): Secret | undefined => {
      if (!secret) return secret;
      // If already encrypted, don't double-encrypt
      if (secret.encryptionType === "electron-safe-storage") return secret;
      return encrypt(secret.value);
    };

    if (settingsToWrite.githubAccessToken) {
      settingsToWrite.githubAccessToken = encryptSafe(settingsToWrite.githubAccessToken);
    }
    if (settingsToWrite.vercelAccessToken) {
      settingsToWrite.vercelAccessToken = encryptSafe(settingsToWrite.vercelAccessToken);
    }
    if (settingsToWrite.supabase) {
      // Encrypt legacy tokens (kept for backwards compat)
      settingsToWrite.supabase.accessToken = encryptSafe(settingsToWrite.supabase.accessToken);
      settingsToWrite.supabase.refreshToken = encryptSafe(settingsToWrite.supabase.refreshToken);

      // Encrypt tokens for each organization in the organizations map
      if (settingsToWrite.supabase.organizations) {
        for (const orgId in settingsToWrite.supabase.organizations) {
          const org = settingsToWrite.supabase.organizations[orgId];
          org.accessToken = encryptSafe(org.accessToken) as Secret; // Schema says it's required
          org.refreshToken = encryptSafe(org.refreshToken) as Secret;
        }
      }
    }
    if (settingsToWrite.neon) {
      settingsToWrite.neon.accessToken = encryptSafe(settingsToWrite.neon.accessToken);
      settingsToWrite.neon.refreshToken = encryptSafe(settingsToWrite.neon.refreshToken);
    }
    if (settingsToWrite.firebase) {
      settingsToWrite.firebase.accessToken = encryptSafe(settingsToWrite.firebase.accessToken);
      settingsToWrite.firebase.refreshToken = encryptSafe(settingsToWrite.firebase.refreshToken);
    }
    for (const provider in settingsToWrite.providerSettings) {
      const p = settingsToWrite.providerSettings[provider] as any;
      if (p.apiKey) {
        p.apiKey = encryptSafe(p.apiKey);
      }
      // Encrypt Vertex service account key if present
      if (provider === "vertex" && p.serviceAccountKey) {
        p.serviceAccountKey = encryptSafe(p.serviceAccountKey);
      }
      // Encrypt OpenRouter keys if present
      if (p.keys && Array.isArray(p.keys)) {
        for (const keyEntry of p.keys) {
          keyEntry.key = encryptSafe(keyEntry.key) as Secret;
        }
      }
    }
    const validatedSettings = UserSettingsSchema.parse(settingsToWrite);
    fs.writeFileSync(filePath, JSON.stringify(validatedSettings, null, 2));
  } catch (error) {
    logger.error("Error writing settings:", error);
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
    // safeStorage is not available in worker threads (e.g. context_worker)
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
