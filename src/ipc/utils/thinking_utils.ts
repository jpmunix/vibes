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
    if (settings.selectedChatMode === "local-agent") {
      return {
        reasoning: {
          summary: "detailed",
          effort,
        },
      };
    }
    return { reasoning_effort: effort };
  }
  if (providerId === "openrouter") {
    if (effort === "none") {
      return {};
    }
    return {
      reasoning: {
        effort,
      },
    };
  }
  return {};
}

