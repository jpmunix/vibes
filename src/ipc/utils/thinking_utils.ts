import type { UserSettings } from "../../lib/schemas";

export function getExtraProviderOptions(
  providerId: string | undefined,
  settings: UserSettings,
): Record<string, any> {
  if (!providerId) {
    return {};
  }
  const effort = settings.reasoningEffort ?? "high";
  if (providerId === "openai") {
    if (settings.selectedChatMode === "agent") {
      return {
        reasoning: {
          summary: "detailed",
          effort,
        },
      };
    }
    return { reasoning_effort: effort };
  }
  // NOTE: Do NOT send reasoning.effort for OpenRouter — most models don't
  // support it, and OpenRouter returns 400 instead of ignoring the field.
  // OpenRouter applies per-model reasoning defaults automatically.
  return {};
}

