import { db } from "../../db";
import { chatLogs } from "../../db/schema";
import { readSettings } from "../../main/settings";
import log from "electron-log";

const logger = log.scope("chat_logger");

export type ChatLogLevel = "debug" | "info" | "warn" | "error";
export type ChatLogCategory =
  | "model-selection"
  | "context-building"
  | "streaming"
  | "file-processing"
  | "tool-execution"
  | "error-handling"
  | "routing"
  | "smart-context"
  | "token-usage"
  | "general";

export interface ChatLogOptions {
  chatId: number;
  messageId?: number;
  level: ChatLogLevel;
  category: ChatLogCategory;
  message: string;
  metadata?: Record<string, any>;
}

/**
 * Log internal chat processing details for debugging and diagnostics.
 * Only logs if enableVerboseChatLogs setting is enabled.
 */
export async function logChatInternal(options: ChatLogOptions): Promise<void> {
  try {
    const settings = readSettings();

    // Skip if verbose logging is disabled
    if (!settings.enableVerboseChatLogs) {
      return;
    }

    await db.insert(chatLogs).values({
      chatId: options.chatId,
      messageId: options.messageId ?? null,
      level: options.level,
      category: options.category,
      message: options.message,
      metadata: options.metadata ?? null,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error("Failed to log chat internal", error);
  }
}

/**
 * Convenience function for debug level logs
 */
export async function logChatDebug(
  chatId: number,
  category: ChatLogCategory,
  message: string,
  metadata?: Record<string, any>,
  messageId?: number,
): Promise<void> {
  await logChatInternal({
    chatId,
    messageId,
    level: "debug",
    category,
    message,
    metadata,
  });
}

/**
 * Convenience function for info level logs
 */
export async function logChatInfo(
  chatId: number,
  category: ChatLogCategory,
  message: string,
  metadata?: Record<string, any>,
  messageId?: number,
): Promise<void> {
  await logChatInternal({
    chatId,
    messageId,
    level: "info",
    category,
    message,
    metadata,
  });
}

/**
 * Convenience function for warn level logs
 */
export async function logChatWarn(
  chatId: number,
  category: ChatLogCategory,
  message: string,
  metadata?: Record<string, any>,
  messageId?: number,
): Promise<void> {
  await logChatInternal({
    chatId,
    messageId,
    level: "warn",
    category,
    message,
    metadata,
  });
}

/**
 * Convenience function for error level logs
 */
export async function logChatError(
  chatId: number,
  category: ChatLogCategory,
  message: string,
  metadata?: Record<string, any>,
  messageId?: number,
): Promise<void> {
  await logChatInternal({
    chatId,
    messageId,
    level: "error",
    category,
    message,
    metadata,
  });
}
