import { AI_MESSAGES_SDK_VERSION, AiMessagesJsonV6 } from "@/db/remote-schema";
import type { ModelMessage } from "ai";
import log from "electron-log";

const logger = log.scope("ai_messages_utils");

/** Maximum size in bytes for ai_messages_json (10MB) */
export const MAX_AI_MESSAGES_SIZE = 10_000_000;

/**
 * Check if ai_messages_json is within size limits and return the value to save.
 * Returns undefined if the messages exceed the size limit.
 */
export function getAiMessagesJsonIfWithinLimit(
  aiMessages: ModelMessage[],
): AiMessagesJsonV6 | undefined {
  if (!aiMessages || aiMessages.length === 0) {
    return undefined;
  }

  const payload: AiMessagesJsonV6 = {
    messages: aiMessages,
    sdkVersion: AI_MESSAGES_SDK_VERSION,
  };

  const jsonStr = JSON.stringify(payload);
  if (jsonStr.length <= MAX_AI_MESSAGES_SIZE) {
    return payload;
  }

  logger.warn(
    `ai_messages_json too large (${jsonStr.length} bytes), skipping save`,
  );
  return undefined;
}

// Type for a message from the database used by parseAiMessagesJson
export type DbMessageForParsing = {
  id: number;
  role: string;
  content: string;
  aiMessagesJson: AiMessagesJsonV6 | ModelMessage[] | string | null;
};

/**
 * Parse ai_messages_json with graceful fallback to simple content reconstruction.
 * If aiMessagesJson is missing, malformed, or incompatible with the current AI SDK,
 * falls back to constructing a basic message from role and content.
 *
 * This is a pure function - it doesn't log or have side effects.
 */
export function parseAiMessagesJson(msg: DbMessageForParsing): ModelMessage[] {
  if (msg.aiMessagesJson) {
    let parsed: any = msg.aiMessagesJson;

    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = null;
      }
    }

    // Legacy shape: stored directly as a ModelMessage[]
    if (
      Array.isArray(parsed) &&
      parsed.every((m) => m && typeof m.role === "string")
    ) {
      return parsed;
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "sdkVersion" in parsed &&
      (parsed as AiMessagesJsonV6).sdkVersion === AI_MESSAGES_SDK_VERSION &&
      "messages" in parsed &&
      Array.isArray((parsed as AiMessagesJsonV6).messages) &&
      (parsed as AiMessagesJsonV6).messages.every(
        (m: ModelMessage) => m && typeof m.role === "string",
      )
    ) {
      return (parsed as AiMessagesJsonV6).messages;
    }
  }

  // Fallback for legacy messages, missing data, or incompatible formats
  return [
    {
      role: msg.role as "user" | "assistant",
      content: msg.content,
    },
  ];
}

/**
 * Strip image parts from all user messages except the last one.
 * This prevents re-sending images from previous turns to models
 * that may not support image input, avoiding 404 errors from OpenRouter.
 *
 * The last user message (current turn) keeps its images intact.
 */
export function stripImagePartsFromHistory(
  messages: ModelMessage[],
): ModelMessage[] {
  if (messages.length === 0) return messages;

  // Find the index of the last user message
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  return messages.map((msg, index) => {
    // Keep last user message and all non-user messages as-is
    if (index === lastUserIndex || msg.role !== "user") {
      return msg;
    }

    // Only process user messages with array content (image parts)
    if (!Array.isArray(msg.content)) {
      return msg;
    }

    // Filter out image parts
    const nonImageParts = (msg.content as any[]).filter(
      (part: any) => part.type !== "image",
    );

    // If nothing was filtered, return as-is
    if (nonImageParts.length === msg.content.length) {
      return msg;
    }

    // If only text parts remain, simplify
    if (nonImageParts.length === 1 && nonImageParts[0].type === "text") {
      return { ...msg, content: nonImageParts[0].text };
    }

    // If all parts were images, replace with a placeholder
    if (nonImageParts.length === 0) {
      return { ...msg, content: "[image attachment]" };
    }

    // Return with remaining non-image parts
    return { ...msg, content: nonImageParts };
  });
}
