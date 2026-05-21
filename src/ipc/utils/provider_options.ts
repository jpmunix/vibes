import type { SmartContextMode, UserSettings } from "../../lib/schemas";
import type { CodebaseFile } from "../../utils/codebase";
import type { VersionedFiles } from "./versioned_codebase_context";
import { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { getExtraProviderOptions } from "./thinking_utils";

export interface MentionedAppCodebase {
  appName: string;
  files: CodebaseFile[];
}

export interface GetProviderOptionsParams {
  vibesAppId: number;
  vibesRequestId?: string;
  vibesDisableFiles?: boolean;
  smartContextMode?: SmartContextMode;
  files: CodebaseFile[];
  versionedFiles?: VersionedFiles;
  mentionedAppsCodebases: MentionedAppCodebase[];
  builtinProviderId: string | undefined;
  settings: UserSettings;
  /** OpenRouter service_tier for request prioritization */
  serviceTier?: "default" | "batch";
}

/**
 * Builds provider options for the AI SDK streamText call.
 */
export function getProviderOptions({
  vibesAppId,
  vibesRequestId,
  vibesDisableFiles,
  smartContextMode,
  files,
  versionedFiles,
  mentionedAppsCodebases,
  builtinProviderId,
  settings,
  serviceTier,
}: GetProviderOptionsParams): Record<string, any> {
  const extraOptions = getExtraProviderOptions(builtinProviderId, settings);

  // Merge service_tier into openrouter/gateway options when provided
  const repetitionPenalty = settings.inferenceRepetitionPenalty;
  const routerOptions = {
    ...extraOptions,
    ...(serviceTier ? { service_tier: serviceTier } : {}),
    // OpenRouter-specific: repetition_penalty (range 0-2, default 1.0)
    // This is NOT the same as frequency_penalty — it penalizes based on original token probability
    ...(repetitionPenalty !== undefined ? { repetition_penalty: repetitionPenalty } : {}),
  };

  const providerOptions: Record<string, any> = {
    "vibes-engine": {
      vibesAppId,
      vibesRequestId,
      vibesDisableFiles,
      vibesSmartContextMode: smartContextMode,
      vibesFiles: versionedFiles ? undefined : files,
      vibesVersionedFiles: versionedFiles,
      vibesMentionedApps: mentionedAppsCodebases.map(({ files, appName }) => ({
        appName,
        files,
      })),
    },
    "vibes-gateway": routerOptions,
    openrouter: routerOptions,
    openai: {
      reasoningSummary: "auto",
    } satisfies OpenAIResponsesProviderOptions,
  };

  return providerOptions;
}

export interface GetAiHeadersParams {
  builtinProviderId: string | undefined;
}

/**
 * Returns AI request headers based on the provider.
 */
export function getAiHeaders({
  builtinProviderId,
}: GetAiHeadersParams): Record<string, string> | undefined {
  return undefined;
}
