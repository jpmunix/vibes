import { and, eq, inArray } from "drizzle-orm";
import { getRemoteDb } from "../db/remote";
import * as remoteSchema from "../db/remote-schema";
import { DEFAULT_SETTINGS } from "./settings-defaults";
import { preferencesCache } from "./preferences-cache";
import { resetSettingsCache } from "./settings";
import log from "electron-log";

const logger = log.scope("settings-registry");

/**
 * Official reset definition for a single setting.
 *
 * Card #200 (requirement bloqueante de munix): el sistema de settings puede
 * crecer y perderíamos el control del reset. Este registry FUERZA a definir el
 * reset oficial de cada setting: `SETTINGS_REGISTRY` se declara con anotación
 * `Record<keyof typeof DEFAULT_SETTINGS, SettingResetEntry>` → si añades una
 * clave a DEFAULT_SETTINGS sin registrarla aquí, TypeScript NO compila
 * (faltan claves) ni deja meter claves que ya no existen (sobran).
 *
 * - `kv`: la clave vive en `user_preferences` (KV store). El reset oficial es
 *   BORRAR la clave → `readSettings()` compone `{...DEFAULT_SETTINGS, ...}` y
 *   el default de fábrica aplica solo. `default` es documental (para el
 *   humano); el reset no escribe el valor, lo borra.
 * - `fn`: la clave necesita lógica propia de reset (tablas, regeneración, etc.).
 * - `skip`: la clave NO es config de usuario (runtime/sesión/local). Se marca
 *   explícitamente con su razón para que el reset exhaustivo sepa que no se
 *   toca por diseño.
 */
export type SettingReset =
  | { kind: "kv"; default?: unknown }
  | { kind: "fn"; fn: (userId: string) => Promise<void> | void }
  | { kind: "skip"; reason: string };

export interface SettingResetEntry {
  reset: SettingReset;
}

/**
 * Registry de resets oficiales, tipado contra las claves de DEFAULT_SETTINGS.
 *
 * BLOQUEANTE: si `DEFAULT_SETTINGS` gana una clave nueva y no se registra aquí,
 * `pnpm ts:main` falla. El test `settings-registry.test.ts` añade la red de
 * seguridad (mensaje de error claro + detección de claves obsoletas).
 */
export const SETTINGS_REGISTRY: Record<
  keyof typeof DEFAULT_SETTINGS,
  SettingResetEntry
> = {
  selectedModel: { reset: { kind: "kv", default: DEFAULT_SETTINGS.selectedModel } },
  providerSettings: { reset: { kind: "kv", default: {} } },
  strategistModel: { reset: { kind: "kv", default: DEFAULT_SETTINGS.strategistModel } },
  executorModel: { reset: { kind: "kv", default: DEFAULT_SETTINGS.executorModel } },
  telemetryConsent: { reset: { kind: "kv", default: "unset" } },
  telemetryUserId: { reset: { kind: "kv", default: undefined } },
  hasRunBefore: { reset: { kind: "skip", reason: "runtime/local-only (onboarding ya visto)" } },
  enableProLazyEditsMode: { reset: { kind: "kv", default: true } },
  enableProSmartFilesContextMode: { reset: { kind: "kv", default: true } },
  enableGithubAutoCommit: { reset: { kind: "kv", default: true } },
  enableChatCompletionNotifications: { reset: { kind: "kv", default: true } },
  enableNotificationSound: { reset: { kind: "kv", default: true } },
  selectedChatMode: { reset: { kind: "kv", default: "agent" } },
  selectedTemplateId: { reset: { kind: "kv", default: DEFAULT_SETTINGS.selectedTemplateId } },
  isRunning: { reset: { kind: "skip", reason: "runtime/local-only (estado de ejecución)" } },
  lastKnownPerformance: { reset: { kind: "skip", reason: "runtime/local-only (métrica)" } },
  enableNativeGit: { reset: { kind: "kv", default: true } },
  autoApproveChanges: { reset: { kind: "kv", default: true } },
  autoExpandPreviewPanel: { reset: { kind: "kv", default: false } },
  previewPosition: { reset: { kind: "kv", default: "right" } },
  chatLanguage: { reset: { kind: "kv", default: "es" } },
  showTokenBar: { reset: { kind: "kv", default: false } },
  aiQueryLogRotationThreshold: { reset: { kind: "kv", default: "200" } },
  windowState: { reset: { kind: "skip", reason: "runtime/local-only (bounds de ventana)" } },
  reasoningEffort: { reset: { kind: "kv", default: "medium" } },
  inferenceTemperature: { reset: { kind: "kv", default: 0.2 } },
  inferenceTopP: { reset: { kind: "kv", default: 0.95 } },
  inferenceRepetitionPenalty: { reset: { kind: "kv", default: 1.05 } },
  textVerbosity: { reset: { kind: "kv", default: "low" } },
  embeddingsEnabled: { reset: { kind: "kv", default: true } },
  embeddingsModel: { reset: { kind: "kv", default: DEFAULT_SETTINGS.embeddingsModel } },
  memoriesEnabled: { reset: { kind: "kv", default: true } },
  memoriesRouterModelV2: { reset: { kind: "kv", default: DEFAULT_SETTINGS.memoriesRouterModelV2 } },
  memoriesMaxSelection: { reset: { kind: "kv", default: 5 } },
  enableWebSearch: { reset: { kind: "kv", default: true } },
  chatRenderMode: { reset: { kind: "kv", default: "zen" } },
  selectedFont: { reset: { kind: "kv", default: DEFAULT_SETTINGS.selectedFont } },
  selectedChatFont: { reset: { kind: "kv", default: DEFAULT_SETTINGS.selectedChatFont } },
  fontScaleUI: { reset: { kind: "kv", default: 1 } },
  fontScaleSidebar: { reset: { kind: "kv", default: 1 } },
  fontScaleChat: { reset: { kind: "kv", default: 1 } },
  fontScaleBubbleWidth: { reset: { kind: "kv", default: 65 } },
  loaderStyle: { reset: { kind: "kv", default: "orbital" } },
};

/**
 * Tablas de DB que son "settings" y se resetean SIEMPRE (decisión munix):
 * prompts del usuario (custom + overrides de sistema) y sus categorías.
 * Los defaults de los prompts de sistema viven en código (DEFAULT_PROMPTS) —
 * al borrar las filas, la UI los vuelve a sintetizar sin override.
 */
async function resetPromptTables(userId: string): Promise<void> {
  const db = getRemoteDb();
  await db
    .delete(remoteSchema.prompts)
    .where(eq(remoteSchema.prompts.userId, userId));
  await db
    .delete(remoteSchema.promptsCategories)
    .where(eq(remoteSchema.promptsCategories.userId, userId));
}

/**
 * Resetea TODOS los settings registrados del usuario.
 *
 * Scope (decisión munix, card #200): SOLO settings. NO toca apps, chats,
 * sesiones runtime, ni archivos de apps. NO toca custom_agents, mcp_servers,
 * mcp_tool_consents, language_models ni la tabla legacy user_settings.
 */
export async function resetAllRegisteredSettings(userId: string): Promise<void> {
  const db = getRemoteDb();

  // 1. Claves kv: borrar del KV store (appId=0) → el default de fábrica aplica.
  const kvKeys = Object.entries(SETTINGS_REGISTRY)
    .filter(([, entry]) => entry.reset.kind === "kv")
    .map(([key]) => key);
  if (kvKeys.length > 0) {
    await db
      .delete(remoteSchema.userPreferences)
      .where(
        and(
          eq(remoteSchema.userPreferences.userId, userId),
          eq(remoteSchema.userPreferences.appId, 0),
          inArray(remoteSchema.userPreferences.key, kvKeys),
        ),
      );
  }

  // 2. Claves fn: lógica propia.
  for (const [key, entry] of Object.entries(SETTINGS_REGISTRY)) {
    if (entry.reset.kind === "fn") {
      await entry.reset.fn(userId);
    }
  }

  // 3. Tablas de prompts (custom + overrides) — parte fija del scope.
  await resetPromptTables(userId);

  // 4. Limpiar cachés en memoria: el próximo readSettings() recompondrá
  //    { ...DEFAULT_SETTINGS, ...runtime } sin las preferencias borradas.
  preferencesCache.clear();
  resetSettingsCache();

  logger.info(`Settings reset to factory defaults for user ${userId}`);
}
