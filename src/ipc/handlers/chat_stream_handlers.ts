import { v4 as uuidv4 } from "uuid";
import { ipcMain, IpcMainInvokeEvent } from "electron";
import { createTypedHandler } from "./base";
import { chatContracts } from "../types/chat";
import {
  ModelMessage,
  TextPart,
  ImagePart,
  streamText,
  ToolSet,
  TextStreamPart,
  stepCountIs,
  hasToolCall,
  type ToolExecutionOptions,
} from "ai";

import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { and, eq, isNull, inArray } from "drizzle-orm";
import type { SmartContextMode } from "../../lib/schemas";
import {
  constructSystemPrompt,
  readAiRules,
} from "../../prompts/system_prompt";
import { buildKnowledgePrompt, autoExtractKnowledge } from "./knowledge_handlers";
import { getEffectivePrompt } from "../../prompts";
import { getThemePromptById } from "../utils/theme_utils";
import {
  getSupabaseAvailableSystemPrompt,
  SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT,
} from "../../prompts/supabase_prompt";
import {
  getBunnyAvailableSystemPrompt,
  BUNNY_NOT_AVAILABLE_SYSTEM_PROMPT,
} from "../../prompts/bunny_prompt";
import type { BunnyConfig } from "@/ipc/types/bunny";
import { getPocketBaseAvailableSystemPrompt, POCKETBASE_NOT_AVAILABLE_SYSTEM_PROMPT } from "../../prompts/pocketbase_prompt";
import { getVibesAppPath } from "../../paths/paths";
import { readSettings } from "../../main/settings";
import type { ChatResponseEnd, ChatStreamParams } from "@/ipc/types";
import {
  CodebaseFile,
  extractCodebase,
  readFileWithCache,
} from "../../utils/codebase";
import {
  processFullResponseActions,
} from "../processors/response_processor";
import { streamTestResponse } from "./testing_chat_handlers";
import { getTestResponse } from "./testing_chat_handlers";
import { getModelClient, ModelClient } from "../utils/get_model_client";
import log from "electron-log";
import { sendTelemetryEvent } from "../utils/telemetry";
import {
  getSupabaseContext,
  getSupabaseClientCode,
} from "../../supabase_admin/supabase_context";
import {
  SUMMARIZE_CHAT_SYSTEM_PROMPT,
  SUMMARIZE_IN_SPANISH_PROMPT,
  SUMMARY_SYSTEM_PROMPT_LANGS,
} from "../../prompts/summarize_chat_system_prompt";
import { SECURITY_REVIEW_SYSTEM_PROMPT } from "../../prompts/security_review_prompt";
import fs from "node:fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { readFile, writeFile, unlink } from "fs/promises";
import { getMaxTokens, getTemperature, getContextWindow, estimateTokens } from "../utils/token_utils";
import { MAX_CHAT_TURNS_IN_CONTEXT } from "@/constants/settings_constants";
import { validateChatContext } from "../utils/context_paths_utils";
import { getProviderOptions, getAiHeaders } from "../utils/provider_options";
// Migrated to remoteSchema.mcpServers
import { requireMcpToolConsent } from "../utils/mcp_consent";

import { handleLocalAgentStream } from "../../pro/main/ipc/handlers/local_agent/local_agent_handler";
import { handleOpenCodeStream, revertLastOpenCodeMessage, destroyOpenCodeSession } from "./opencode_adapter";
// DESHABILITADO TEMPORALMENTE - Auto-router imports
// import { analyzeAndRouteModel } from "../utils/model_router";
// import { getLanguageModelsByProviders } from "../shared/language_model_helpers";

import { safeSend } from "../utils/safe_sender";
import { cleanFullResponse } from "../utils/cleanFullResponse";
import { generateProblemReport } from "../processors/tsc";
import { createProblemFixPrompt } from "@/shared/problem_prompt";
import { AsyncVirtualFileSystem } from "../../../shared/VirtualFilesystem";
import { escapeXmlAttr, escapeXmlContent } from "../../../shared/xmlEscape";
import {
  getAddDependencyTags,
  getWriteTags,
  getDeleteTags,
  getRenameTags,
} from "../utils/tag_parser";
import { fileExists } from "../utils/file_utils";
import { FileUploadsState } from "../utils/file_uploads_state";
import { extractMentionedAppsCodebases } from "../utils/mention_apps";
import { parseAppMentions } from "@/shared/parse_mention_apps";
// Migrated to remoteSchema.prompts
import { replacePromptReference } from "../utils/replacePromptReference";
import { mcpManager } from "../utils/mcp_manager";
import z from "zod";
import { logTokenUsage } from "../utils/token_stats_logger";
import { logChatInfo, logChatError } from "../utils/chat_logger";

import {
  isSupabaseConnected,
} from "@/lib/schemas";
import { AI_STREAMING_ERROR_MESSAGE_PREFIX, PERSISTED_ERROR_PREFIX } from "@/shared/texts";
import { logAiQuery } from "@/ipc/utils/ai_query_logger";
import { getCurrentCommitHash } from "../utils/git_utils";
import {
  processChatMessagesWithVersionedFiles as getVersionedFiles,
  VersionedFiles,
} from "../utils/versioned_codebase_context";
import { getAiMessagesJsonIfWithinLimit } from "../utils/ai_messages_utils";

type AsyncIterableStream<T> = AsyncIterable<T> & ReadableStream<T>;

const logger = log.scope("chat_stream_handlers");
const disableRemoteEngine =
  process.env.VIBES_DISABLE_REMOTE_ENGINE === "true" ||
  process.env.VIBES_ENABLE_REMOTE_ENGINE === "false";

// Track active streams for cancellation
const activeStreams = new Map<number, AbortController>();

// Track partial responses for cancelled streams
const partialResponses = new Map<number, string>();

// Directory for storing temporary files
const TEMP_DIR = path.join(os.tmpdir(), "vibes-attachments");

// Common helper functions
const TEXT_FILE_EXTENSIONS = [
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".js",
  ".ts",
  ".html",
  ".css",
];

async function isTextFile(filePath: string): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_FILE_EXTENSIONS.includes(ext);
}

// Use escapeXmlAttr from shared/xmlEscape for XML escaping

// Safely parse an MCP tool key that combines server and tool names.
// We split on the LAST occurrence of "__" to avoid ambiguity if either
// side contains "__" as part of its sanitized name.
function parseMcpToolKey(toolKey: string): {
  serverName: string;
  toolName: string;
} {
  const separator = "__";
  const lastIndex = toolKey.lastIndexOf(separator);
  if (lastIndex === -1) {
    return { serverName: "", toolName: toolKey };
  }
  const serverName = toolKey.slice(0, lastIndex);
  const toolName = toolKey.slice(lastIndex + separator.length);
  return { serverName, toolName };
}

// Ensure the temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Helper function to process stream chunks
async function processStreamChunks({
  fullStream,
  fullResponse,
  abortController,
  chatId,
  processResponseChunkUpdate,
}: {
  fullStream: AsyncIterableStream<TextStreamPart<ToolSet>>;
  fullResponse: string;
  abortController: AbortController;
  chatId: number;
  processResponseChunkUpdate: (params: {
    fullResponse: string;
  }) => Promise<string>;
}): Promise<{ fullResponse: string; incrementalResponse: string }> {
  let incrementalResponse = "";
  let inThinkingBlock = false;

  for await (const part of fullStream) {
    let chunk = "";
    if (
      inThinkingBlock &&
      !["reasoning-delta", "reasoning-end", "reasoning-start"].includes(
        part.type,
      )
    ) {
      chunk = "</think>";
      inThinkingBlock = false;
    }
    if (part.type === "text-delta") {
      chunk += part.text;
    } else if (part.type === "reasoning-delta") {
      // Skip [REDACTED] from OpenRouter encrypted reasoning tokens
      if (part.text === "[REDACTED]") continue;
      if (!inThinkingBlock) {
        chunk = "<think>";
        inThinkingBlock = true;
      }

      chunk += escapeVibesTags(part.text);
    } else if (part.type === "tool-call") {
      const { serverName, toolName } = parseMcpToolKey(part.toolName);
      const content = escapeVibesTags(JSON.stringify(part.input));
      chunk = `<vibes-mcp-tool-call server="${serverName}" tool="${toolName}">\n${content}\n</vibes-mcp-tool-call>\n`;
    } else if (part.type === "tool-result") {
      const { serverName, toolName } = parseMcpToolKey(part.toolName);
      const content = escapeVibesTags(part.output);
      chunk = `<vibes-mcp-tool-result server="${serverName}" tool="${toolName}">\n${content}\n</vibes-mcp-tool-result>\n`;
    }

    if (!chunk) {
      continue;
    }

    fullResponse += chunk;
    incrementalResponse += chunk;
    fullResponse = cleanFullResponse(fullResponse);
    fullResponse = stripAssistantWrapperTags(fullResponse);
    fullResponse = await processResponseChunkUpdate({
      fullResponse,
    });

    // If the stream was aborted, exit early
    if (abortController.signal.aborted) {
      logger.log(`Stream for chat ${chatId} was aborted`);
      break;
    }
  }

  return { fullResponse, incrementalResponse };
}

function registerChatStreamHandlers() {
  ipcMain.handle("chat:stream", async (event, req: ChatStreamParams) => {
    let attachmentPaths: string[] = [];
    let outerPlaceholderMessageId: number | undefined;
    const settings = readSettings();
    const currentUserId = settings.userId;
    if (!currentUserId) {
      safeSend(event.sender, "chat:stream:error", { chatId: req.chatId, error: "Unauthorized" });
      return;
    }
    const db = getRemoteDb();

    try {
      const fileUploadsState = FileUploadsState.getInstance();
      // Clear any stale state from previous requests for this chat
      fileUploadsState.clear(req.chatId);
      let vibesRequestId: string | undefined;
      // Create an AbortController for this stream
      const abortController = new AbortController();
      activeStreams.set(req.chatId, abortController);

      // Notify renderer that stream is starting
      safeSend(event.sender, "chat:stream:start", { chatId: req.chatId });

      // Get the chat to check for existing messages
      const chat = await db.query.chats.findFirst({
        where: and(eq(remoteSchema.chats.id, req.chatId), eq(remoteSchema.chats.userId, currentUserId as string)),
        with: {
          messages: {
            orderBy: (messages, { asc }) => [asc(messages.createdAt)],
          },
          app: true, // Include app information
        },
      });

      if (!chat) {
        throw new Error(`Chat not found: ${req.chatId}`);
      }

      // Handle redo option: remove the most recent messages if needed
      if (req.redo || req.undoRedo) {
        // Clear the OpenCode session — git was reverted, agent must forget old work
        revertLastOpenCodeMessage(req.chatId);
        // Get the most recent messages
        const chatMessages = [...chat.messages];

        // Find the most recent user message
        let lastUserMessageIndex = chatMessages.length - 1;
        while (
          lastUserMessageIndex >= 0 &&
          chatMessages[lastUserMessageIndex].role !== "user"
        ) {
          lastUserMessageIndex--;
        }

        if (lastUserMessageIndex >= 0) {
          // If this is an undo-redo request, we need to send the content back to the frontend
          if (req.undoRedo) {
            const lastUserMessage = chatMessages[lastUserMessageIndex];

            // Extract prompt content (remove attachment info if present)
            // The attachment info is appended at the end, starting with "\n\nAttachments:\n" or similar
            // We'll try to extract the original prompt
            let cleanPrompt = lastUserMessage.content;

            // Simple heuristic to remove appended attachment info
            // This matches the way attachmentInfo is appended below
            const attachmentMarkerIndex = cleanPrompt.indexOf("\n\nAttachments:\n");
            if (attachmentMarkerIndex !== -1) {
              cleanPrompt = cleanPrompt.substring(0, attachmentMarkerIndex);
            }

            // Also clean up selected components info
            const componentMarkerIndex = cleanPrompt.indexOf("\n\nSelected components:\n");
            if (componentMarkerIndex !== -1) {
              cleanPrompt = cleanPrompt.substring(0, componentMarkerIndex);
            }

            // Also check for "File to upload to codebase:" and remove it
            const uploadToCodebaseMarkerIndex = cleanPrompt.indexOf("\n\nFile to upload to codebase:");
            if (uploadToCodebaseMarkerIndex !== -1) {
              cleanPrompt = cleanPrompt.substring(0, uploadToCodebaseMarkerIndex);
            }

            // Recover attachments from aiMessagesJson if present
            const attachmentsToRestore: any[] = [];
            const aiMessagesJson = lastUserMessage.aiMessagesJson as any;
            if (aiMessagesJson) {
              const aiMessages = Array.isArray(aiMessagesJson) ? aiMessagesJson : aiMessagesJson.messages;
              if (aiMessages && Array.isArray(aiMessages)) {
                const userMsg = aiMessages.find((m: any) => m.role === "user");
                if (userMsg && Array.isArray(userMsg.content)) {
                  userMsg.content.forEach((part: any, i: number) => {
                    if (part.type === "image" && part.image) {
                      attachmentsToRestore.push({
                        type: part.type,
                        image: part.image,
                        mediaType: part.mediaType || part.mimeType || "image/png"
                      });
                    }
                  });
                }
              }
            }

            safeSend(event.sender, "chat:undo-redo:content", {
              chatId: req.chatId,
              prompt: cleanPrompt,
              attachments: attachmentsToRestore.length > 0 ? attachmentsToRestore : undefined
            });
          }

          // Delete the user message
          await db
            .delete(remoteSchema.messages)
            .where(and(eq(remoteSchema.messages.id, chatMessages[lastUserMessageIndex].id), eq(remoteSchema.messages.userId, currentUserId as string)));

          // If there's an assistant message after the user message, delete it too
          if (
            lastUserMessageIndex < chatMessages.length - 1 &&
            chatMessages[lastUserMessageIndex + 1].role === "assistant"
          ) {
            await db
              .delete(remoteSchema.messages)
              .where(
                and(
                  eq(remoteSchema.messages.id, chatMessages[lastUserMessageIndex + 1].id),
                  eq(remoteSchema.messages.userId, currentUserId as string)
                ),
              );
          }
        }

        // If it was just an undoRedo (without a new prompt), we stop here
        if (req.undoRedo && !req.prompt) {
          // Kill the OpenCode session so the agent forgets the reverted work
          revertLastOpenCodeMessage(req.chatId);

          // Notify that the stream/operation ended (since we just undid)
          safeSend(event.sender, "chat:response:end", {
            chatId: req.chatId,
            updatedFiles: false,
          });
          return;
        }
      }

      // Process attachments if any
      let attachmentInfo = "";
      if (req.attachments && req.attachments.length > 0) {
        attachmentInfo = "\n\nAttachments:\n";
        for (const [index, attachment] of req.attachments.entries()) {
          const hash = crypto.createHash("md5").update(attachment.name + Date.now()).digest("hex");
          const fileExtension = path.extname(attachment.name);
          const filename = `${hash}${fileExtension}`;
          const filePath = path.join(TEMP_DIR, filename);
          const base64Data = attachment.data.split(";base64,").pop() || "";
          await writeFile(filePath, Buffer.from(base64Data, "base64"));
          attachmentPaths.push(filePath);

          if (attachment.attachmentType === "upload-to-codebase") {
            const fileId = `VIBES_ATTACHMENT_${index}`;
            fileUploadsState.addFileUpload({ chatId: req.chatId, fileId }, { filePath, originalName: attachment.name });
            attachmentInfo += `\n\nFile to upload to codebase: ${attachment.name} (file id: ${fileId})\n`;
          } else {
            attachmentInfo += `- ${attachment.name} (${attachment.type})\n`;
            if (await isTextFile(filePath)) {
              attachmentInfo += `<vibes-text-attachment filename="${attachment.name}" type="${attachment.type}" path="${filePath}">\n                </vibes-text-attachment>\n\n`;
            }
          }
        }
      }

      // Add user message to database with attachment info
      let userPrompt = req.prompt + (attachmentInfo ? attachmentInfo : "");
      // Inline referenced prompt contents for mentions like @prompt:<id>
      try {
        const matches = Array.from(userPrompt.matchAll(/@prompt:(\d+)/g));
        if (matches.length > 0) {
          const ids = Array.from(new Set(matches.map((m) => Number(m[1]))));
          const referenced = await db
            .select()
            .from(remoteSchema.prompts)
            .where(and(inArray(remoteSchema.prompts.id, ids), eq(remoteSchema.prompts.userId, currentUserId as string)));
          if (referenced.length > 0) {
            const promptsMap: Record<number, string> = {};
            for (const p of referenced) {
              promptsMap[p.id] = p.content;
            }
            userPrompt = replacePromptReference(userPrompt, promptsMap);
          }
        }
      } catch (e) {
        logger.error("Failed to inline referenced prompts:", e);
      }

      const componentsToProcess = req.selectedComponents || [];

      if (componentsToProcess.length > 0) {
        userPrompt += "\n\nSelected components:\n";

        for (const component of componentsToProcess) {
          let componentSnippet = "[component snippet not available]";
          try {
            const componentFileContent = await readFile(
              path.join(getVibesAppPath(chat.app.path), component.relativePath),
              "utf8",
            );
            const lines = componentFileContent.split(/\r?\n/);
            const selectedIndex = component.lineNumber - 1;

            // Let's get one line before and three after for context.
            const startIndex = Math.max(0, selectedIndex - 1);
            const endIndex = Math.min(lines.length, selectedIndex + 4);

            const snippetLines = lines.slice(startIndex, endIndex);
            const selectedLineInSnippetIndex = selectedIndex - startIndex;

            if (snippetLines[selectedLineInSnippetIndex]) {
              snippetLines[selectedLineInSnippetIndex] =
                `${snippetLines[selectedLineInSnippetIndex]} // <-- EDIT HERE`;
            }

            componentSnippet = snippetLines.join("\n");
          } catch (err) {
            logger.error(
              `Error reading selected component file content: ${err}`,
            );
          }

          userPrompt += `\n${componentsToProcess.length > 1 ? `${componentsToProcess.indexOf(component) + 1}. ` : ""}Component: ${component.name} (file: ${component.relativePath})

Snippet:
\`\`\`
${componentSnippet}
\`\`\`
`;
        }
      }

      // Generate aiMessagesJson early if we have attachments
      let userAiMessagesJson: any = null;
      if (attachmentPaths.length > 0) {
        const prepared = await prepareMessageWithAttachments({ role: "user", content: userPrompt } as any, attachmentPaths);
        const json = getAiMessagesJsonIfWithinLimit([prepared]);
        if (json) userAiMessagesJson = JSON.stringify(json);
      }

      const [insertedUserMessage] = await db
        .insert(remoteSchema.messages)
        .values({
          userId: currentUserId,
          chatId: req.chatId,
          role: "user",
          content: userPrompt,
          aiMessagesJson: userAiMessagesJson,
          createdAt: new Date(),
        })
        .returning({ id: remoteSchema.messages.id });
      const userMessageId = insertedUserMessage.id;

      // Frontend uses an optimistic UI to instantly show the user message and assistant placeholder.
      // We wait to send the first response chunk until we've also created the assistant message
      // placeholder in the database, avoiding a UI flicker where the assistant bubble disappears.

      const settings = readSettings();
      // Always generate requestId
      vibesRequestId = uuidv4();

      let fullResponse = "";
      let maxTokensUsed: number | undefined;
      // Auto-routing: if provider is "auto-router", analyze task and select best model
      let selectedModel = settings.selectedModel;

      // Check if this is a test prompt
      const testResponse = getTestResponse(req.prompt);

      // Check if this is a summarize prompt (before creating the message)
      const isSummarizeIntent =
        req.prompt.startsWith(SUMMARY_SYSTEM_PROMPT_LANGS.en) ||
        req.prompt.startsWith(SUMMARY_SYSTEM_PROMPT_LANGS.es);

      // Declare placeholderAssistantMessage and updatedChat at a higher scope
      let placeholderAssistantMessage: any;
      let updatedChat: any;
      let streamStartedAt = Date.now();

      if (testResponse) {
        // For test prompts, we need to create the placeholder first
        // Create placeholder before streaming test response
        [placeholderAssistantMessage] = await db
          .insert(remoteSchema.messages)
          .values({
            userId: currentUserId,
            chatId: req.chatId,
            role: "assistant",
            content: "",
            requestId: vibesRequestId,
            model: settings.selectedModel.name,
            sourceCommitHash: await getCurrentCommitHash({
              path: getVibesAppPath(chat.app.path),
            }),
            createdAt: new Date(),
          })
          .returning();
        outerPlaceholderMessageId = placeholderAssistantMessage.id;

        // Fetch updated chat data
        updatedChat = await db.query.chats.findFirst({
          where: and(eq(remoteSchema.chats.id, req.chatId), eq(remoteSchema.chats.userId, currentUserId as string)),
          with: {
            messages: {
              orderBy: (messages, { asc }) => [asc(messages.createdAt)],
            },
            app: true,
          },
        });

        if (!updatedChat) {
          throw new Error(`Chat not found: ${req.chatId}`);
        }

        // Send the messages right away
        safeSend(event.sender, "chat:response:chunk", {
          chatId: req.chatId,
          messages: updatedChat.messages,
        });

        // For test prompts, use the dedicated function
        fullResponse = await streamTestResponse(
          event,
          req.chatId,
          testResponse,
          abortController,
          updatedChat,
        );
      } else {
        // Normal AI processing for non-test prompts

        // Summarize is a lightweight task — always use the cheap/fast model
        // regardless of what the user has selected for chat.
        if (isSummarizeIntent) {
          const summaryModelStr =
            settings.standardModeModel || "openai/gpt-4.1-mini";

          // standardModeModel is an OpenRouter model identifier (e.g. "openai/gpt-4.1-nano")
          // The provider is always "openrouter", the full string is the model name.
          selectedModel = {
            provider: "openrouter",
            name: summaryModelStr,
          };

          logger.info(
            `Using standard model for summarize task: ${summaryModelStr}`,
          );

          await logChatInfo(
            req.chatId,
            "model-selection",
            `Using standard model for summarize task: ${summaryModelStr}`,
            {
              provider: "openrouter",
              model: summaryModelStr,
              reason: "summarize-intent",
            },
          );

          // Set the title of this summarize chat directly — don't rely on the model
          // to generate a <vibes-chat-summary> tag (cheap models often skip it).
          try {
            // Extract the original chat ID from the prompt (e.g. "Resumir el chat chat-id=276")
            const originalChatIdMatch = req.prompt.match(/chat-id=(\d+)/);
            let summarizeTitle = "Resumen del chat";
            if (originalChatIdMatch) {
              const originalChatId = parseInt(originalChatIdMatch[1], 10);
              const originalChat = await db.query.chats.findFirst({
                where: and(eq(remoteSchema.chats.id, originalChatId), eq(remoteSchema.chats.userId, currentUserId as string)),
                columns: { title: true },
              });
              if (originalChat?.title) {
                summarizeTitle = `Resumen: ${originalChat.title}`.slice(0, 50);
              }
            }
            await db
              .update(remoteSchema.chats)
              .set({ title: summarizeTitle })
              .where(and(eq(remoteSchema.chats.id, req.chatId), eq(remoteSchema.chats.userId, currentUserId as string)));
          } catch (e) {
            logger.warn("Failed to set summarize chat title:", e);
          }
        }
        // DESHABILITADO TEMPORALMENTE - Auto-router funciona mal
        // Use auto-router only if it's not a summarize chat
        // else if (
        //   !isSummarizeIntent &&
        //   settings.selectedModel.provider === "auto-router" &&
        //   settings.selectedModel.name === "auto"
        // ) {
        //   try {
        //     logger.info("Auto-routing enabled, analyzing task complexity...");

        //     await logChatInfo(
        //       req.chatId,
        //       "model-selection",
        //       "Auto-routing enabled, analyzing task complexity",
        //       { provider: "auto-router" },
        //     );

        //     // Notify frontend that model selection is starting
        //     safeSend(event.sender, "chat:model:selecting", {
        //       chatId: req.chatId,
        //     });

        //     // Get all available models from enabled providers
        //     const modelsByProviders = await getLanguageModelsByProviders();
        //     const availableModels: Array<{
        //       model: typeof settings.selectedModel;
        //       dollarSigns?: number;
        //       brainSigns?: number;
        //       displayName: string;
        //     }> = [];

        //     for (const [providerId, models] of Object.entries(
        //       modelsByProviders,
        //     )) {
        //       // Skip auto-router provider itself
        //       if (providerId === "auto-router") continue;

        //       for (const model of models) {
        //         availableModels.push({
        //           model: {
        //             provider: providerId,
        //             name: model.apiName,
        //             customModelId: model.id,
        //           },
        //           dollarSigns: model.dollarSigns,
        //           brainSigns: model.brainSigns,
        //           displayName: model.displayName,
        //         });
        //       }
        //     }

        //     if (availableModels.length === 0) {
        //       logger.error(
        //         "No models available for auto-routing. Please configure at least one AI provider.",
        //       );
        //       throw new Error(
        //         "Auto-Router requires at least one AI provider to be configured. Please configure OpenRouter, OpenAI, Anthropic, or another provider in Settings.",
        //       );
        //     }

        //     const attachmentCount = req.attachments?.length ?? 0;
        //     const analysis = await analyzeAndRouteModel(
        //       req.prompt,
        //       availableModels,
        //       settings,
        //       attachmentCount,
        //     );

        //     selectedModel = analysis.recommendedModel;

        //     logger.info(
        //       `Auto-routed to ${selectedModel.provider}/${selectedModel.name} (complexity: ${analysis.complexity}, type: ${analysis.taskType}, reasoning: ${analysis.reasoning})`,
        //     );

        //     await logChatInfo(
        //       req.chatId,
        //       "model-selection",
        //       `Selected model: ${selectedModel.provider}/${selectedModel.name}`,
        //       {
        //         complexity: analysis.complexity,
        //         taskType: analysis.taskType,
        //         reasoning: analysis.reasoning,
        //         provider: selectedModel.provider,
        //         model: selectedModel.name,
        //       },
        //     );

        //     // Send model selection info to frontend
        //     safeSend(event.sender, "chat:model:selected", {
        //       chatId: req.chatId,
        //       model: selectedModel,
        //       complexity: analysis.complexity,
        //       taskType: analysis.taskType,
        //       reasoning: analysis.reasoning,
        //     });
        //   } catch (error) {
        //     logger.error("Error during auto-routing:", error);
        //     throw error; // Re-throw to show error to user
        //   }
        // }

        // Create placeholder assistant message after model selection is complete
        [placeholderAssistantMessage] = await db
          .insert(remoteSchema.messages)
          .values({
            userId: currentUserId,
            chatId: req.chatId,
            role: "assistant",
            content: "",
            requestId: vibesRequestId,
            model: selectedModel.name,
            sourceCommitHash: await getCurrentCommitHash({
              path: getVibesAppPath(chat.app.path),
            }),
            createdAt: new Date(),
          })
          .returning();
        outerPlaceholderMessageId = placeholderAssistantMessage.id;

        // Reset stream start time for the actual streaming phase
        streamStartedAt = Date.now();

        // Fetch updated chat data
        updatedChat = await db.query.chats.findFirst({
          where: and(eq(remoteSchema.chats.id, req.chatId), eq(remoteSchema.chats.userId, currentUserId as string)),
          with: {
            messages: {
              orderBy: (messages, { asc }) => [asc(messages.createdAt)],
            },
            app: true,
          },
        });

        if (!updatedChat) {
          throw new Error(`Chat not found: ${req.chatId}`);
        }

        // Send the messages right away so that the loading state is shown
        safeSend(event.sender, "chat:response:chunk", {
          chatId: req.chatId,
          messages: updatedChat.messages,
        });

        // Log selected model before starting stream
        await logChatInfo(
          req.chatId,
          "model-selection",
          `Selected model: ${selectedModel.provider}/${selectedModel.name}`,
          {
            provider: selectedModel.provider,
            model: selectedModel.name,
            customModelId: selectedModel.customModelId,
          },
        );

        const { modelClient, isEngineEnabled, isSmartContextEnabled } =
          await getModelClient(selectedModel, settings);

        const appPath = getVibesAppPath(updatedChat.app.path);
        // When we don't have smart context enabled, we
        // only include the selected components' files for codebase context.
        //
        // If we have selected components and smart context is enabled,
        // we handle this specially below.
        const chatContext =
          req.selectedComponents &&
            req.selectedComponents.length > 0 &&
            !isSmartContextEnabled
            ? {
              contextPaths: req.selectedComponents.map((component) => ({
                globPath: component.relativePath,
              })),
              smartContextAutoIncludes: [],
            }
            : validateChatContext(updatedChat.app.chatContext);

        // Skip codebase extraction for summarize intent to save tokens
        let codebaseInfo = "";
        let files: CodebaseFile[] = [];


        if (!isSummarizeIntent) {
          logger.log(
            `[BUILD MODE] Extracting codebase from ${appPath} with chatContext:`,
            chatContext,
          );
          const extracted = await extractCodebase({
            appPath,
            chatContext,
          });
          codebaseInfo = extracted.formattedOutput;
          files = extracted.files;
          logger.log(
            `[BUILD MODE] Extracted ${files.length} files from codebase`,
          );
        } else {
          logger.log(
            `[BUILD MODE] Skipping codebase extraction for summarize intent`,
          );
        }

        // For smart context and selected components, we will mark the selected components' files as focused.
        // This means that we don't do the regular smart context handling, but we'll allow fetching
        // additional files through <vibes-read> as needed.
        if (
          isSmartContextEnabled &&
          req.selectedComponents &&
          req.selectedComponents.length > 0
        ) {
          const selectedPaths = new Set(
            req.selectedComponents.map((component) => component.relativePath),
          );
          for (const file of files) {
            if (selectedPaths.has(file.path)) {
              file.focused = true;
            }
          }
        }

        // Parse app mentions from the prompt
        const mentionedAppNames = parseAppMentions(req.prompt);

        // Extract codebases for mentioned apps
        const mentionedAppsCodebases = await extractMentionedAppsCodebases(
          mentionedAppNames,
          updatedChat.app.id, // Exclude current app
        );
        const willUseLocalAgentStream =
          (settings.selectedChatMode === "local-agent" ||
            settings.selectedChatMode === "ask") &&
          !mentionedAppsCodebases.length;

        const isDeepContextEnabled =
          isEngineEnabled &&
          settings.enableProSmartFilesContextMode &&
          // Anything besides balanced will use deep context.
          settings.proSmartContextOption !== "balanced" &&
          mentionedAppsCodebases.length === 0;
        logger.log(`isDeepContextEnabled: ${isDeepContextEnabled}`);

        // Combine current app codebase with mentioned apps' codebases
        let otherAppsCodebaseInfo = "";
        if (mentionedAppsCodebases.length > 0) {
          const mentionedAppsSection = mentionedAppsCodebases
            .map(
              ({ appName, codebaseInfo }) =>
                `\n\n=== Referenced App: ${appName} ===\n${codebaseInfo}`,
            )
            .join("");

          otherAppsCodebaseInfo = mentionedAppsSection;

          logger.log(
            `Added ${mentionedAppsCodebases.length} mentioned app codebases`,
          );
        }

        logger.log(`Extracted codebase information from ${appPath}`);
        logger.log(
          "codebaseInfo: length",
          codebaseInfo.length,
          "estimated tokens",
          codebaseInfo.length / 4,
        );

        await logChatInfo(
          req.chatId,
          "context-building",
          "Extracted codebase information",
          {
            appPath,
            codebaseLength: codebaseInfo.length,
            estimatedTokens: Math.round(codebaseInfo.length / 4),
            mentionedApps: mentionedAppsCodebases.length,
            isDeepContextEnabled,
          },
          placeholderAssistantMessage.id,
        );

        // Prepare message history for the AI
        const messageHistory = updatedChat.messages.map((message: any) => ({
          role: message.role as "user" | "assistant" | "system",
          content: message.content,
          sourceCommitHash: message.sourceCommitHash,
          commitHash: message.commitHash,
        }));

        // For Vibes Pro + Deep Context, we set to 50 chat turns (+1)
        // REDUCED from 201 to save tokens while maintaining good context
        //
        // Limit chat history based on maxChatTurnsInContext setting
        // We add 1 because the current prompt counts as a turn.
        const maxChatTurns = isDeepContextEnabled
          ? 51
          : (settings.maxChatTurnsInContext || MAX_CHAT_TURNS_IN_CONTEXT) + 1;

        // If we need to limit the context, we take only the most recent turns
        let limitedMessageHistory = messageHistory;
        if (messageHistory.length > maxChatTurns * 2) {
          // Each turn is a user + assistant pair
          // Calculate how many messages to keep (maxChatTurns * 2)
          let recentMessages = messageHistory
            .filter((msg: any) => msg.role !== "system")
            .slice(-maxChatTurns * 2);

          // Ensure the first message is a user message
          if (recentMessages.length > 0 && recentMessages[0].role !== "user") {
            // Find the first user message
            const firstUserIndex = recentMessages.findIndex(
              (msg: any) => msg.role === "user",
            );
            if (firstUserIndex > 0) {
              // Drop assistant messages before the first user message
              recentMessages = recentMessages.slice(firstUserIndex);
            } else if (firstUserIndex === -1) {
              logger.warn(
                "No user messages found in recent history, set recent messages to empty",
              );
              recentMessages = [];
            }
          }

          limitedMessageHistory = [...recentMessages];

          logger.log(
            `Limiting chat history from ${messageHistory.length} to ${limitedMessageHistory.length} messages (max ${maxChatTurns} turns)`,
          );
        }

        const aiRules = await readAiRules(getVibesAppPath(updatedChat.app.path));

        // Get theme prompt for the app (null themeId means "no theme")
        const themePrompt = await getThemePromptById(updatedChat.app.themeId);
        logger.log(
          `Theme for app ${updatedChat.app.id}: ${updatedChat.app.themeId ?? "none"}, prompt length: ${themePrompt.length} chars`,
        );

        let systemPrompt = constructSystemPrompt({
          aiRules,
          chatMode: settings.selectedChatMode,
          themePrompt,
          basicAgentMode: false,
          chatLanguage: settings.chatLanguage || "es",
          settings,
        });

        // Inject knowledge base prompt (auto-learned project rules)
        const knowledgePrompt = await buildKnowledgePrompt(updatedChat.app.id, currentUserId as string, req.prompt);
        if (knowledgePrompt) {
          systemPrompt += "\n\n" + knowledgePrompt;
          logger.log(
            `Knowledge base injected for app ${updatedChat.app.id}: ${knowledgePrompt.length} chars`,
          );
        }

        // Add information about mentioned apps if any
        if (otherAppsCodebaseInfo) {
          const mentionedAppsList = mentionedAppsCodebases
            .map(({ appName }) => appName)
            .join(", ");

          systemPrompt += `\n\n# Referenced Apps\nThe user has mentioned the following apps in their prompt: ${mentionedAppsList}. Their codebases have been included in the context for your reference. When referring to these apps, you can understand their structure and code to provide better assistance, however you should NOT edit the files in these referenced apps. The referenced apps are NOT part of the current app and are READ-ONLY.`;
        }

        const isSecurityReviewIntent =
          req.prompt.startsWith("/security-review");
        if (isSecurityReviewIntent) {
          systemPrompt = SECURITY_REVIEW_SYSTEM_PROMPT;
          try {
            const appPath = getVibesAppPath(updatedChat.app.path);
            const rulesPath = path.join(appPath, "SECURITY_RULES.md");
            let securityRules = "";

            await fs.promises.access(rulesPath);
            securityRules = await fs.promises.readFile(rulesPath, "utf8");

            if (securityRules && securityRules.trim().length > 0) {
              systemPrompt +=
                "\n\n# Project-specific security rules:\n" + securityRules;
            }
          } catch (error) {
            // Best-effort: if reading rules fails, continue without them
            logger.info("Failed to read security rules", error);
          }
        }

        if (
          updatedChat.app?.supabaseProjectId &&
          isSupabaseConnected(settings)
        ) {
          const supabaseClientCode = await getSupabaseClientCode({
            projectId: updatedChat.app.supabaseProjectId,
            organizationSlug: updatedChat.app.supabaseOrganizationSlug ?? null,
          });
          systemPrompt +=
            "\n\n" +
            getSupabaseAvailableSystemPrompt(supabaseClientCode) +
            "\n\n" +
            // For local agent, we will explicitly fetch the database context when needed.
            (settings.selectedChatMode === "local-agent"
              ? ""
              : await getSupabaseContext({
                supabaseProjectId: updatedChat.app.supabaseProjectId,
                organizationSlug:
                  updatedChat.app.supabaseOrganizationSlug ?? null,
              }));
        } else if (
          // Neon projects don't need Supabase.
          !updatedChat.app?.neonProjectId &&
          // In local agent mode, we will suggest supabase as part of the add-integration tool
          settings.selectedChatMode !== "local-agent" &&
          // If in security review mode, we don't need to mention supabase is available.
          !isSecurityReviewIntent
        ) {
          systemPrompt += "\n\n" + SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT;
        }

        // Bunny.net prompt injection
        const bunnyConfig = updatedChat.app?.bunnyConfig as BunnyConfig | null;
        if (bunnyConfig && (bunnyConfig.databases?.length > 0 || bunnyConfig.storageZones?.length > 0)) {
          systemPrompt += "\n\n" + getBunnyAvailableSystemPrompt(bunnyConfig);
        } else if (
          !isSecurityReviewIntent &&
          settings.selectedChatMode !== "local-agent"
        ) {
          systemPrompt += "\n\n" + BUNNY_NOT_AVAILABLE_SYSTEM_PROMPT;
        }

        // PocketBase prompt injection
        const pocketbaseConfig = updatedChat.app?.pocketbaseConfig as any;
        if (pocketbaseConfig && pocketbaseConfig.url && pocketbaseConfig.adminEmail) {
          systemPrompt += "\n\n" + getPocketBaseAvailableSystemPrompt(pocketbaseConfig);
        } else if (
          !isSecurityReviewIntent &&
          settings.selectedChatMode !== "local-agent"
        ) {
          systemPrompt += "\n\n" + POCKETBASE_NOT_AVAILABLE_SYSTEM_PROMPT;
        }
        // Use the isSummarizeIntent variable declared earlier
        if (isSummarizeIntent) {
          systemPrompt = getEffectivePrompt("summarize_chat_system", settings);
          if (settings.chatLanguage === "es") {
            systemPrompt += SUMMARIZE_IN_SPANISH_PROMPT;
          }
        }

        // Update the system prompt for images if there are image attachments
        const hasImageAttachments =
          req.attachments &&
          req.attachments.some((attachment: any) =>
            attachment.type.startsWith("image/"),
          );

        const hasUploadedAttachments =
          req.attachments &&
          req.attachments.some(
            (attachment: any) => attachment.attachmentType === "upload-to-codebase",
          );
        // If there's mixed attachments (e.g. some upload to codebase attachments and some upload images as chat context attachemnts)
        // we will just include the file upload system prompt, otherwise the AI gets confused and doesn't reliably
        // print out the vibes-write tags.
        // Usually, AI models will want to use the image as reference to generate code (e.g. UI mockups) anyways, so
        // it's not that critical to include the image analysis instructions.
        if (hasUploadedAttachments) {
          if (willUseLocalAgentStream) {
            systemPrompt += `

When files are attached to this conversation, upload them to the codebase using the \`write_file\` tool.
Use the attachment ID (e.g., VIBES_ATTACHMENT_0) as the content, and it will be automatically resolved to the actual file content.

Example for file with id of VIBES_ATTACHMENT_0:
\`\`\`
write_file(path="src/components/Button.jsx", content="VIBES_ATTACHMENT_0", description="Upload file to codebase")
\`\`\`

`;
          } else {
            systemPrompt += `
  
When files are attached to this conversation, upload them to the codebase using this exact format:

<vibes-write path="path/to/destination/filename.ext" description="Upload file to codebase">
VIBES_ATTACHMENT_X
</vibes-write>

Example for file with id of VIBES_ATTACHMENT_0:
<vibes-write path="src/components/Button.jsx" description="Upload file to codebase">
VIBES_ATTACHMENT_0
</vibes-write>

  `;
          }
        } else if (hasImageAttachments) {
          systemPrompt += `

# Image Analysis Instructions
This conversation includes one or more image attachments. When the user uploads images:
1. If the user explicitly asks for analysis, description, or information about the image, please analyze the image content.
2. Describe what you see in the image if asked.
3. You can use images as references when the user has coding or design-related questions.
4. For diagrams or wireframes, try to understand the content and structure shown.
5. For screenshots of code or errors, try to identify the issue or explain the code.
`;
        }

        const codebasePrefix = isEngineEnabled
          ? // No codebase prefix if engine is set, we will take of it there.
          []
          : ([
            {
              role: "user",
              content: createCodebasePrompt(codebaseInfo),
            },
            {
              role: "assistant",
              content: "OK, got it. I'm ready to help",
            },
          ] as const);

        // If engine is enabled, we will send the other apps codebase info to the engine
        // and process it with smart context.
        const otherCodebasePrefix =
          otherAppsCodebaseInfo && !isEngineEnabled
            ? ([
              {
                role: "user",
                content: createOtherAppsCodebasePrompt(otherAppsCodebaseInfo),
              },
              {
                role: "assistant",
                content: "OK.",
              },
            ] as const)
            : [];

        const limitedHistoryChatMessages = limitedMessageHistory.map((msg: any) => ({
          role: msg.role as "user" | "assistant" | "system",
          // Why remove thinking tags?
          // Thinking tags are generally not critical for the context
          // and eats up extra tokens.
          content:
            settings.selectedChatMode === "ask" ||
              settings.selectedChatMode === "plan"
              ? removeVibesTags(removeNonEssentialTags(msg.content))
              : removeNonEssentialTags(msg.content),
          providerOptions: {
            "vibes-engine": {
              sourceCommitHash: msg.sourceCommitHash,
              commitHash: msg.commitHash,
            },
          },
        }));

        let chatMessages: ModelMessage[] = [
          ...codebasePrefix,
          ...otherCodebasePrefix,
          ...limitedHistoryChatMessages,
        ];

        // Check if the last message should include attachments
        if (chatMessages.length >= 2) {
          const lastUserIndex = chatMessages.length - 2;
          const lastUserMessage = chatMessages[lastUserIndex];
          if (lastUserMessage.role === "user" && attachmentPaths.length > 0) {
            chatMessages[lastUserIndex] = await prepareMessageWithAttachments(
              lastUserMessage,
              attachmentPaths,
            );
          }
        } else {
          logger.warn(
            "Unexpected number of chat messages:",
            chatMessages.length,
          );
        }

        if (isSummarizeIntent) {
          const previousChat = await db.query.chats.findFirst({
            where: eq(remoteSchema.chats.id, parseInt(req.prompt.split("=")[1])),
            with: {
              messages: {
                orderBy: (messages, { asc }) => [asc(messages.createdAt)],
              },
            },
          });
          chatMessages = [
            {
              role: "user",
              content:
                "Summarize the following chat: " +
                formatMessagesForSummary(previousChat?.messages ?? []),
            } satisfies ModelMessage,
          ];
        }
        const simpleStreamText = async ({
          chatMessages,
          modelClient,
          tools,
          systemPromptOverride = systemPrompt,
          vibesDisableFiles = false,
          files,
          toolChoice,
          serviceTier,
        }: {
          chatMessages: ModelMessage[];
          modelClient: ModelClient;
          files: CodebaseFile[];
          tools?: ToolSet;
          systemPromptOverride?: string;
          vibesDisableFiles?: boolean;
          toolChoice?: Parameters<typeof streamText>[0]["toolChoice"];
          serviceTier?: "default" | "batch";
        }) => {
          if (isEngineEnabled) {
            logger.log(
              "sending AI request to engine with request id:",
              vibesRequestId,
            );
            await logChatInfo(
              req.chatId,
              "streaming",
              "Starting AI request to engine",
              {
                requestId: vibesRequestId,
                model: selectedModel.name,
                provider: selectedModel.provider,
              },
              placeholderAssistantMessage.id,
            );
          } else {
            logger.log("sending AI request");
            await logChatInfo(
              req.chatId,
              "streaming",
              "Starting AI request",
              {
                model: selectedModel.name,
                provider: selectedModel.provider,
              },
              placeholderAssistantMessage.id,
            );
          }
          let versionedFiles: VersionedFiles | undefined;
          if (isDeepContextEnabled) {
            versionedFiles = await getVersionedFiles({
              files,
              chatMessages,
              appPath,
            });
          }
          const smartContextMode: SmartContextMode = isDeepContextEnabled
            ? "deep"
            : "balanced";
          const providerOptions = getProviderOptions({
            vibesAppId: updatedChat.app.id,
            vibesRequestId,
            vibesDisableFiles,
            smartContextMode,
            files,
            versionedFiles,
            mentionedAppsCodebases,
            builtinProviderId: modelClient.builtinProviderId,
            settings,
            serviceTier,
          });

          logger.log(
            "Starting direct AI request (no engine):",
            modelClient.model,
          );
          await logChatInfo(
            req.chatId,
            "streaming",
            "Starting AI request",
            {
              model: modelClient.model,
              provider: selectedModel.provider,
              hasTools: !!tools,
              messageCount: chatMessages.length,
            },
            placeholderAssistantMessage?.id,
          );

          // Dynamic maxOutputTokens capping based on estimated input
          const requestedMaxOutput = await getMaxTokens(settings.selectedModel);
          const contextWindow = await getContextWindow();

          // Estimate current prompt tokens (1.5x safety buffer for system/overhead)
          let estimatedInputTokens = Math.round(estimateTokens(systemPromptOverride) * 1.5);
          for (const msg of chatMessages.filter(m => m.content)) {
            if (typeof msg.content === 'string') {
              estimatedInputTokens += estimateTokens(msg.content);
            } else if (Array.isArray(msg.content)) {
              for (const part of msg.content) {
                if (part.type === 'text') estimatedInputTokens += estimateTokens(part.text);
              }
            }
          }

          // Add overhead for tool definitions (approx 500 tokens per tool)
          const toolOverhead = tools ? Object.keys(tools).length * 500 : 0;
          estimatedInputTokens += toolOverhead;

          let finalMaxOutputTokens = requestedMaxOutput;
          // If requested max tokens + input exceeds context, we cap it
          // We always want at least 4k for output if possible.
          if (finalMaxOutputTokens && (estimatedInputTokens + finalMaxOutputTokens > contextWindow)) {
            finalMaxOutputTokens = Math.max(4096, contextWindow - estimatedInputTokens - 2000);
            logger.log(`Capping maxOutputTokens from ${requestedMaxOutput} to ${finalMaxOutputTokens} to fit in context window of ${contextWindow} (estimated input: ${estimatedInputTokens})`);
          }

          // Anti-continuation: wrap last user message to prevent the model from
          // continuing/completing the user's text instead of responding as assistant.
          const framedMessages = chatMessages.filter((m: any) => m.content).map((m, i, arr) => {
            if (i === arr.length - 1 && m.role === "user" && typeof m.content === "string") {
              return { ...m, content: `<user_request>\n${m.content}\n</user_request>` };
            }
            return m;
          });

          const streamResult = streamText({
            headers: getAiHeaders({
              builtinProviderId: modelClient.builtinProviderId,
            }),
            maxOutputTokens: finalMaxOutputTokens,
            temperature: await getTemperature(settings.selectedModel),
            maxRetries: 2,
            model: modelClient.model,
            stopWhen: [stepCountIs(20), hasToolCall("edit-code")],
            providerOptions,
            system: systemPromptOverride,
            toolChoice,
            tools,
            messages: framedMessages,
            onFinish: async (response: any) => {
              // Use totalUsage (accumulated across ALL steps) rather than usage (last step only)
              const accumulated = response.totalUsage;
              const lastStep = response.usage;
              const totalTokens = accumulated?.totalTokens ?? lastStep?.totalTokens;
              // AI SDK v4 uses inputTokens/outputTokens instead of promptTokens/completionTokens
              const promptTokens =
                accumulated?.inputTokens ?? lastStep?.promptTokens ?? lastStep?.inputTokens;
              const completionTokens =
                accumulated?.outputTokens ??
                lastStep?.completionTokens ??
                lastStep?.outputTokens ??
                (totalTokens && promptTokens ? totalTokens - promptTokens : undefined);

              // Log the query to the dedicated AI query log
              try {
                void logAiQuery({
                  queryType: "chat-stream",
                  model: selectedModel.name || modelClient.builtinProviderId || "unknown",
                  promptSnippet: (() => {
                    const content = chatMessages[chatMessages.length - 1]?.content;
                    if (typeof content === "string") return content.slice(0, 100);
                    if (Array.isArray(content)) {
                      const firstPart = content[0];
                      if (firstPart && firstPart.type === "text") {
                        return firstPart.text.slice(0, 100);
                      }
                    }
                    return "";
                  })(),
                  payload: {
                    system: systemPromptOverride,
                    messages: chatMessages,
                    tools: tools ? Object.keys(tools) : [],
                  },
                  response: {
                    text: response.text,
                    toolCalls: response.toolCalls,
                    finishReason: response.finishReason,
                  },
                  inputTokens: promptTokens,
                  outputTokens: completionTokens,
                }, currentUserId as string);
              } catch (e) {
                logger.error("Failed to log streaming AI query", e);
              }

              if (typeof totalTokens === "number") {
                // We use the highest total tokens used (we are *not* accumulating)
                // since we're trying to figure it out if we're near the context limit.
                maxTokensUsed = Math.max(maxTokensUsed ?? 0, totalTokens);

                // Persist the aggregated token usage on the placeholder assistant message
                void db
                  .update(remoteSchema.messages)
                  .set({ maxTokensUsed: maxTokensUsed })
                  .where(eq(remoteSchema.messages.id, placeholderAssistantMessage.id))
                  .catch((error) => {
                    logger.error(
                      "Failed to save total tokens for assistant message",
                      error,
                    );
                  });

                logger.log(
                  `Total tokens used (aggregated for message ${placeholderAssistantMessage.id}): ${maxTokensUsed}`,
                );

                // Log token usage for verbose chat logs
                void logChatInfo(
                  req.chatId,
                  "token-usage",
                  `Total tokens: ${totalTokens} (input: ${promptTokens ?? "?"}, output: ${completionTokens ?? "?"})`,
                  {
                    totalTokens,
                    inputTokens: promptTokens,
                    outputTokens: completionTokens,
                    model:
                      selectedModel?.name ??
                      placeholderAssistantMessage.model ??
                      null,
                    filesCount: files?.length ?? 0,
                    toolsCount: tools ? Object.keys(tools).length : 0,
                  },
                  placeholderAssistantMessage.id,
                );

                // Persist simple token stats for charts/logs
                logTokenUsage({
                  chatId: req.chatId,
                  messageId: placeholderAssistantMessage.id,
                  totalTokens,
                  promptTokens,
                  completionTokens,
                  model:
                    selectedModel?.name ??
                    placeholderAssistantMessage.model ??
                    null,
                  timestamp: Date.now(),
                  appId: updatedChat?.app?.id ?? null,
                  filesSent: files?.map((f) => f.path) ?? [],
                  toolsUsed: tools ? Object.keys(tools) : [],
                });
              } else {
                logger.log("Total tokens used: unknown");
              }
            },
            onError: (error: any) => {
              let errorMessage = (error as any)?.error?.message;
              const responseBody = error?.error?.responseBody;
              if (errorMessage && responseBody) {
                errorMessage += "\n\nDetails: " + responseBody;
              }
              const message = errorMessage || JSON.stringify(error);
              const requestIdPrefix = isEngineEnabled
                ? `[Request ID: ${vibesRequestId}] `
                : "";
              logger.error(
                `AI stream text error for request: ${requestIdPrefix} errorMessage=${errorMessage} error=`,
                error,
              );

              void logChatError(
                req.chatId,
                "error-handling",
                `Streaming error: ${message}`,
                {
                  errorMessage,
                  requestId: vibesRequestId,
                  model: selectedModel.name,
                  provider: selectedModel.provider,
                },
                placeholderAssistantMessage.id,
              );

              const fullErrorText = `${AI_STREAMING_ERROR_MESSAGE_PREFIX}${requestIdPrefix}${message}`;
              event.sender.send("chat:response:error", {
                chatId: req.chatId,
                error: fullErrorText,
              });
              // Persist error text in DB so it survives reload
              void db
                .update(remoteSchema.messages)
                .set({ content: `${PERSISTED_ERROR_PREFIX}${fullErrorText}`, status: "failed" as any })
                .where(eq(remoteSchema.messages.id, placeholderAssistantMessage.id))
                .catch((err) => logger.error("Failed to persist error in message content", err));
              // Clean up the abort controller
              activeStreams.delete(req.chatId);
            },
            abortSignal: abortController.signal,
          });
          return {
            fullStream: streamResult.fullStream,
            usage: streamResult.usage,
          };
        };

        let lastDbSaveAt = 0;

        const processResponseChunkUpdate = async ({
          fullResponse,
        }: {
          fullResponse: string;
        }) => {
          // Store the current partial response
          partialResponses.set(req.chatId, fullResponse);
          // Save to DB (in case user is switching chats during the stream)
          const now = Date.now();
          if (now - lastDbSaveAt >= 150) {
            await db
              .update(remoteSchema.messages)
              .set({ content: fullResponse })
              .where(eq(remoteSchema.messages.id, placeholderAssistantMessage.id));

            lastDbSaveAt = now;
          }

          // Update the placeholder assistant message content in the messages array
          const currentMessages = [...updatedChat.messages];
          if (
            currentMessages.length > 0 &&
            currentMessages[currentMessages.length - 1].role === "assistant"
          ) {
            currentMessages[currentMessages.length - 1].content = fullResponse;
          }

          // Update the assistant message in the database
          safeSend(event.sender, "chat:response:chunk", {
            chatId: req.chatId,
            messages: currentMessages,
          });
          return fullResponse;
        };

        // Handle pro ask mode: use local-agent in read-only mode
        // This gives pro users access to code reading tools while in ask mode
        // Skip for summarize intent — summaries don't need tools, just simpleStreamText.
        if (
          !isSummarizeIntent &&
          settings.selectedChatMode === "ask" &&
          !mentionedAppsCodebases.length
        ) {
          // Reconstruct system prompt for local-agent read-only mode
          const readOnlySystemPrompt = constructSystemPrompt({
            aiRules,
            chatMode: "local-agent",
            themePrompt,
            readOnly: true,
            chatLanguage: settings.chatLanguage || "es",
            settings,
          });

          await handleLocalAgentStream(event, req, abortController, {
            placeholderMessageId: placeholderAssistantMessage.id,
            // Note: this is using the read-only system prompt rather than the
            // regular system prompt which gets overrides for special intents
            // like summarize chat, security review, etc.
            //
            // This is OK because those intents should always happen in a new chat
            // and new chats will default to non-ask modes.
            systemPrompt: readOnlySystemPrompt,
            vibesRequestId: vibesRequestId ?? "[no-request-id]",
            readOnly: true,
            messageOverride: isSummarizeIntent ? chatMessages : undefined,
          });
          return;
        }

        // Handle local-agent mode (Agente) — delegates to OpenCode AI SDK
        // Also handles deprecated "crush-agent" mode for backwards compatibility
        // Skip OpenCode for summarize intent: OpenCode doesn't understand chat-id
        // references, so we let it fall through to simpleStreamText which uses
        // the user's configured model directly (no agent needed for summaries).
        if (
          !isSummarizeIntent &&
          (settings.selectedChatMode === "local-agent" ||
            (settings.selectedChatMode as string) === "crush-agent")
        ) {
          logger.log(`[OPENCODE MODE] Starting OpenCode agent for chat ${req.chatId}`);

          // Build context instructions for the OpenCode session
          // These get injected as noReply on first interaction
          const contextInstructions: string[] = [];

          // 1. Knowledge Base rules (filtered by relevance to user prompt)
          try {
            const knowledgePrompt = await buildKnowledgePrompt(
              updatedChat.app.id,
              currentUserId as string,
              req.prompt,
            );
            if (knowledgePrompt) {
              contextInstructions.push(knowledgePrompt);
              logger.log(`[OPENCODE MODE] KB context: ${knowledgePrompt.length} chars`);
            }
          } catch (e) {
            logger.warn("[OPENCODE MODE] KB prompt build failed:", e);
          }

          // 2. Language & Behavior instructions
          const chatLang = settings.chatLanguage || "es";
          const langMap: Record<string, string> = { es: "español", en: "English" };
          contextInstructions.push(
            `Responde siempre en ${langMap[chatLang] || chatLang}.\n` +
            `NUNCA expliques al usuario cómo ejecutar la aplicación localmente (ej: npm run dev) ni cómo ver los cambios actualizados. El entorno (Minube Vibes) ya se encarga de recompilar y mostrar la app automáticamente de forma transparente. Omite todas las instrucciones de ejecución.`
          );


          // 3. Integration prompts — inject credentials and instructions
          // Supabase
          if (updatedChat.app?.supabaseProjectId && isSupabaseConnected(settings)) {
            try {
              const supabaseClientCode = await getSupabaseClientCode({
                projectId: updatedChat.app.supabaseProjectId,
                organizationSlug: updatedChat.app.supabaseOrganizationSlug ?? null,
              });
              contextInstructions.push(getSupabaseAvailableSystemPrompt(supabaseClientCode));
              logger.log("[OPENCODE MODE] Supabase context injected");
            } catch (e) {
              logger.warn("[OPENCODE MODE] Supabase prompt failed:", e);
            }
          }

          // Bunny.net
          const ocBunnyConfig = updatedChat.app?.bunnyConfig as BunnyConfig | null;
          if (ocBunnyConfig && (ocBunnyConfig.databases?.length > 0 || ocBunnyConfig.storageZones?.length > 0)) {
            contextInstructions.push(getBunnyAvailableSystemPrompt(ocBunnyConfig));
            logger.log("[OPENCODE MODE] Bunny context injected");
          }

          // PocketBase
          const ocPocketbaseConfig = updatedChat.app?.pocketbaseConfig as any;
          if (ocPocketbaseConfig?.url && ocPocketbaseConfig.adminEmail) {
            contextInstructions.push(getPocketBaseAvailableSystemPrompt(ocPocketbaseConfig));
            logger.log("[OPENCODE MODE] PocketBase context injected");
          }

          // 4. Build integration env vars — accessible via bash in OpenCode
          const integrationEnvVars: Record<string, string> = {};

          // Bunny DB
          if (ocBunnyConfig?.databases?.length > 0) {
            const db0 = ocBunnyConfig.databases[0];
            integrationEnvVars.BUNNY_DB_URL = db0.databaseUrl;
            integrationEnvVars.BUNNY_DB_TOKEN = db0.fullAccessToken;
            if (db0.readOnlyToken) integrationEnvVars.BUNNY_DB_READONLY_TOKEN = db0.readOnlyToken;
          }
          // Bunny Storage
          if (ocBunnyConfig?.storageZones?.length > 0) {
            const sz0 = ocBunnyConfig.storageZones[0];
            integrationEnvVars.BUNNY_STORAGE_HOSTNAME = sz0.hostname;
            integrationEnvVars.BUNNY_STORAGE_USERNAME = sz0.username;
            integrationEnvVars.BUNNY_STORAGE_PASSWORD = sz0.password;
          }
          // PocketBase
          if (ocPocketbaseConfig?.url) {
            integrationEnvVars.POCKETBASE_URL = ocPocketbaseConfig.url;
            if (ocPocketbaseConfig.adminEmail) integrationEnvVars.POCKETBASE_ADMIN_EMAIL = ocPocketbaseConfig.adminEmail;
            if (ocPocketbaseConfig.adminPassword) integrationEnvVars.POCKETBASE_ADMIN_PASSWORD = ocPocketbaseConfig.adminPassword;
          }

          const { fullResponse: openCodeResponse, success, inputTokens: ocInputTokens, outputTokens: ocOutputTokens, cachedTokens: ocCachedTokens } = await handleOpenCodeStream(
            event,
            req,
            abortController,
            {
              placeholderMessageId: placeholderAssistantMessage.id,
              appPath: updatedChat.app.path,
              chatMessages: updatedChat.messages,
              contextInstructions,
              attachmentPaths: attachmentPaths.length > 0 ? attachmentPaths : undefined,
              attachments: req.attachments as any,
              integrationEnvVars: Object.keys(integrationEnvVars).length > 0 ? integrationEnvVars : undefined,
            },
          );

          // Persist the response to the database
          fullResponse = openCodeResponse;
          const openCodeDurationMs = Date.now() - streamStartedAt;
          const ocTotalTokens = ocInputTokens + ocOutputTokens;

          // Append token usage badge to the response (like legacy agent does)
          if (ocTotalTokens > 0) {
            // Look up pricing from OpenRouter model data
            let priceIn = "";
            let priceOut = "";
            try {
              const { fetchOpenRouterModels } = await import("../utils/openrouter_models_service");
              const models = await fetchOpenRouterModels();
              const modelData = models.find(m => m.name === settings.selectedModel.name);
              priceIn = modelData?.pricingInput || "";
              priceOut = modelData?.pricingOutput || "";
            } catch { /* pricing unavailable */ }

            const tokenXml = `<vibes-token-usage input="${ocInputTokens}" output="${ocOutputTokens}" cached="${ocCachedTokens}" price-input="${priceIn}" price-output="${priceOut}"></vibes-token-usage>`;
            fullResponse += tokenXml + "\n";

            // Log token usage for verbose chat logs and ChatLogsPanel
            void logChatInfo(
              req.chatId,
              "token-usage",
              `Total tokens: ${ocTotalTokens} (input: ${ocInputTokens}, output: ${ocOutputTokens})`,
              {
                totalTokens: ocTotalTokens,
                inputTokens: ocInputTokens,
                outputTokens: ocOutputTokens,
                model: settings.selectedModel.name,
                type: "opencode-agent",
              },
              placeholderAssistantMessage.id,
            );

            // Log to token stats file
            logTokenUsage({
              chatId: req.chatId,
              messageId: placeholderAssistantMessage.id,
              totalTokens: ocTotalTokens,
              promptTokens: ocInputTokens,
              completionTokens: ocOutputTokens,
              model: settings.selectedModel.name,
              timestamp: Date.now(),
              appId: updatedChat.app.id,
            });
          }

          await db
            .update(remoteSchema.messages)
            .set({
              content: fullResponse,
              durationMs: openCodeDurationMs,
              totalTokens: ocTotalTokens > 0 ? ocTotalTokens : undefined,
            })
            .where(
              and(
                eq(remoteSchema.messages.id, placeholderAssistantMessage.id),
                eq(remoteSchema.messages.userId, currentUserId as string),
              ),
            );

          // Send the final response to the frontend
          safeSend(event.sender, "chat:response:chunk", {
            chatId: req.chatId,
            messages: [
              ...updatedChat.messages.slice(0, -1),
              { ...placeholderAssistantMessage, content: fullResponse, durationMs: openCodeDurationMs, totalTokens: ocTotalTokens > 0 ? ocTotalTokens : undefined },
            ],
          });

          // Process any file changes from OpenCode's response
          // (OpenCode writes files directly, so we just need to notify the frontend)
          const responseEnd: ChatResponseEnd = {
            chatId: req.chatId,
            updatedFiles: success,
            totalTokens: ocTotalTokens > 0 ? ocTotalTokens : undefined,
          };
          safeSend(event.sender, "chat:response:end", responseEnd);

          // Log telemetry
          sendTelemetryEvent("chat:stream:end", {
            chatMode: "opencode-agent",
            model: settings.selectedModel.name,
            responseLength: fullResponse.length,
            success,
            totalTokens: ocTotalTokens,
          });

          return;
        }

        // NOTE: legacy-agent / build / agent modes removed.
        // The preprocessor in schemas.ts migrates them to local-agent.

        // When calling streamText, the messages need to be properly formatted for mixed content
        const { fullStream } = await simpleStreamText({
          chatMessages,
          modelClient,
          files: files,
        });

        // Process the stream as before
        try {
          const result = await processStreamChunks({
            fullStream,
            fullResponse,
            abortController,
            chatId: req.chatId,
            processResponseChunkUpdate,
          });
          fullResponse = result.fullResponse;



          if (
            !abortController.signal.aborted &&
            settings.selectedChatMode !== "ask" &&
            hasUnclosedVibesWrite(fullResponse)
          ) {
            let continuationAttempts = 0;
            while (
              hasUnclosedVibesWrite(fullResponse) &&
              continuationAttempts < 2 &&
              !abortController.signal.aborted
            ) {
              logger.warn(
                `Received unclosed vibes-write tag, attempting to continue, attempt #${continuationAttempts + 1}`,
              );
              continuationAttempts++;

              const { fullStream: contStream } = await simpleStreamText({
                // Build messages: replay history then pre-fill assistant with current partial.
                chatMessages: [
                  ...chatMessages,
                  { role: "assistant", content: fullResponse },
                ],
                modelClient,
                files: files,
              });
              for await (const part of contStream) {
                // If the stream was aborted, exit early
                if (abortController.signal.aborted) {
                  logger.log(`Stream for chat ${req.chatId} was aborted`);
                  break;
                }
                if (part.type !== "text-delta") continue; // ignore reasoning for continuation
                fullResponse += part.text;
                fullResponse = cleanFullResponse(fullResponse);
                fullResponse = await processResponseChunkUpdate({
                  fullResponse,
                });
              }
            }
          }
          const addDependencies = getAddDependencyTags(fullResponse);

        } catch (streamError) {
          // Check if this was an abort error
          if (abortController.signal.aborted) {
            const chatId = req.chatId;
            const partialResponse = partialResponses.get(req.chatId);
            // If we have a partial response, save it to the database
            if (partialResponse) {
              try {
                // Update the placeholder assistant message with the partial content and cancellation note
                await db
                  .update(remoteSchema.messages)
                  .set({
                    content: `${partialResponse}

[Response cancelled by user]`,
                  })
                  .where(eq(remoteSchema.messages.id, placeholderAssistantMessage.id));

                logger.log(
                  `Updated cancelled response for placeholder message ${placeholderAssistantMessage.id} in chat ${chatId}`,
                );
                partialResponses.delete(req.chatId);
              } catch (error) {
                logger.error(
                  `Error saving partial response for chat ${chatId}:`,
                  error,
                );
              }
            }
            return req.chatId;
          }
          throw streamError;
        }
      }

      // Only save the response and process it if we weren't aborted
      if (!abortController.signal.aborted && fullResponse) {
        // Scrape from: <vibes-chat-summary>Renaming profile file</<vibes-chat-title>
        const chatTitle = fullResponse.match(
          /<vibes-chat-summary>(.*?)<\/vibes-chat-summary>/,
        );
        if (chatTitle) {
          await db
            .update(remoteSchema.chats)
            .set({ title: chatTitle[1].trim() })
            .where(and(eq(remoteSchema.chats.id, req.chatId), eq(remoteSchema.chats.userId, currentUserId as string), isNull(remoteSchema.chats.title)));
        }
        const chatSummary = chatTitle?.[1];

        // Update the placeholder assistant message with the full response
        await db
          .update(remoteSchema.messages)
          .set({
            content: fullResponse,
            model: selectedModel?.name ?? placeholderAssistantMessage.model,
            durationMs: Date.now() - streamStartedAt,
          })
          .where(and(eq(remoteSchema.messages.id, placeholderAssistantMessage.id), eq(remoteSchema.messages.userId, currentUserId as string)));

        // Fire-and-forget: auto-extract knowledge from this interaction
        void autoExtractKnowledge(
          updatedChat!.app.id,
          currentUserId as string,
          userPrompt,
          fullResponse,
        );

        const settings = readSettings();
        if (
          settings.autoApproveChanges &&
          settings.selectedChatMode !== "ask"
        ) {
          // NOTE: This applies to generic/fallback generation. Build mode itself is deprecated,
          // but if we ever get here, processFullResponseActions handles the vibes-* tags.
          const status = await processFullResponseActions(
            fullResponse,
            req.chatId,
            {
              chatSummary,
              messageId: placeholderAssistantMessage.id,
            }, // Use placeholder ID
          );

          const chat = await db.query.chats.findFirst({
            where: and(eq(remoteSchema.chats.id, req.chatId), eq(remoteSchema.chats.userId, currentUserId as string)),
            with: {
              messages: {
                orderBy: (messages, { asc }) => [asc(messages.createdAt)],
              },
            },
          });

          safeSend(event.sender, "chat:response:chunk", {
            chatId: req.chatId,
            messages: chat!.messages,
          });

          if (status.error) {
            safeSend(event.sender, "chat:response:error", {
              chatId: req.chatId,
              error: `Sorry, there was an error applying the AI's changes: ${status.error}`,
            });
          }

          // Signal that the stream has completed
          safeSend(event.sender, "chat:response:end", {
            chatId: req.chatId,
            updatedFiles: status.updatedFiles ?? false,
            extraFiles: status.extraFiles,
            extraFilesError: status.extraFilesError,
            chatSummary,
          } satisfies ChatResponseEnd);
        } else {
          safeSend(event.sender, "chat:response:end", {
            chatId: req.chatId,
            updatedFiles: false,
            chatSummary,
          } satisfies ChatResponseEnd);
        }
      }

      // Return the chat ID for backwards compatibility
      return req.chatId;
    } catch (error) {
      logger.error("Error calling LLM:", error);
      const catchErrorText = `Sorry, there was an error processing your request: ${error}`;
      safeSend(event.sender, "chat:response:error", {
        chatId: req.chatId,
        error: catchErrorText,
      });
      // Persist error text in DB so it survives reload
      if (outerPlaceholderMessageId) {
        void db
          .update(remoteSchema.messages)
          .set({ content: `${PERSISTED_ERROR_PREFIX}${catchErrorText}`, status: "failed" as any })
          .where(eq(remoteSchema.messages.id, outerPlaceholderMessageId))
          .catch((err) => logger.error("Failed to persist error in message content", err));
      }

      return "error";
    } finally {
      // Clean up the abort controller
      activeStreams.delete(req.chatId);

      // Notify renderer that stream has ended
      safeSend(event.sender, "chat:stream:end", { chatId: req.chatId });

      // Clean up any temporary files
      if (attachmentPaths.length > 0) {
        for (const filePath of attachmentPaths) {
          try {
            // We don't immediately delete files because they might be needed for reference
            // Instead, schedule them for deletion after some time
            setTimeout(
              async () => {
                if (fs.existsSync(filePath)) {
                  await unlink(filePath);
                  logger.log(`Deleted temporary file: ${filePath}`);
                }
              },
              30 * 60 * 1000,
            ); // Delete after 30 minutes
          } catch (error) {
            logger.error(`Error scheduling file deletion: ${error}`);
          }
        }
      }
    }
  });

  // Handler to cancel an ongoing stream
  createTypedHandler(chatContracts.cancelStream, async (event, chatId) => {
    const abortController = activeStreams.get(chatId);

    if (abortController) {
      // Abort the stream
      abortController.abort();
      activeStreams.delete(chatId);
      logger.log(`Aborted stream for chat ${chatId}`);
    } else {
      logger.warn(`No active stream found for chat ${chatId}`);
    }

    // Send the end event to the renderer
    safeSend(event.sender, "chat:response:end", {
      chatId,
      updatedFiles: false,
    } satisfies ChatResponseEnd);

    // Also emit stream:end so cleanup listeners (e.g., pending agent consents) fire
    safeSend(event.sender, "chat:stream:end", { chatId });

    return true;
  });
}

export default registerChatStreamHandlers;

export function formatMessagesForSummary(
  messages: { role: string; content: string | undefined }[],
) {
  if (messages.length <= 8) {
    // If we have 8 or fewer messages, include all of them
    return messages
      .map((m) => `<message role="${m.role}">${m.content}</message>`)
      .join("\n");
  }

  // Take first 2 messages and last 6 messages
  const firstMessages = messages.slice(0, 2);
  const lastMessages = messages.slice(-6);

  // Combine them with an indicator of skipped messages
  const combinedMessages = [
    ...firstMessages,
    {
      role: "system",
      content: `[... ${messages.length - 8} messages omitted ...]`,
    },
    ...lastMessages,
  ];

  return combinedMessages
    .map((m) => `<message role="${m.role}">${m.content}</message>`)
    .join("\n");
}

// Helper function to replace text attachment placeholders with full content
async function replaceTextAttachmentWithContent(
  text: string,
  filePath: string,
  fileName: string,
): Promise<string> {
  try {
    if (await isTextFile(filePath)) {
      // Read the full content
      const fullContent = await readFile(filePath, "utf-8");

      // Replace the placeholder tag with the full content
      const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tagPattern = new RegExp(
        `<vibes-text-attachment filename="[^"]*" type="[^"]*" path="${escapedPath}">\\s*<\\/vibes-text-attachment>`,
        "g",
      );

      const replacedText = text.replace(
        tagPattern,
        `Full content of ${fileName}:\n\`\`\`\n${fullContent}\n\`\`\``,
      );

      logger.log(
        `Replaced text attachment content for: ${fileName} - length before: ${text.length} - length after: ${replacedText.length}`,
      );
      return replacedText;
    }
    return text;
  } catch (error) {
    logger.error(`Error processing text file: ${error}`);
    return text;
  }
}

// Helper function to convert traditional message to one with proper image attachments
async function prepareMessageWithAttachments(
  message: ModelMessage,
  attachmentPaths: string[],
): Promise<ModelMessage> {
  let textContent = message.content;
  // Get the original text content
  if (typeof textContent !== "string") {
    logger.warn(
      "Message content is not a string - shouldn't happen but using message as-is",
    );
    return message;
  }

  // Process text file attachments - replace placeholder tags with full content
  for (const filePath of attachmentPaths) {
    const fileName = path.basename(filePath);
    textContent = await replaceTextAttachmentWithContent(
      textContent,
      filePath,
      fileName,
    );
  }

  // For user messages with attachments, create a content array
  const contentParts: (TextPart | ImagePart)[] = [];

  // Add the text part first with possibly modified content
  contentParts.push({
    type: "text",
    text: textContent,
  });

  // Add image parts for any image attachments
  for (const filePath of attachmentPaths) {
    const ext = path.extname(filePath).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
      try {
        // Read the file as a buffer and convert to base64 string
        // Using base64 strings instead of raw Buffers ensures proper JSON serialization
        // for storage in aiMessagesJson (raw Buffers serialize inefficiently and exceed size limits)
        const imageBuffer = await readFile(filePath);
        const mimeType =
          ext === ".jpg" ? "image/jpeg" : `image/${ext.slice(1)}`;
        const base64Data = imageBuffer.toString("base64");

        // Add the image to the content parts with base64 data and mediaType
        contentParts.push({
          type: "image",
          image: base64Data,
          mediaType: mimeType,
        });

        logger.log(`Added image attachment: ${filePath}`);
      } catch (error) {
        logger.error(`Error reading image file: ${error}`);
      }
    }
  }

  // Return the message with the content array
  return {
    role: "user",
    content: contentParts,
  };
}

function removeNonEssentialTags(text: string): string {
  return removeProblemReportTags(removeThinkingTags(text));
}

function removeThinkingTags(text: string): string {
  const thinkRegex = /<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>/g;
  return text.replace(thinkRegex, "").trim();
}

export function removeProblemReportTags(text: string): string {
  const problemReportRegex =
    /<vibes-problem-report[^>]*>[\s\S]*?<\/vibes-problem-report>/g;
  return text.replace(problemReportRegex, "").trim();
}

export function removeVibesTags(text: string): string {
  const vibesTagRegex = /<vibes-[^>]*>[\s\S]*?<\/vibes-[^>]*>/g;
  return text.replace(vibesTagRegex, "").trim();
}

export function hasUnclosedVibesWrite(text: string): boolean {
  // Find the last opening vibes-write tag
  const openRegex = /<vibes-write[^>]*>/g;
  let lastOpenIndex = -1;
  let match;

  while ((match = openRegex.exec(text)) !== null) {
    lastOpenIndex = match.index;
  }

  // If no opening tag found, there's nothing unclosed
  if (lastOpenIndex === -1) {
    return false;
  }

  // Look for a closing tag after the last opening tag
  const textAfterLastOpen = text.substring(lastOpenIndex);
  const hasClosingTag = /<\/vibes-write>/.test(textAfterLastOpen);

  return !hasClosingTag;
}

function escapeVibesTags(text: string): string {
  // Escape vibes tags in reasoning content
  // We are replacing the opening tag with a look-alike character
  // to avoid issues where thinking content includes vibes tags
  // and are mishandled by:
  // 1. FE markdown parser
  // 2. Main process response processor
  return text
    .replace(/<vibes/g, "＜vibes")
    .replace(/<\/vibes/g, "＜/vibes")
    .replace(/<dyad/g, "＜dyad")
    .replace(/<\/dyad/g, "＜/dyad")
    .replace(/<assistant_/g, "＜assistant_")
    .replace(/<\/assistant_/g, "＜/assistant_");
}

/**
 * Strip Gemini-style wrapper tags from streamed content.
 * - <assistant_response>...</assistant_response> → keeps inner content (the actual response)
 * - <assistant_thought>...</assistant_thought> → converts to <think>...</think> (already handled by the app)
 */
function stripAssistantWrapperTags(text: string): string {
  return text
    .replace(/<\/?assistant_response>/g, "")
    .replace(
      /<assistant_thought>([\s\S]*?)<\/assistant_thought>/g,
      "<think>$1</think>",
    );
}

const CODEBASE_PROMPT_PREFIX = "This is my codebase.";
function createCodebasePrompt(codebaseInfo: string): string {
  return `${CODEBASE_PROMPT_PREFIX} ${codebaseInfo}`;
}

function createOtherAppsCodebasePrompt(otherAppsCodebaseInfo: string): string {
  return `
# Referenced Apps

These are the other apps that I've mentioned in my prompt. These other apps' codebases are READ-ONLY.

${otherAppsCodebaseInfo}
`;
}

/**
 * Helper function to try MCP-based file ranking
 * Moved outside getMcpTools to be accessible from other functions
 */
async function tryMcpRankFiles({
  prompt,
  files,
  maxResults,
  userId,
}: {
  prompt: string;
  files: CodebaseFile[];
  maxResults: number;
  userId: string;
}): Promise<CodebaseFile[] | null> {
  try {
    const db = getRemoteDb();
    const servers = await db
      .select()
      .from(remoteSchema.mcpServers)
      .where(and(eq(remoteSchema.mcpServers.enabled, true as any), eq(remoteSchema.mcpServers.userId, userId)));
    if (!servers.length) return null;
    const server = servers[0];
    const client = await mcpManager.getClient(server.id);
    const tools = await client.tools();
    const rankTool = tools["rank_files"];
    if (!rankTool) return null;
    const payload = {
      query: prompt,
      maxResults,
    };
    const result = await rankTool.execute(payload, {} as any);
    // Accept JSON array or newline-delimited paths
    let paths: string[] = [];
    if (Array.isArray(result)) {
      paths = result as string[];
    } else if (typeof result === "string") {
      try {
        const parsed = JSON.parse(result as string);
        if (Array.isArray(parsed)) {
          paths = parsed;
        } else {
          paths = String(result)
            .split("\n")
            .map((p: string) => p.trim())
            .filter(Boolean);
        }
      } catch {
        paths = String(result)
          .split("\n")
          .map((p: string) => p.trim())
          .filter(Boolean);
      }
    }
    if (!paths.length) return null;
    const selected = [];
    const set = new Set(paths);
    for (const f of files) {
      if (set.has(f.path)) {
        selected.push(f);
      }
    }
    if (selected.length === 0) return null;
    return selected.slice(0, maxResults);
  } catch (error) {
    logger.warn("MCP rank_files failed, falling back to local ranking", error);
    return null;
  }
}

async function getMcpTools(
  event: IpcMainInvokeEvent,
  req: ChatStreamParams,
  userId: string,
): Promise<ToolSet> {
  const mcpToolSet: ToolSet = {};
  try {
    const db = getRemoteDb();
    const servers = await db
      .select()
      .from(remoteSchema.mcpServers)
      .where(and(eq(remoteSchema.mcpServers.enabled, true as any), eq(remoteSchema.mcpServers.userId, userId)));
    for (const s of servers) {
      const client = await mcpManager.getClient(s.id);
      const toolSet = await client.tools();
      for (const [name, mcpTool] of Object.entries(toolSet) as [string, any][]) {
        const key = `${String(s.name || "").replace(/[^a-zA-Z0-9_-]/g, "-")}__${String(name).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
        mcpToolSet[key] = {
          description: mcpTool.description,
          inputSchema: mcpTool.inputSchema,
          execute: async (args: unknown, execCtx: ToolExecutionOptions) => {
            const inputPreview =
              typeof args === "string"
                ? args
                : Array.isArray(args)
                  ? args.join(" ")
                  : JSON.stringify(args).slice(0, 500);
            const ok = await requireMcpToolConsent(event, {
              serverId: s.id,
              serverName: s.name,
              toolName: name,
              toolDescription: mcpTool.description,
              inputPreview,
            });

            if (!ok) throw new Error(`User declined running tool ${key}`);

            await logChatInfo(
              req.chatId,
              "tool-execution",
              `Executing MCP tool: ${name}`,
              {
                serverName: s.name,
                toolName: name,
                inputPreview,
              },
            );

            const res = await mcpTool.execute(args, execCtx);

            return typeof res === "string" ? res : JSON.stringify(res);
          },
        };
      }
    }
  } catch (e) {
    logger.warn("Failed building MCP toolset", e);
  }
  return mcpToolSet;
}

/**
 * Generate a compact micro-summary of the project's src/ structure.
 * Produces a one-line summary like:
 *   [Project: 142 files in src/ | 8 pages, 34 components, 12 hooks, 6 lib]
 * ~20-50 tokens, gives the LLM "spatial awareness" without noise.
 */
function generateProjectMicroSummary(appPath: string): string {
  try {
    const srcPath = path.join(appPath, "src");
    if (!fs.existsSync(srcPath)) {
      return "[Project: no src/ directory found]";
    }

    // Count files by well-known category folders
    const categories: Record<string, number> = {};
    let totalFiles = 0;

    const countFiles = (dir: string, depth = 0) => {
      if (depth > 4) return; // Cap recursion
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        if (entry.isDirectory()) {
          countFiles(path.join(dir, entry.name), depth + 1);
        } else if (entry.isFile()) {
          totalFiles++;
        }
      }
    };

    // Map well-known folder names to categories
    const knownFolders: Record<string, string> = {
      pages: "pages",
      components: "components",
      hooks: "hooks",
      lib: "lib",
      utils: "utils",
      styles: "styles",
      assets: "assets",
      types: "types",
      api: "api",
      services: "services",
    };

    // Count files in each known folder
    let categorizedFiles = 0;
    let srcEntries: fs.Dirent[];
    try {
      srcEntries = fs.readdirSync(srcPath, { withFileTypes: true });
    } catch {
      return "[Project: could not read src/]";
    }

    for (const entry of srcEntries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const categoryName = knownFolders[entry.name.toLowerCase()] || null;
      if (categoryName) {
        let count = 0;
        const countDir = (dir: string, depth = 0) => {
          if (depth > 3) return;
          let items: fs.Dirent[];
          try {
            items = fs.readdirSync(dir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const item of items) {
            if (item.name.startsWith(".")) continue;
            if (item.isFile()) count++;
            else if (item.isDirectory()) countDir(path.join(dir, item.name), depth + 1);
          }
        };
        countDir(path.join(srcPath, entry.name));
        if (count > 0) {
          categories[categoryName] = count;
          categorizedFiles += count;
        }
      }
    }

    // Count total files in src/
    countFiles(srcPath);

    const uncategorized = totalFiles - categorizedFiles;
    const parts: string[] = [];
    for (const [name, count] of Object.entries(categories)) {
      parts.push(`${count} ${name}`);
    }
    if (uncategorized > 0) {
      parts.push(`${uncategorized} other`);
    }

    const breakdown = parts.length > 0 ? ` | ${parts.join(", ")}` : "";
    return `[Project: ${totalFiles} files in src/${breakdown}]`;
  } catch (err) {
    logger.warn("Failed to generate project micro-summary:", err);
    return "[Project: unknown structure]";
  }
}
