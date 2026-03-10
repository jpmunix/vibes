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
  dyadAppId: number;
  dyadRequestId?: string;
  dyadDisableFiles?: boolean;
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
  dyadAppId,
  dyadRequestId,
  dyadDisableFiles,
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
  const routerOptions = serviceTier
    ? { ...extraOptions, service_tier: serviceTier }
    : extraOptions;

  const providerOptions: Record<string, any> = {
    "vibes-engine": {
      dyadAppId,
      dyadRequestId,
      dyadDisableFiles,
      dyadSmartContextMode: smartContextMode,
      dyadFiles: versionedFiles ? undefined : files,
      dyadVersionedFiles: versionedFiles,
      dyadMentionedApps: mentionedAppsCodebases.map(({ files, appName }) => ({
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
