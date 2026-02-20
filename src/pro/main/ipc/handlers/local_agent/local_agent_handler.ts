/**
 * Local Agent v2 Handler
 * Main orchestrator for tool-based agent mode with parallel execution
 */

import { IpcMainInvokeEvent } from "electron";
import {
  streamText,
  ToolSet,
  stepCountIs,
  hasToolCall,
  ModelMessage,
} from "ai";
import log from "electron-log";

import { db } from "@/db";
import { logAiQuery } from "@/ipc/utils/ai_query_logger";
import { chats, messages } from "@/db/schema";
import { PERSISTED_ERROR_PREFIX } from "@/shared/texts";
import { eq } from "drizzle-orm";
import {
  initMessageStatus,
  updateMessageContent,
  markCompleted,
  markApprovedAndCompleted,
  markCancelled,
  markFailed,
  saveAiMessagesJson,
  saveCommitHash,
} from "./message_persistence";

import { isDyadProEnabled, isBasicAgentMode } from "@/lib/schemas";
import { readSettings } from "@/main/settings";
import { getDyadAppPath } from "@/paths/paths";
import { getModelClient } from "@/ipc/utils/get_model_client";
import { safeSend } from "@/ipc/utils/safe_sender";
import { getMaxTokens, getTemperature } from "@/ipc/utils/token_utils";
import { getProviderOptions, getAiHeaders } from "@/ipc/utils/provider_options";
import { logChatInfo } from "@/ipc/utils/chat_logger";
import { logTokenUsage } from "@/ipc/utils/token_stats_logger";
// DESHABILITADO TEMPORALMENTE - Auto-router imports
// import { analyzeAndRouteModel } from "@/ipc/utils/model_router";
// import { getLanguageModelsByProviders } from "@/ipc/shared/language_model_helpers";

import {
  AgentToolName,
  buildAgentToolSet,
  requireAgentToolConsent,
  clearPendingConsentsForChat,
} from "./tool_definitions";
import {
  deployAllFunctionsIfNeeded,
  commitAllChanges,
} from "./processors/file_operations";
import { getMcpTools } from "./mcp_tools";
import { getAiMessagesJsonIfWithinLimit } from "@/ipc/utils/ai_messages_utils";

import {
  FileEditToolName,
  FILE_EDIT_TOOL_NAMES,
  parsePartialJson,
  type AgentContext,
  type FileEditTracker,
  UserMessageContentPart,
} from "./tools/types";

import type { ChatStreamParams, ChatResponseEnd } from "@/ipc/types";
import { sendTelemetryEvent } from "@/ipc/utils/telemetry";
import {
  prepareStepMessages,
  type InjectedMessage,
} from "./prepare_step_utils";
import { TOOL_DEFINITIONS } from "./tool_definitions";
import { parseAiMessagesJson } from "@/ipc/utils/ai_messages_utils";
import { addIntegrationTool } from "./tools/add_integration";
import { autoExtractKnowledge } from "@/ipc/handlers/knowledge_handlers";

const logger = log.scope("local_agent_handler");

// ============================================================================
// Tool Streaming State Management
// ============================================================================

/**
 * Track streaming state per tool call ID
 */
interface ToolStreamingEntry {
  toolName: string;
  argsAccumulated: string;
  pathTracked?: string;
}
const toolStreamingEntries = new Map<string, ToolStreamingEntry>();

function getOrCreateStreamingEntry(
  id: string,
  toolName?: string,
): ToolStreamingEntry | undefined {
  let entry = toolStreamingEntries.get(id);
  if (!entry && toolName) {
    entry = {
      toolName,
      argsAccumulated: "",
    };
    toolStreamingEntries.set(id, entry);
  }
  return entry;
}

function cleanupStreamingEntry(id: string): void {
  toolStreamingEntries.delete(id);
}

function findToolDefinition(toolName: string) {
  return TOOL_DEFINITIONS.find((t) => t.name === toolName);
}

/**
 * Handle a chat stream in local-agent mode
 */
export async function handleLocalAgentStream(
  event: IpcMainInvokeEvent,
  req: ChatStreamParams,
  abortController: AbortController,
  {
    placeholderMessageId,
    systemPrompt,
    dyadRequestId,
    readOnly = false,
    messageOverride,
  }: {
    placeholderMessageId: number;
    systemPrompt: string;
    dyadRequestId: string;
    /**
     * If true, the agent operates in read-only mode (e.g., ask mode).
     * State-modifying tools are disabled, and no commits/deploys are made.
     */
    readOnly?: boolean;
    /**
     * If provided, use these messages instead of fetching from the database.
     * Used for summarization where messages need to be transformed.
     */
    messageOverride?: ModelMessage[];
  },
): Promise<boolean> {
  logger.log(`[AGENT] ============================================`);
  logger.log(
    `[AGENT] Starting Agente inteligente handler (chatId: ${req.chatId}, readOnly: ${readOnly})`,
  );
  logger.log(`[AGENT] Prompt: ${req.prompt.substring(0, 100)}...`);
  const settings = readSettings();

  // Check Pro status or Basic Agent mode
  // Basic Agent mode allows non-Pro users with quota (quota check is done in chat_stream_handlers)
  if (!isDyadProEnabled(settings) && !isBasicAgentMode(settings)) {
    safeSend(event.sender, "chat:response:error", {
      chatId: req.chatId,
      error:
        "Agent v2 requires Dyad Pro. Please enable Dyad Pro in Settings → Pro.",
    });
    return false;
  }

  // Get the chat and app
  const chat = await db.query.chats.findFirst({
    where: eq(chats.id, req.chatId),
    with: {
      messages: {
        orderBy: (messages, { asc }) => [asc(messages.createdAt)],
      },
      app: true,
    },
  });

  if (!chat || !chat.app) {
    throw new Error(`Chat not found: ${req.chatId}`);
  }

  const appPath = getDyadAppPath(chat.app.path);

  // The frontend handles optimistic UI updates (showing the loader).
  // We should NOT send `chat.messages` here because it doesn't contain the assistant placeholder yet,
  // and sending it would overwrite the frontend's optimistic loader, causing it to disappear.

  // Phase 2: Context & Recovery
  // Link to previous assistant response for chain tracking
  const assistantMessages = chat.messages.filter(
    (m) => m.role === "assistant" && m.id !== placeholderMessageId,
  );
  const previousResponseId =
    assistantMessages.length > 0
      ? assistantMessages[assistantMessages.length - 1].id
      : null;

  // Initialize status as incomplete (non-blocking to prevent UI lag)
  initMessageStatus(placeholderMessageId, previousResponseId);

  let fullResponse = "";
  let streamingPreview = ""; // Temporary preview for current tool, not persisted

  // Track pending user messages to inject after tool results
  const pendingUserMessages: UserMessageContentPart[][] = [];
  // Store injected messages with their insertion index to re-inject at the same spot each step
  const allInjectedMessages: InjectedMessage[] = [];

  try {
    const selectedModel = settings.selectedModel;

    // Get model client
    const { modelClient } = await getModelClient(selectedModel, settings);

    // Build tool execute context
    const fileEditTracker: FileEditTracker = Object.create(null);
    const ctx: AgentContext = {
      event,
      appId: chat.app.id,
      appPath,
      chatId: chat.id,
      supabaseProjectId: chat.app.supabaseProjectId,
      supabaseOrganizationSlug: chat.app.supabaseOrganizationSlug,
      firebaseProjectId: chat.app.firebaseProjectId,
      messageId: placeholderMessageId,
      isSharedModulesChanged: false,
      todos: [],
      dyadRequestId,
      fileEditTracker,
      isBasicAgentMode: isBasicAgentMode(settings),
      onXmlStream: (accumulatedXml: string) => {
        // Stream accumulated XML to UI without persisting
        streamingPreview = accumulatedXml;
        sendResponseChunk(
          event,
          req.chatId,
          chat,
          fullResponse + streamingPreview,
        );
      },
      onXmlComplete: (finalXml: string) => {
        // Write final XML to DB and UI
        fullResponse += finalXml + "\n";
        streamingPreview = ""; // Clear preview
        updateResponseInDb(placeholderMessageId, fullResponse);
        sendResponseChunk(event, req.chatId, chat, fullResponse);
      },
      requireConsent: async (params: {
        toolName: string;
        toolDescription?: string | null;
        inputPreview?: string | null;
      }) => {
        return requireAgentToolConsent(event, {
          chatId: chat.id,
          toolName: params.toolName as AgentToolName,
          toolDescription: params.toolDescription,
          inputPreview: params.inputPreview,
        });
      },
      appendUserMessage: (content: UserMessageContentPart[]) => {
        pendingUserMessages.push(content);
      },
      onUpdateTodos: (todos) => {
        safeSend(event.sender, "agent-tool:todos-update", {
          chatId: chat.id,
          todos,
        });
      },
    };

    // Build tool set (agent tools + MCP tools)
    // In read-only mode, only include read-only tools and skip MCP tools
    // (since we can't determine if MCP tools modify state)
    logger.log(
      `[AGENT] Building tool set (readOnly: ${readOnly}, basicAgentMode: ${isBasicAgentMode(settings)})`,
    );
    const agentTools = buildAgentToolSet(ctx, { readOnly });
    const mcpTools = readOnly ? {} : await getMcpTools(event, ctx);
    const allTools: ToolSet = { ...agentTools, ...mcpTools };
    logger.log(
      `[AGENT] Tool set built: ${Object.keys(agentTools).length} agent tools, ${Object.keys(mcpTools).length} MCP tools`,
    );
    logger.log(`[AGENT] Available tools: ${Object.keys(allTools).join(", ")}`);

    // Prepare message history with graceful fallback
    // Use messageOverride if provided (e.g., for summarization)
    const messageHistory: ModelMessage[] = messageOverride
      ? messageOverride
      : chat.messages
        .filter((msg) => msg.content || msg.aiMessagesJson)
        .flatMap((msg) => {
          const parsedMessages = parseAiMessagesJson(msg);

          // Phase 3: Resume - Annotate incomplete messages to help model recover context
          if (
            (msg as any).status === "incomplete" &&
            msg.role === "assistant"
          ) {
            const lastMsg = parsedMessages[parsedMessages.length - 1];
            if (
              lastMsg &&
              lastMsg.role === "assistant"
            ) {
              if (typeof lastMsg.content === "string") {
                lastMsg.content +=
                  "\n\n[System Note: The previous assistant response was interrupted. Please continue or complete the thought if relevant.]";
              } else if (Array.isArray(lastMsg.content)) {
                (lastMsg.content as any[]).push({
                  type: "text",
                  text: "\n\n[System Note: The previous assistant response was interrupted. Please continue or complete the thought if relevant.]"
                });
              }
            }
          }
          return parsedMessages;
        });
    logger.log(
      `[AGENT] Message history: ${messageHistory.length} messages (override: ${!!messageOverride})`,
    );

    // Stream the response
    logger.log(
      `[AGENT] Starting streamText with model: ${selectedModel.provider}/${selectedModel.name}`,
    );
    logger.log(
      `[AGENT] System prompt length: ${systemPrompt.length} characters`,
    );
    // Anti-continuation: wrap last user message to prevent the model from
    // continuing/completing the user's text instead of responding as assistant.
    const framedMessageHistory = messageHistory.map((m, i, arr) => {
      if (i === arr.length - 1 && m.role === "user" && typeof m.content === "string") {
        return { ...m, content: `<user_request>\n${m.content}\n</user_request>` };
      }
      return m;
    });

    const streamResult = streamText({
      model: modelClient.model,
      headers: getAiHeaders({
        builtinProviderId: modelClient.builtinProviderId,
      }),
      providerOptions: getProviderOptions({
        dyadAppId: chat.app.id,
        dyadRequestId,
        dyadDisableFiles: true, // Local agent uses tools, not file injection
        files: [],
        mentionedAppsCodebases: [],
        builtinProviderId: modelClient.builtinProviderId,
        settings,
      }),
      maxOutputTokens: await getMaxTokens(settings.selectedModel),
      temperature: await getTemperature(settings.selectedModel),
      maxRetries: 2,
      system: systemPrompt,
      messages: framedMessageHistory,
      tools: allTools,
      stopWhen: [stepCountIs(15), hasToolCall(addIntegrationTool.name)], // Allow multiple tool call rounds, stop on add_integration
      abortSignal: abortController.signal,
      // Inject pending user messages (e.g., images from web_crawl) between steps
      // We must re-inject all accumulated messages each step because the AI SDK
      // doesn't persist dynamically injected messages in its internal state.
      // We track the insertion index so messages appear at the same position each step.
      prepareStep: (options) =>
        prepareStepMessages(options, pendingUserMessages, allInjectedMessages),
      onFinish: async (response) => {
        const totalTokens = response.usage?.totalTokens;
        const inputTokens = response.usage?.inputTokens;
        const outputTokens = response.usage?.outputTokens ?? (response.usage as any)?.completionTokens;
        const cachedInputTokens = response.usage?.cachedInputTokens;
        logger.log(
          "Total tokens used:",
          totalTokens,
          "Input tokens:",
          inputTokens,
          "Output tokens:",
          outputTokens,
          "Cached input tokens:",
          cachedInputTokens,
          "Cache hit ratio:",
          cachedInputTokens ? (cachedInputTokens ?? 0) / (inputTokens ?? 0) : 0,
        );

        // Log AI query using fullResponse from outer scope (closure)
        let effectiveOutputTokens = outputTokens
          || (totalTokens && inputTokens ? totalTokens - inputTokens : undefined);

        // If still 0 or undefined, estimate from fullResponse length
        // Rule of thumb: ~4 characters per token
        if (!effectiveOutputTokens || effectiveOutputTokens === 0) {
          effectiveOutputTokens = Math.ceil(fullResponse.length / 4);
        }

        logger.log(
          `[AGENT onFinish] Logging AI query with fullResponse length: ${fullResponse.length}, effectiveOutputTokens: ${effectiveOutputTokens}`,
        );

        try {
          void logAiQuery({
            queryType: "local-agent-stream",
            model: selectedModel.name,
            promptSnippet: req.prompt.slice(0, 100),
            payload: {
              system: systemPrompt.slice(0, 500),
              messages: messageHistory,
              tools: Object.keys(allTools),
            },
            response: {
              fullResponse: fullResponse || "[empty at onFinish]",
              text: response.text,
              steps: response.steps?.length ?? 0,
              finishReason: response.finishReason,
            },
            inputTokens: inputTokens,
            outputTokens: effectiveOutputTokens,
          });
        } catch (e) {
          logger.error("Failed to log local agent AI query in onFinish", e);
        }

        if (typeof totalTokens === "number") {
          await markCompleted(placeholderMessageId, totalTokens);

          // Log token usage for verbose chat logs and token stats panel
          void logChatInfo(
            ctx.chatId,
            "token-usage",
            `Total tokens: ${totalTokens} (input: ${inputTokens ?? "?"}, output: ${effectiveOutputTokens ?? "?"})`,
            {
              totalTokens,
              inputTokens,
              outputTokens: effectiveOutputTokens,
              model: selectedModel.name,
              cachedInputTokens,
              type: "local-agent",
            },
            placeholderMessageId,
          );

          if (settings.enableAllStatsAndLogs && settings.enableTokenStats !== false) {
            logTokenUsage({
              chatId: ctx.chatId,
              messageId: placeholderMessageId,
              totalTokens,
              promptTokens: inputTokens,
              completionTokens: effectiveOutputTokens,
              model: selectedModel.name,
              timestamp: Date.now(),
              appId: chat.app.id,
              toolsUsed: Object.keys(allTools),
            });
          }
        }
      },
      onError: (error: any) => {
        const errorMessage = error?.error?.message || JSON.stringify(error);
        const fullErrorText = `AI error: ${errorMessage}`;
        logger.error("Local agent stream error:", errorMessage);
        safeSend(event.sender, "chat:response:error", {
          chatId: req.chatId,
          error: fullErrorText,
        });
        // Persist error text in DB so it survives reload
        void updateMessageContent(placeholderMessageId, `${PERSISTED_ERROR_PREFIX}${fullErrorText}`);
      },
    });

    // Process the stream
    let inThinkingBlock = false;

    for await (const part of streamResult.fullStream) {
      if (abortController.signal.aborted) {
        logger.log(`Stream aborted for chat ${req.chatId}`);
        // Clean up pending consent requests to prevent stale UI banners
        clearPendingConsentsForChat(req.chatId);
        break;
      }

      let chunk = "";

      // Handle thinking block transitions
      if (
        inThinkingBlock &&
        !["reasoning-delta", "reasoning-end", "reasoning-start"].includes(
          part.type,
        )
      ) {
        chunk = "</think>\n";
        inThinkingBlock = false;
      }

      switch (part.type) {
        case "text-delta":
          chunk += part.text;
          break;

        case "reasoning-start":
          if (!inThinkingBlock) {
            chunk = "<think>";
            inThinkingBlock = true;
          }
          break;

        case "reasoning-delta":
          // Skip [REDACTED] from OpenRouter encrypted reasoning tokens
          if (part.text === "[REDACTED]") break;
          if (!inThinkingBlock) {
            chunk = "<think>";
            inThinkingBlock = true;
          }
          chunk += part.text;
          break;

        case "reasoning-end":
          if (inThinkingBlock) {
            chunk = "</think>\n";
            inThinkingBlock = false;
          }
          break;

        case "tool-input-start": {
          // Initialize streaming state for this tool call
          getOrCreateStreamingEntry(part.id, part.toolName);
          break;
        }

        case "tool-input-delta": {
          // Accumulate args and stream XML preview
          const entry = getOrCreateStreamingEntry(part.id);
          if (entry) {
            entry.argsAccumulated += part.delta;
            const toolDef = findToolDefinition(entry.toolName);
            if (toolDef?.buildXml) {
              const argsPartial = parsePartialJson(entry.argsAccumulated);

              // Track file edit per path to show retry count in UI
              if (FILE_EDIT_TOOL_NAMES.includes(entry.toolName as any)) {
                const path = argsPartial.path || argsPartial.file_path;
                if (path && entry.pathTracked !== path) {
                  entry.pathTracked = path;
                  if (!ctx.fileEditTracker[path]) {
                    ctx.fileEditTracker[path] = {
                      write_file: 0,
                      edit_file: 0,
                      search_replace: 0,
                      patch_file: 0,
                    };
                  }
                  ctx.fileEditTracker[path][entry.toolName as FileEditToolName]++;
                }
              }

              const xml = toolDef.buildXml(argsPartial, false, ctx);
              if (xml) {
                ctx.onXmlStream(xml);
              }
            }
          }
          break;
        }

        case "tool-input-end": {
          // Build final XML and persist
          const entry = getOrCreateStreamingEntry(part.id);
          if (entry) {
            const toolDef = findToolDefinition(entry.toolName);
            if (toolDef?.buildXml) {
              const argsPartial = parsePartialJson(entry.argsAccumulated);
              const xml = toolDef.buildXml(argsPartial, true, ctx);
              if (xml) {
                ctx.onXmlComplete(xml);
              }
            }
          }
          cleanupStreamingEntry(part.id);
          break;
        }

        case "tool-call":
          // Tool execution happens via execute callbacks
          logger.log(
            `[AGENT] Tool call: ${part.toolName} (id: ${part.toolCallId})`,
          );
          break;

        case "tool-result":
          // Tool results are already handled by the execute callback
          logger.log(
            `[AGENT] Tool result: ${part.toolName} (id: ${part.toolCallId})`,
          );
          break;
      }

      if (chunk) {
        fullResponse += chunk;
        await updateResponseInDb(placeholderMessageId, fullResponse);
        sendResponseChunk(event, req.chatId, chat, fullResponse);
      }
    }

    // Close thinking block if still open
    if (inThinkingBlock) {
      fullResponse += "</think>\n";
      await updateResponseInDb(placeholderMessageId, fullResponse);
    }

    // Save the AI SDK messages for multi-turn tool call preservation
    try {
      const response = await streamResult.response;
      const aiMessagesJson = getAiMessagesJsonIfWithinLimit(response.messages);
      if (aiMessagesJson) {
        await saveAiMessagesJson(placeholderMessageId, aiMessagesJson);
      }
    } catch (err) {
      logger.warn("Failed to save AI messages JSON:", err);
    }

    // If the model produced zero output, send an error instead of an empty bubble
    if (!fullResponse.trim()) {
      const zeroOutputError = "El modelo no generó ninguna respuesta. Esto suele ser un error temporal del proveedor. Intenta de nuevo o cambia de modelo.";
      logger.error("[AGENT] Model produced no output — sending error to user");
      // Persist error text in DB so it survives reload
      await updateMessageContent(placeholderMessageId, `${PERSISTED_ERROR_PREFIX}${zeroOutputError}`);
      await markFailed(placeholderMessageId);
      safeSend(event.sender, "chat:response:error", {
        chatId: req.chatId,
        error: zeroOutputError,
      });
      return false;
    }

    // In read-only mode, skip deploys and commits
    if (!readOnly) {
      // Deploy all Supabase functions if shared modules changed
      await deployAllFunctionsIfNeeded(ctx);

      // Commit all changes
      const commitResult = await commitAllChanges(ctx, ctx.chatSummary);

      if (commitResult.commitHash) {
        await saveCommitHash(placeholderMessageId, commitResult.commitHash);
      }
    }

    // Mark as approved and completed (safety net if onFinish didn't catch it)
    await markApprovedAndCompleted(placeholderMessageId);

    // Send telemetry for files with multiple edit tool types
    for (const [filePath, counts] of Object.entries(fileEditTracker)) {
      const toolsUsed = Object.entries(counts).filter(([, count]) => count > 0);
      if (toolsUsed.length >= 2) {
        sendTelemetryEvent("local_agent:file_edit_retry", {
          filePath,
          ...counts,
        });
      }
    }

    // Fire-and-forget: auto-extract knowledge from this interaction
    void autoExtractKnowledge(
      chat.app.id,
      req.prompt,
      fullResponse,
    );

    // Send completion
    safeSend(event.sender, "chat:response:end", {
      chatId: req.chatId,
      updatedFiles: !readOnly,
      chatSummary: ctx.chatSummary,
    } satisfies ChatResponseEnd);

    return true; // Success
  } catch (error) {
    // Clean up any pending consent requests for this chat to prevent
    // stale UI banners and orphaned promises
    clearPendingConsentsForChat(req.chatId);

    if (abortController.signal.aborted) {
      // Handle cancellation
      if (fullResponse) {
        await markCancelled(placeholderMessageId, fullResponse);
      }
      return false; // Cancelled - don't consume quota
    }

    logger.error("Local agent error:", error);
    const catchErrorText = `Error: ${error}`;
    safeSend(event.sender, "chat:response:error", {
      chatId: req.chatId,
      error: catchErrorText,
    });

    // Persist error text in DB and mark as failed
    await updateMessageContent(placeholderMessageId, `${PERSISTED_ERROR_PREFIX}${catchErrorText}`);
    await markFailed(placeholderMessageId);

    return false; // Error - don't consume quota
  }
}

// Delegate to centralized persistence
const updateResponseInDb = updateMessageContent;

function sendResponseChunk(
  event: IpcMainInvokeEvent,
  chatId: number,
  chat: any,
  fullResponse: string,
) {
  const currentMessages = [...chat.messages];
  if (currentMessages.length > 0) {
    const lastMsg = currentMessages[currentMessages.length - 1];
    if (lastMsg.role === "assistant") {
      lastMsg.content = fullResponse;
    }
  }
  safeSend(event.sender, "chat:response:chunk", {
    chatId,
    messages: currentMessages,
  });
}
