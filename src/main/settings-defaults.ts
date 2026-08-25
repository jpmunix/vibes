import {
  type UserSettings,
  DEFAULT_EXECUTOR_MODEL,
  DEFAULT_STRATEGIST_MODEL,
} from "../lib/schemas";
import { v4 as uuidv4 } from "uuid";
import { DEFAULT_TEMPLATE_ID } from "@/shared/templates";
import { FALLBACK_SELECTED_MODEL } from "@/ipc/shared/language_model_constants";

/**
 * Default settings (factory values).
 *
 * Moved to its own pure module (no electron-log, no preferences-cache) so the
 * settings registry can import it without pulling in side-effectful modules.
 *
 * Card #200: the settings registry types itself against `keyof typeof
 * DEFAULT_SETTINGS` — if you add a key here WITHOUT registering its official
 * reset in `settings-registry.ts`, TypeScript fails to compile. That is the
 * blocking mechanism that keeps the reset exhaustive as settings grow.
 */
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
  memoriesRouterModelV2: "mistralai/devstral-small",
  memoriesMaxSelection: 5,
  enableWebSearch: true,
  chatRenderMode: "zen",
  selectedFont: "bricolage-grotesque",
  selectedChatFont: "jetbrains-mono",
  fontScaleUI: 1,
  fontScaleSidebar: 1,
  fontScaleChat: 1,
  fontScaleBubbleWidth: 65,
  loaderStyle: "orbital",
};
