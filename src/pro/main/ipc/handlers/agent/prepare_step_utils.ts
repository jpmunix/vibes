/**
 * Utility for preparing step messages with injected user content.
 *
 * This module contains pure functions extracted from the prepareStep callback
 * in local_agent_handler.ts, enabling isolated unit testing.
 */

import { ImagePart, ModelMessage, TextPart, UserModelMessage } from "ai";
import type { UserMessageContentPart } from "./tools/types";

/**
 * A message that has been processed and is ready to inject.
 */
export interface InjectedMessage {
  insertAtIndex: number;
  /** Sequence number to preserve FIFO order for same-index messages */
  sequence: number;
  message: UserModelMessage;
}

/**
 * Transform a UserMessageContentPart to the format expected by the AI SDK.
 */
export function transformContentPart(
  part: UserMessageContentPart,
): TextPart | ImagePart {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }
  // part.type === "image-url"
  return { type: "image", image: new URL(part.url) };
}

/**
 * Process pending user messages and add them to the injected messages list.
 * Each message is recorded with the current message count as its insertion index.
 *
 * @param pendingUserMessages - Queue of pending messages (will be mutated/emptied)
 * @param allInjectedMessages - List of already injected messages (will be mutated)
 * @param currentMessageCount - The current number of messages in the conversation
 */
export function processPendingMessages(
  pendingUserMessages: UserMessageContentPart[][],
  allInjectedMessages: InjectedMessage[],
  currentMessageCount: number,
): void {
  while (pendingUserMessages.length > 0) {
    const content = pendingUserMessages.shift()!;
    allInjectedMessages.push({
      insertAtIndex: currentMessageCount,
      sequence: allInjectedMessages.length, // Track insertion order
      message: {
        role: "user" as const,
        content: content.map(transformContentPart),
      },
    });
  }
}

/**
 * Build a new messages array with injected messages inserted at their recorded positions.
 * Messages are processed in reverse order of insertion index to avoid shifting issues.
 * For messages with the same index, we process in reverse sequence order to preserve FIFO.
 *
 * @param messages - The original messages array
 * @param injectedMessages - Messages to inject with their target indices
 * @returns New array with injected messages inserted at correct positions
 */
export function injectMessagesAtPositions<T>(
  messages: T[],
  injectedMessages: InjectedMessage[],
): (T | InjectedMessage["message"])[] {
  if (injectedMessages.length === 0) {
    return messages;
  }

  // Type as union from the start to allow inserting InjectedMessage["message"]
  const newMessages: (T | InjectedMessage["message"])[] = [...messages];

  // Sort by insertion index descending, then by sequence descending.
  // The sequence descending ensures that for same-index messages,
  // we splice the LAST-added first, so after all splices the FIRST-added
  // ends up in front (preserving FIFO order).
  const sortedInjections = [...injectedMessages].sort((a, b) => {
    if (a.insertAtIndex !== b.insertAtIndex) {
      return b.insertAtIndex - a.insertAtIndex;
    }
    return b.sequence - a.sequence;
  });

  for (const injection of sortedInjections) {
    newMessages.splice(injection.insertAtIndex, 0, injection.message);
  }

  return newMessages;
}

/**
 * Detect whether a tool result represents an error.
 * The AI SDK can store results in multiple formats:
 * - Array of content parts: [{ type: "text", value: "Error: ..." }]
 * - Raw string: "Error: ..."
 * - Object with isError flag: { isError: true, ... }
 */
function isToolResultError(res: unknown): boolean {
  if (typeof res === "object" && res !== null && (res as any).isError === true)
    return true;
  if (typeof res === "string" && res.startsWith("Error:")) return true;
  // AI SDK format: array of content parts (most common path)
  if (Array.isArray(res)) {
    return res.some(
      (part) =>
        part?.type === "text" &&
        typeof part.value === "string" &&
        part.value.startsWith("Error:"),
    );
  }
  return false;
}

/**
 * The complete prepareStep logic as a pure function.
 *
 * @param options - The step options containing messages and other properties
 * @param pendingUserMessages - Queue of pending messages to process
 * @param allInjectedMessages - Accumulated list of injected messages
 * @returns Modified options with injected messages, or undefined if no changes needed
 */
export function prepareStepMessages<
  TMessage extends ModelMessage,
  T extends { messages: TMessage[];[key: string]: unknown },
>(
  options: T,
  pendingUserMessages: UserMessageContentPart[][],
  allInjectedMessages: InjectedMessage[],
): (Omit<T, "messages"> & { messages: TMessage[] }) | undefined {
  const { messages, ...rest } = options;

  // Move any new pending messages to the permanent injected list
  processPendingMessages(
    pendingUserMessages,
    allInjectedMessages,
    messages.length,
  );

  let outputMessages: TMessage[] | undefined;

  // 1. Handle user message injections
  if (allInjectedMessages.length > 0) {
    // injectMessagesAtPositions returns a new array
    outputMessages = injectMessagesAtPositions(
      messages,
      allInjectedMessages,
    ) as TMessage[];
  }

  // 2. Post-Error Tool Choice Logic & Smart Fallback
  // Check if the last message in history was a failed tool result.
  const lastHistoryMsg = messages[messages.length - 1];

  let hasError = false;
  let failedToolName: string | undefined;

  if (
    lastHistoryMsg &&
    lastHistoryMsg.role === "tool" &&
    Array.isArray(lastHistoryMsg.content)
  ) {
    const content = lastHistoryMsg.content as any[];
    for (const part of content) {
      if (part.type === "tool-result") {
        const res = part.result;
        if (isToolResultError(res)) {
          hasError = true;
          failedToolName = part.toolName || part.toolCallId;
          break;
        }
      }
    }
  }

  if (hasError) {
    // If we haven't created a new array yet (no injections), copy original
    if (!outputMessages) {
      outputMessages = [...messages];
    }

    // Check for consecutive failures of the same tool to suggest fallback
    let consecutiveFailures = 1;
    if (failedToolName) {
      // Look back for previous failures of the same tool
      for (let i = messages.length - 2; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === "tool" && Array.isArray(msg.content)) {
          const content = msg.content as any[];
          const foundSameError = content.some(part =>
            part.type === "tool-result" &&
            (part.toolName === failedToolName || part.toolCallId === failedToolName) &&
            isToolResultError(part.result)
          );

          if (foundSameError) {
            consecutiveFailures++;
          } else {
            break;
          }
        } else if (msg.role === "user") {
          break; // User message resets retry context
        }
      }
    }

    let instruction = "The previous tool execution failed. You MUST correct the parameters and retry immediately. Do not explain, just call the tool again.";

    // Smart Fallback — trigger immediately on first failure for search_replace
    if (consecutiveFailures >= 1) {
      if (failedToolName?.includes("search_replace")) {
        instruction += `\n\nSYSTEM DIRECTIVE: search_replace has failed ${consecutiveFailures} consecutive times. You MUST NOT use search_replace again for this file. Use read_file to check the current file content, then use write_file to rewrite the entire file. This is mandatory — do not attempt search_replace again.`;
      } else if (failedToolName?.includes("edit_file")) {
        instruction += `\n\nSYSTEM DIRECTIVE: edit_file has failed ${consecutiveFailures} consecutive times. You MUST switch to write_file to overwrite the file completely. This is mandatory.`;
      }
    }

    // Append system instruction forcing retry
    outputMessages.push({
      role: "system",
      content: instruction,
    } as any);
  }

  // If no modifications (no injections AND no error), return undefined
  if (!outputMessages) {
    return undefined;
  }

  return { messages: outputMessages, ...rest };
}
