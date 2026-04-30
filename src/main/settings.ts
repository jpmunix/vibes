import fs from "node:fs";
import path from "node:path";
import { getUserDataPath } from "../paths/paths";
import {
  UserSettingsSchema,
  type UserSettings,
  Secret,
  VertexProviderSetting,
  DEFAULT_STANDARD_MODEL,
} from "../lib/schemas";
import { safeStorage } from "electron";
import { v4 as uuidv4 } from "uuid";
import log from "electron-log";
import { DEFAULT_TEMPLATE_ID } from "@/shared/templates";
import { DEFAULT_THEME_ID } from "@/shared/themes";
import {
  DEFAULT_ENABLED_MODELS,
  FALLBACK_PRO_MODEL,
  FALLBACK_SELECTED_MODEL,
} from "@/ipc/shared/language_model_constants";
import { IS_TEST_BUILD } from "@/ipc/utils/test_utils";

const logger = log.scope("settings");

const DEFAULT_SETTINGS: UserSettings = {
  selectedModel: {
    name: FALLBACK_SELECTED_MODEL,
    provider: "openrouter",
  },
  providerSettings: {},
  // Unified model keys (v2) — two tiers replace the old 7 individual fields
  standardModeModel: DEFAULT_STANDARD_MODEL,
  proModeModel: FALLBACK_PRO_MODEL,
  telemetryConsent: "unset",
  telemetryUserId: uuidv4(),
  hasRunBefore: false,
  experiments: {},
  enableProLazyEditsMode: true,
  enableProSmartFilesContextMode: true,

  enableGithubAutoCommit: true,
  enableChatCompletionNotifications: true,
  selectedChatMode: "agent",
  selectedTemplateId: DEFAULT_TEMPLATE_ID,
  selectedThemeId: DEFAULT_THEME_ID,
  isRunning: false,
  lastKnownPerformance: undefined,
  // Enabled by default in 0.33.0-beta.1
  enableNativeGit: true,
  autoApproveChanges: true,
  autoExpandPreviewPanel: false,
  previewPosition: "right",
  chatLanguage: "es",
  showTokenBar: false,
  aiQueryLogRotationThreshold: "200",
  windowState: undefined,
  reasoningEffort: "medium",
  textVerbosity: "low",
  thinkingBudget: "medium",
  // Embeddings (enabled by default)
  embeddingsEnabled: true,
  embeddingsModel: "openai/text-embedding-3-small",
  // Memory system (enabled by default)
  memoriesEnabled: true,
  memoriesAutoExtract: true,
  memoriesSynthesisModelV2: "qwen/qwen3-coder",
  memoriesRouterModelV2: "google/gemini-3-flash-preview",
  // Web search — enabled by default so the model can search when needed
  enableWebSearch: true,
  // OpenCode LSP: enabled by default (per-file TypeScript diagnostics)
  enableOpenCodeLsp: true,
  // Chat render mode: "full" shows all badges/modals, "zen" shows only prose + cost
  chatRenderMode: "zen",
  // Default font
  selectedFont: "bricolage-grotesque",
  selectedChatFont: "jetbrains-mono",
  fontScaleUI: 1,
  fontScaleSidebar: 1,
  fontScaleChat: 1,
  fontScaleBubbleWidth: 65,
  // Icon family selection
  iconLibrary: "lucide",
};

const SETTINGS_FILE = "user-settings.json";

// In-memory cache for settings to avoid blocking I/O
let cachedSettings: UserSettings | null = null;

/** @internal — only for testing. Clears the in-memory cache so the next readSettings() re-reads from disk. */
export function resetSettingsCache() {
  cachedSettings = null;
}

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

    // ── Migration: v1 model defaults ──
    // Apply curated model defaults to existing users who haven't customized.
    // This runs once: the flag is persisted so it won't re-run on future launches.
    if (!(validatedSettings as any)._migrations?.v1_model_defaults_applied) {
      const OLD_DEFAULTS = [
        "", "SAME_AS_CHAT",
        "x-ai/grok-4.1-fast", "x-ai/grok-code-fast-1",
        "google/gemini-2.5-flash-lite", "openai/gpt-4.1-mini",
      ];
      const shouldMigrate = (current: string | undefined) =>
        !current || OLD_DEFAULTS.includes(current);

      const migrated: Partial<UserSettings> = {};
      if (shouldMigrate(validatedSettings.appTitleGenerationModel))
        (migrated as any).appTitleGenerationModel = DEFAULT_STANDARD_MODEL;
      if (shouldMigrate(validatedSettings.debateModel))
        (migrated as any).debateModel = DEFAULT_STANDARD_MODEL;
      if (shouldMigrate(validatedSettings.summaryModel))
        (migrated as any).summaryModel = DEFAULT_STANDARD_MODEL;
      if (shouldMigrate((validatedSettings as any).todoAnalysisModel))
        (migrated as any).todoAnalysisModel = DEFAULT_STANDARD_MODEL;
      if (shouldMigrate((validatedSettings as any).knowledgeExtractionModel))
        (migrated as any).knowledgeExtractionModel = FALLBACK_PRO_MODEL;


      // Mark migration as done and persist
      const migratedSettings = {
        ...validatedSettings,
        ...migrated,
        _migrations: { ...(validatedSettings as any)._migrations, v1_model_defaults_applied: true },
      };
      logger.info("[Migration] Applied v1 model defaults:", Object.keys(migrated));
      // Set cache BEFORE write to prevent re-entrant readSettings() from re-triggering migration
      cachedSettings = migratedSettings as UserSettings;
      try {
        writeSettings(migratedSettings);
      } catch (e) {
        logger.error("[Migration] Failed to persist v1 model defaults:", e);
      }
      return migratedSettings as UserSettings;
    }

    // ── Migration: v2 gemini-3-pro → gemini-3.1-pro ──
    // Replace the deprecated gemini-3-pro-preview with gemini-3.1-pro-preview
    // in enabledOpenRouterModels and selectedModel. Runs once.
    if (!(validatedSettings as any)._migrations?.v2_gemini31_pro_applied) {
      const OLD_MODEL = "google/gemini-3-pro-preview";
      const NEW_MODEL = "google/gemini-3.1-pro-preview";
      const migrated: Partial<UserSettings> = {};

      // Migrate enabledOpenRouterModels
      const enabledModels = (validatedSettings as any).enabledOpenRouterModels as string[] | undefined;
      if (enabledModels && Array.isArray(enabledModels)) {
        const idx = enabledModels.indexOf(OLD_MODEL);
        if (idx !== -1) {
          const updated = [...enabledModels];
          // Replace old with new, unless new is already present
          if (!updated.includes(NEW_MODEL)) {
            updated[idx] = NEW_MODEL;
          } else {
            updated.splice(idx, 1);
          }
          (migrated as any).enabledOpenRouterModels = updated;
        } else if (!enabledModels.includes(NEW_MODEL)) {
          // Old model not present and new model not present either — add the new one
          (migrated as any).enabledOpenRouterModels = [...enabledModels, NEW_MODEL];
        }
      }

      // Migrate selectedModel if it points to the old model
      if (validatedSettings.selectedModel?.name === OLD_MODEL) {
        migrated.selectedModel = {
          ...validatedSettings.selectedModel,
          name: NEW_MODEL,
        };
      }

      // Mark migration as done and persist
      const migratedSettings = {
        ...validatedSettings,
        ...migrated,
        _migrations: { ...(validatedSettings as any)._migrations, v2_gemini31_pro_applied: true },
      };
      logger.info("[Migration] Applied v2 gemini-3.1-pro swap:", Object.keys(migrated));
      // Set cache BEFORE write to prevent re-entrant readSettings() from re-triggering migration
      cachedSettings = migratedSettings as UserSettings;
      try {
        writeSettings(migratedSettings);
      } catch (e) {
        logger.error("[Migration] Failed to persist v2 gemini-3.1-pro swap:", e);
      }
      return migratedSettings as UserSettings;
    }

    // ── Migration: v3 curated model list ──
    // Replace enabledOpenRouterModels with the new curated 10-model list.
    // Also migrate selectedModel if it's no longer in the curated set.
    if (!(validatedSettings as any)._migrations?.v3_curated_models_applied) {
      const migrated: Partial<UserSettings> = {};

      // Force the curated list
      (migrated as any).enabledOpenRouterModels = [...DEFAULT_ENABLED_MODELS];

      // If the currently selected model is not in the new curated list, switch to default
      const currentModelName = validatedSettings.selectedModel?.name;
      if (currentModelName && !DEFAULT_ENABLED_MODELS.includes(currentModelName)) {
        migrated.selectedModel = {
          name: FALLBACK_SELECTED_MODEL,
          provider: "openrouter",
        };
        logger.info(`[Migration v3] Migrated selectedModel from ${currentModelName} to gemini-3-flash-preview`);
      }

      // Mark migration as done and persist
      const migratedSettings = {
        ...validatedSettings,
        ...migrated,
        _migrations: { ...(validatedSettings as any)._migrations, v3_curated_models_applied: true },
      };
      logger.info("[Migration] Applied v3 curated model list");
      // Set cache BEFORE write to prevent re-entrant readSettings() from re-triggering migration
      cachedSettings = migratedSettings as UserSettings;
      try {
        writeSettings(migratedSettings);
      } catch (e) {
        logger.error("[Migration] Failed to persist v3 curated model list:", e);
      }
      return migratedSettings as UserSettings;
    }

    // ── Migration: v4 qwen-plus → qwen-plus:thinking ──
    // Replace the base qwen/qwen-plus-2025-07-28 with the :thinking variant
    // in enabledOpenRouterModels and selectedModel. Runs once.
    if (!(validatedSettings as any)._migrations?.v4_qwen_thinking_model) {
      const OLD_QWEN = "qwen/qwen-plus-2025-07-28";
      const NEW_QWEN = "qwen/qwen-plus-2025-07-28:thinking";
      const migrated: Partial<UserSettings> = {};

      // Migrate enabledOpenRouterModels
      const enabledModels = (validatedSettings as any).enabledOpenRouterModels as string[] | undefined;
      if (enabledModels && Array.isArray(enabledModels)) {
        const idx = enabledModels.indexOf(OLD_QWEN);
        if (idx !== -1) {
          const updated = [...enabledModels];
          if (!updated.includes(NEW_QWEN)) {
            updated[idx] = NEW_QWEN;
          } else {
            updated.splice(idx, 1);
          }
          (migrated as any).enabledOpenRouterModels = updated;
        }
      }

      // Migrate selectedModel if it points to the old model
      if (validatedSettings.selectedModel?.name === OLD_QWEN) {
        migrated.selectedModel = {
          ...validatedSettings.selectedModel,
          name: NEW_QWEN,
        };
      }

      // Mark migration as done and persist
      const migratedSettings = {
        ...validatedSettings,
        ...migrated,
        _migrations: { ...(validatedSettings as any)._migrations, v4_qwen_thinking_model: true },
      };
      logger.info("[Migration] Applied v4 qwen-plus:thinking swap:", Object.keys(migrated));
      cachedSettings = migratedSettings as UserSettings;
      try {
        writeSettings(migratedSettings);
      } catch (e) {
        logger.error("[Migration] Failed to persist v4 qwen-plus:thinking swap:", e);
      }
      return migratedSettings as UserSettings;
    }

    // ── Migration: v5 unified model keys ──
    // Replace the 7 individual model fields with 2 unified keys:
    //   standardModeModel  (cheap/fast)  ← appTitleGenerationModel, todoAnalysisModel, summaryModel, debateModel
    //   proModeModel        (thinking)   ← turboEditModel, knowledgeExtractionModel
    if (!(validatedSettings as any)._migrations?.v5_unified_model_keys) {
      const migrated: Partial<UserSettings> = {};
      const vs = validatedSettings as any;

      // Pick the best value for standardModeModel from old fields (first non-empty wins)
      const standardCandidate = vs.standardModeModel || vs.appTitleGenerationModel || vs.summaryModel || vs.todoAnalysisModel || vs.debateModel;
      if (standardCandidate) {
        (migrated as any).standardModeModel = standardCandidate;
      } else {
        (migrated as any).standardModeModel = DEFAULT_STANDARD_MODEL;
      }

      // Pick the best value for proModeModel from old fields
      const proCandidate = vs.proModeModel || vs.turboEditModel || vs.knowledgeExtractionModel;
      if (proCandidate && proCandidate !== "SAME_AS_CHAT") {
        (migrated as any).proModeModel = proCandidate;
      } else {
        (migrated as any).proModeModel = FALLBACK_PRO_MODEL;
      }

      const migratedSettings = {
        ...validatedSettings,
        ...migrated,
        _migrations: { ...(validatedSettings as any)._migrations, v5_unified_model_keys: true },
      };
      logger.info("[Migration] Applied v5 unified model keys:", migrated);
      cachedSettings = migratedSettings as UserSettings;
      try {
        writeSettings(migratedSettings);
      } catch (e) {
        logger.error("[Migration] Failed to persist v5 unified model keys:", e);
      }
      return migratedSettings as UserSettings;
    }

    // ── Migration: v6 reasoning effort high ──
    // Set reasoningEffort to "high" for everyone who hasn't explicitly set it to something else,
    // or who was using the old default (medium).
    if (!(validatedSettings as any)._migrations?.v6_reasoning_effort_high) {
      const migrated: Partial<UserSettings> = {};
      const currentEffort = (validatedSettings as any).reasoningEffort;

      if (!currentEffort || currentEffort === "medium") {
        (migrated as any).reasoningEffort = "high";
      }

      const migratedSettings = {
        ...validatedSettings,
        ...migrated,
        _migrations: { ...(validatedSettings as any)._migrations, v6_reasoning_effort_high: true },
      };
      logger.info("[Migration] Applied v6 reasoning effort high:", migrated);
      cachedSettings = migratedSettings as UserSettings;
      try {
        writeSettings(migratedSettings);
      } catch (e) {
        logger.error("[Migration] Failed to persist v6 reasoning effort high:", e);
      }
      return migratedSettings as UserSettings;
    }

    // ── Migration: v7 reasoning effort medium ──
    // Revert reasoning effort from "high" (set by v6) back to "medium".
    // "medium" provides a better balance of speed and quality for most use cases.
    if (!(validatedSettings as any)._migrations?.v7_reasoning_effort_medium) {
      const migrated: Partial<UserSettings> = {};
      const currentEffort = (validatedSettings as any).reasoningEffort;

      if (!currentEffort || currentEffort === "high") {
        (migrated as any).reasoningEffort = "medium";
      }

      const migratedSettings = {
        ...validatedSettings,
        ...migrated,
        _migrations: { ...(validatedSettings as any)._migrations, v7_reasoning_effort_medium: true },
      };
      logger.info("[Migration] Applied v7 reasoning effort medium:", migrated);
      cachedSettings = migratedSettings as UserSettings;
      try {
        writeSettings(migratedSettings);
      } catch (e) {
        logger.error("[Migration] Failed to persist v7 reasoning effort medium:", e);
      }
      return migratedSettings as UserSettings;
    }

    // ── Migration: v8 reasoning effort simplification ──
    // Normalize legacy reasoning effort values to the 3 supported levels (low/medium/high).
    // none → medium, minimal → medium, xhigh → high. Other values pass through.
    if (!(validatedSettings as any)._migrations?.v8_reasoning_effort_simplify) {
      const migrated: Partial<UserSettings> = {};
      const currentEffort = (validatedSettings as any).reasoningEffort as string | undefined;

      const EFFORT_MAP: Record<string, string> = {
        "none": "medium",
        "minimal": "medium",
        "xhigh": "high",
      };
      if (currentEffort && EFFORT_MAP[currentEffort]) {
        (migrated as any).reasoningEffort = EFFORT_MAP[currentEffort];
      }

      const migratedSettings = {
        ...validatedSettings,
        ...migrated,
        _migrations: { ...(validatedSettings as any)._migrations, v8_reasoning_effort_simplify: true },
      };
      logger.info("[Migration] Applied v8 reasoning effort simplification:", migrated);
      cachedSettings = migratedSettings as UserSettings;
      try {
        writeSettings(migratedSettings);
      } catch (e) {
        logger.error("[Migration] Failed to persist v8 reasoning effort simplification:", e);
      }
      return migratedSettings as UserSettings;
    }

    // ── Migration: v9 memory model defaults ──
    // Hard migration: force memory models to qwen3-coder (synthesis) and gemini-3-flash (selection).
    if (!(validatedSettings as any)._migrations?.v9_memory_model_defaults) {
      const migratedSettings = {
        ...validatedSettings,
        memoriesSynthesisModelV2: "qwen/qwen3-coder",
        memoriesRouterModelV2: "google/gemini-3-flash-preview",
        _migrations: { ...(validatedSettings as any)._migrations, v9_memory_model_defaults: true },
      };
      logger.info("[Migration] Applied v9 memory model defaults (hard)");
      cachedSettings = migratedSettings as UserSettings;
      try {
        writeSettings(migratedSettings);
      } catch (e) {
        logger.error("[Migration] Failed to persist v9 memory model defaults:", e);
      }
      return migratedSettings as UserSettings;
    }

    // Update cache
    cachedSettings = validatedSettings;

    return validatedSettings;
  } catch (error) {
    logger.error("Error reading settings:", error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Write settings to the LOCAL disk and update the in-memory cache.
 *
 * ⚠️  LOCAL-ONLY — this function does NOT:
 *   1. Sync to Bunny DB (remote persistence across devices).
 *   2. Notify the renderer (the UI atom stays stale).
 *
 * If you need the full settings pipeline (disk + Bunny + renderer atom),
 * use one of these instead:
 *   - **From the renderer**: call `updateSettings()` via `useSettings()` hook,
 *     which invokes the `setUserSettings` IPC handler (settings_handlers.ts).
 *     That handler writes to disk, syncs to Bunny, and returns the updated
 *     settings so the atom refreshes.
 *   - **From the main process**: call `writeSettings()` and then manually:
 *     (a) broadcast `"settings:updated-from-backend"` to all BrowserWindows,
 *     (b) sync to Bunny DB via `db.update(remoteSchema.userSettings)`.
 *     See `persistPermissionToSettings()` in opencode_adapter.ts for an example.
 */
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
