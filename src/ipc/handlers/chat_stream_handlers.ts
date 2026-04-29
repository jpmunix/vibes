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
} from "../../prompts/system_prompt";
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

import fs from "node:fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { readFile, writeFile, unlink, rm as fsRm } from "fs/promises";
import { getMaxTokens, getTemperature, getContextWindow, estimateTokens } from "../utils/token_utils";
import { MAX_CHAT_TURNS_IN_CONTEXT } from "@/constants/settings_constants";
import { validateChatContext } from "../utils/context_paths_utils";
import { getProviderOptions, getAiHeaders } from "../utils/provider_options";

import { handleOpenCodeStream, revertLastOpenCodeMessage, destroyOpenCodeSession } from "./opencode_adapter";
import { extractMemoriesFromChatCycle } from "../utils/memory_extractor";
import { buildMemoryContext } from "../utils/memory_context_builder";
import { decayMemories as decayMemoriesAsync } from "../utils/memory_lifecycle";

import { safeSend } from "../utils/safe_sender";
import { runningApps } from "../utils/process_manager";
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
import z from "zod";
import { logTokenUsage } from "../utils/token_stats_logger";
import { logChatInfo, logChatError } from "../utils/chat_logger";

import {
  isSupabaseConnected,
  DEFAULT_STANDARD_MODEL,
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

// Smart Mode: remember last classified mode per chat so "context" intents reuse it
const lastSmartModeForChat = new Map<number, string>();

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

      // Insert prior queued messages into Vibes DB so they appear as user bubbles in the UI.
      // OpenCode will also receive them via noReply:true in handleOpenCodeStream.
      if (req.priorMessages && req.priorMessages.length > 0) {
        for (const prior of req.priorMessages) {
          let priorContent = prior.prompt;
          let priorAiMessagesJson: any = null;

          if (prior.attachments && prior.attachments.length > 0) {
            const priorAttachmentPaths: string[] = [];
            let priorAttachmentInfo = "\n\nAttachments:\n";
            for (const att of prior.attachments) {
              const hash = crypto.createHash("md5").update(att.name + Date.now()).digest("hex");
              const ext = path.extname(att.name);
              const filePath = path.join(TEMP_DIR, `${hash}${ext}`);
              const base64Data = att.data.split(";base64,").pop() || "";
              await writeFile(filePath, Buffer.from(base64Data, "base64"));
              priorAttachmentPaths.push(filePath);
              priorAttachmentInfo += `- ${att.name} (${att.type})\n`;
            }
            priorContent += priorAttachmentInfo;
            // Build aiMessagesJson for image visibility in the UI
            const prepared = await prepareMessageWithAttachments({ role: "user", content: priorContent } as any, priorAttachmentPaths);
            const json = getAiMessagesJsonIfWithinLimit([prepared]);
            if (json) priorAiMessagesJson = JSON.stringify(json);
          }

          await db.insert(remoteSchema.messages).values({
            userId: currentUserId,
            chatId: req.chatId,
            role: "user",
            content: priorContent,
            aiMessagesJson: priorAiMessagesJson,
            createdAt: new Date(),
          });
          // 1ms gap to guarantee insertion order
          await new Promise((r) => setTimeout(r, 1));
        }
        logger.info(`[Stream] Inserted ${req.priorMessages.length} prior queued message(s) into DB for chat ${req.chatId}`);
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
            }).catch(() => null),
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
            }).catch(() => null),
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

        // Skip codebase extraction for summarize intent and OpenCode agent mode.
        // OpenCode has its own tools (bash, file read) to explore files on-demand;
        // injecting the entire codebase into the prompt is unnecessary and slow.
        let codebaseInfo = "";
        let files: CodebaseFile[] = [];

        // All active modes (agent, ask, plan) use the OpenCode agent stream
        // which explores files on-demand via tools — no upfront codebase extraction needed.
        const isAgentMode = settings.selectedChatMode === "agent" ||
          settings.selectedChatMode === "ask" ||
          settings.selectedChatMode === "plan" ||
          settings.selectedChatMode === "mockup" ||
          (settings.selectedChatMode as unknown as string) === "crush-agent";

        if (isAgentMode) {
          logger.log(
            `[CODEBASE] Skipping codebase extraction — agent explores files via tools`,
          );
        } else {
          logger.log(
            `[CODEBASE] Extracting codebase from ${appPath} with chatContext:`,
            chatContext,
          );
          const extracted = await extractCodebase({
            appPath,
            chatContext,
          });
          codebaseInfo = extracted.formattedOutput;
          files = extracted.files;
          logger.log(
            `[CODEBASE] Extracted ${files.length} files from codebase`,
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

        // ── Build-mode preprocessing (skipped for OpenCode agent mode) ──────
        // OpenCode manages its own context via AGENTS.md and built-in tools.
        // These variables are only used by the build/ask mode branches below.
        let mentionedAppsCodebases: Awaited<ReturnType<typeof extractMentionedAppsCodebases>> = [];
        let willUseAgentStream = isAgentMode;
        let isDeepContextEnabled = false;
        let otherAppsCodebaseInfo = "";
        let limitedMessageHistory: any[] = [];
        let systemPrompt = "";

        if (!isAgentMode) {
          // Parse app mentions from the prompt
          const mentionedAppNames = parseAppMentions(req.prompt);

          // Extract codebases for mentioned apps
          mentionedAppsCodebases = await extractMentionedAppsCodebases(
            mentionedAppNames,
            updatedChat.app.id, // Exclude current app
          );
          willUseAgentStream =
            (settings.selectedChatMode === "agent" ||
              settings.selectedChatMode === "ask" ||
              settings.selectedChatMode === "mockup") &&
            !mentionedAppsCodebases.length;

          isDeepContextEnabled =
            isEngineEnabled &&
            settings.enableProSmartFilesContextMode &&
            settings.proSmartContextOption !== "balanced" &&
            mentionedAppsCodebases.length === 0;
          logger.log(`isDeepContextEnabled: ${isDeepContextEnabled}`);

          // Combine current app codebase with mentioned apps' codebases
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

          const maxChatTurns = isDeepContextEnabled
            ? 51
            : (settings.maxChatTurnsInContext || MAX_CHAT_TURNS_IN_CONTEXT) + 1;

          limitedMessageHistory = messageHistory;
          if (messageHistory.length > maxChatTurns * 2) {
            let recentMessages = messageHistory
              .filter((msg: any) => msg.role !== "system")
              .slice(-maxChatTurns * 2);

            if (recentMessages.length > 0 && recentMessages[0].role !== "user") {
              const firstUserIndex = recentMessages.findIndex(
                (msg: any) => msg.role === "user",
              );
              if (firstUserIndex > 0) {
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

          // Get theme prompt for the app (null themeId means "no theme")
          const themePrompt = await getThemePromptById(updatedChat.app.themeId);
          logger.log(
            `Theme for app ${updatedChat.app.id}: ${updatedChat.app.themeId ?? "none"}, prompt length: ${themePrompt.length} chars`,
          );

          systemPrompt = constructSystemPrompt({
            chatMode: ((settings.selectedChatMode as string) || "agent") as "ask" | "agent" | "plan",
            themePrompt,
            chatLanguage: settings.chatLanguage || "es",
            settings,
          });

          // Knowledge Base prompt — REMOVED (replaced by OpenCode AGENTS.md)

          // Add information about mentioned apps if any
          if (otherAppsCodebaseInfo) {
            const mentionedAppsList = mentionedAppsCodebases
              .map(({ appName }) => appName)
              .join(", ");

            systemPrompt += `\n\n# Referenced Apps\nThe user has mentioned the following apps in their prompt: ${mentionedAppsList}. Their codebases have been included in the context for your reference. When referring to these apps, you can understand their structure and code to provide better assistance, however you should NOT edit the files in these referenced apps. The referenced apps are NOT part of the current app and are READ-ONLY.`;
          }
        } // end !isAgentMode


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
            (settings.selectedChatMode === "agent" || settings.selectedChatMode === "mockup"
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
          settings.selectedChatMode !== "agent" &&
          settings.selectedChatMode !== "mockup"
        ) {
          systemPrompt += "\n\n" + SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT;
        }

        // Bunny.net prompt injection
        const bunnyConfig = updatedChat.app?.bunnyConfig as BunnyConfig | null;
        if (bunnyConfig && (bunnyConfig.databases?.length > 0 || bunnyConfig.storageZones?.length > 0)) {
          systemPrompt += "\n\n" + getBunnyAvailableSystemPrompt(bunnyConfig);
        } else if (
          settings.selectedChatMode !== "agent" &&
          settings.selectedChatMode !== "mockup"
        ) {
          systemPrompt += "\n\n" + BUNNY_NOT_AVAILABLE_SYSTEM_PROMPT;
        }

        // PocketBase prompt injection
        const pocketbaseConfig = updatedChat.app?.pocketbaseConfig as any;
        if (pocketbaseConfig && pocketbaseConfig.url && pocketbaseConfig.adminEmail) {
          systemPrompt += "\n\n" + getPocketBaseAvailableSystemPrompt(pocketbaseConfig);
        } else if (
          settings.selectedChatMode !== "agent" &&
          settings.selectedChatMode !== "mockup"
        ) {
          systemPrompt += "\n\n" + POCKETBASE_NOT_AVAILABLE_SYSTEM_PROMPT;
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
          if (willUseAgentStream) {
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
              safeSend(event.sender, "chat:response:error", {
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

        // ── Unified OpenCode pipeline for all modes ─────────────────────
        // agent → "build" (full access, all tools)
        // plan  → "plan"  (restricted: file edits & bash require permission)
        // ask   → "explore" (read-only, no file modifications)
        const agentIdMap: Record<string, "build" | "plan" | "explore" | "mockup"> = {
          agent: "build",
          "crush-agent": "build",
          plan: "plan",
          ask: "explore",
          mockup: "mockup",
        };
        const resolvedChatMode: string = (settings.selectedChatMode || "agent");

        const agentId = agentIdMap[resolvedChatMode] || "build";

        if (!mentionedAppsCodebases.length) {
          const modeLabel = agentId.charAt(0).toUpperCase() + agentId.slice(1);
          logger.log(`[OpenCode:${modeLabel}] Starting ${agentId} agent for chat ${req.chatId} (mode: ${settings.selectedChatMode})`);


          // Context instructions for the OpenCode session.
          // Only inject integration credentials and language — OpenCode
          // handles all project knowledge natively via AGENTS.md.
          const contextInstructions: string[] = [];

          // 1. Language & Behavior instructions
          const chatLang = settings.chatLanguage || "es";
          const langMap: Record<string, string> = { es: "español", en: "English" };
          const langName = langMap[chatLang] || chatLang;
          contextInstructions.push(
            `ES ABSOLUTAMENTE IMPERATIVO que respondas SIEMPRE en ${langName}. Piensa en ${langName}, razona en ${langName} y redacta TODAS tus respuestas completamente en ${langName}. No uses otro idioma bajo ninguna circunstancia excepto en nombres de código, variables o tecnologías.\n` +
            `NUNCA expliques al usuario cómo ejecutar la aplicación localmente (ej: npm run dev) ni cómo ver los cambios actualizados. El entorno (Minube Vibes) ya se encarga de recompilar y mostrar la app automáticamente de forma transparente. Omite todas las instrucciones de ejecución.`
          );

          // (LSP is always enabled — no fallback instruction needed)

          // 3. Tool correction (mainly for Gemini hallucinating shell edits)
          contextInstructions.push(
            `NOTAS DE ENTORNO IMPORTANTES:\n` +
            `1. Tienes HERRAMIENTAS JSON NATIVAS (tools) definidas en tu esquema para editar archivos. USAS ESTAS HERRAMIENTAS nativas.\n` +
            `2. NUNCA uses la herramienta "bash" para intentar editar código ejecutando scripts en consola de "python" o comandos "sed" o redirecciones en la terminal. Usa siempre tus JSON tools disponibles en el esquema para cualquier edición.`
          );

          // 4. Efficiency & Task Triage (Prevent over-thinking simple tasks)
          contextInstructions.push(
            `CRITERIOS DE EFICIENCIA Y TRIAJE DE TAREAS:\n` +
            `Antes de empezar cualquier tarea, evalúa su complejidad:\n\n` +
            `TAREAS SIMPLES (ej: renombrar variables, cambiar textos, actualizar imports, corregir errores tipográficos, cambios de estilo menores):\n` +
            `- PROHIBIDO usar herramientas de búsqueda extensivas como glob pattern o grep.\n` +
            `- Lee ÚNICAMENTE el archivo específico mencionado (1-2 archivos máximo).\n` +
            `- Haz la edición INMEDIATAMENTE sin planificar ni explorar el código base.\n` +
            `- Mantén tu respuesta final extremadamente corta y directa.\n\n` +
            `TAREAS COMPLEJAS (ej: refactorizaciones profundas, nuevas features complejas):\n` +
            `- Para estas tareas SÍ puedes explorar libremente el código base antes de actuar.\n\n` +
            `RECUERDA: La mayoría de peticiones del usuario son SIMPLES. Por defecto, aplica el principio de mínima exploración.`
          );

          // 5. Smart todowrite usage — task management for complex requests
          contextInstructions.push(
            `GESTIÓN DE TAREAS: Si la petición del usuario requiere 3 o más cambios diferenciados ` +
            `(crear varios archivos, modificar múltiples componentes, implementar varias funcionalidades), ` +
            `usa la herramienta todowrite para crear una lista de tareas ANTES de empezar a trabajar. ` +
            `Marca cada tarea como completada (status: "done") a medida que avanzas. ` +
            `NO uses todowrite para cambios simples como corregir un error, ajustar un estilo, ` +
            `o modificar un solo archivo. En esos casos, actúa directamente.`
          );

          // 6. Plan mode — interactive question-driven planning
          if (resolvedChatMode === "plan") {
            const isEnglish = (settings.chatLanguage || "es") === "en";
            contextInstructions.push(
              isEnglish
                ? `INTERACTIVE PLANNING MODE:\n` +
                  `When the user asks you to create a plan, do NOT assume details that are not explicit.\n` +
                  `Use your "question" tool to ask the user about design decisions, architecture,\n` +
                  `technologies, priorities, and any ambiguity.\n` +
                  `Rule: maximum 5 questions. Group related ones. Use options when alternatives are clear.\n` +
                  `Once everything is clarified, generate the definitive plan.`
                : `MODO PLANIFICACIÓN INTERACTIVA:\n` +
                  `Cuando el usuario te pide crear un plan, NO asumas los detalles que no están explícitos.\n` +
                  `Usa tu herramienta "question" para preguntar al usuario sobre decisiones de diseño,\n` +
                  `arquitectura, tecnologías, prioridades y cualquier ambigüedad.\n` +
                  `Regla: máximo 5 preguntas. Agrupa las relacionadas. Usa opciones cuando las alternativas sean claras.\n` +
                  `Una vez aclarado todo, genera el plan definitivo.`
            );
          }

          // Supabase
          if (updatedChat.app?.supabaseProjectId && isSupabaseConnected(settings)) {
            try {
              const supabaseClientCode = await getSupabaseClientCode({
                projectId: updatedChat.app.supabaseProjectId,
                organizationSlug: updatedChat.app.supabaseOrganizationSlug ?? null,
              });
              contextInstructions.push(getSupabaseAvailableSystemPrompt(supabaseClientCode));
              logger.log("[OPENCODE] Supabase context injected");
            } catch (e) {
              logger.warn("[OPENCODE] Supabase prompt failed:", e);
            }
          }

          // Bunny.net
          const ocBunnyConfig = updatedChat.app?.bunnyConfig as BunnyConfig | null;
          if (ocBunnyConfig && (ocBunnyConfig.databases?.length > 0 || ocBunnyConfig.storageZones?.length > 0)) {
            contextInstructions.push(getBunnyAvailableSystemPrompt(ocBunnyConfig));
            logger.log("[OPENCODE] Bunny context injected");
          }

          // PocketBase
          const ocPocketbaseConfig = updatedChat.app?.pocketbaseConfig as any;
          if (ocPocketbaseConfig?.url && ocPocketbaseConfig.adminEmail) {
            contextInstructions.push(getPocketBaseAvailableSystemPrompt(ocPocketbaseConfig));
            logger.log("[OPENCODE] PocketBase context injected");
          }

          // DESIGN.md — inject full content as context instruction on the FIRST
          // message only. After that, OpenCode's native opencode.json instructions
          // (which reference docs/DESIGN.md) handle it automatically.
          {
            const isFirstMessage = !updatedChat.messages.some(
              (m: any) => m.role === "assistant" && m.id !== placeholderAssistantMessage.id,
            );
            const appPathRaw = updatedChat.app.path;
            const resolvedAppPath = getVibesAppPath(appPathRaw);
            const designMdPath = path.join(resolvedAppPath, "docs", "DESIGN.md");
            const designExists = fs.existsSync(designMdPath);
            logger.info(`🎨 [DESIGN] isFirstMessage=${isFirstMessage}, exists=${designExists}, path="${designMdPath}"`);

            if (isFirstMessage && designExists) {
              try {
                const designContent = fs.readFileSync(designMdPath, "utf-8").trim();
                if (designContent.length > 0) {
                  contextInstructions.push(
                    `DESIGN SYSTEM REFERENCE:\n` +
                    `The following DESIGN.md file defines the visual language, color palette, typography, spacing, and component patterns for this project. ` +
                    `You MUST follow these design guidelines closely when building UI components. ` +
                    `Use the exact colors, fonts, spacing values, and design tokens specified.\n\n` +
                    designContent,
                  );
                  logger.info(`🎨 [DESIGN] ✅ Injected into contextInstructions (${designContent.length} chars)`);
                }
              } catch (designErr: any) {
                logger.warn(`🎨 [DESIGN] ❌ Failed to read: ${designErr.message}`);
              }
            } else if (!isFirstMessage && designExists) {
              logger.info(`🎨 [DESIGN] Skipped (not first message) — trusting opencode.json`);
            }
          }


          // 4. Build integration env vars — accessible via bash in OpenCode
          // ── Memory decay + context injection ─────────────────────────────
          // Decay stale auto-extracted memories (fire-and-forget, non-blocking)
          decayMemoriesAsync(updatedChat.app.id, currentUserId as string)
            .catch(err => logger.warn(`🧠 [MEMORY] Decay failed:`, err));

          // Load memories (app-specific + global) and inject as context instruction
          let selectedMemories: { id: number; type: string; key: string | null; content: string }[] = [];
          try {
            const memoryResult = await buildMemoryContext(
              updatedChat.app.id,
              currentUserId as string,
              userPrompt,
            );
            if (memoryResult.block) {
              contextInstructions.push(memoryResult.block);
              selectedMemories = memoryResult.memories;
              logger.info(`🧠 [MEMORY] Injected ${memoryResult.block.length} chars (${selectedMemories.length} memories) into contextInstructions`);
            }
          } catch (memErr: any) {
            logger.warn(`🧠 [MEMORY] Context injection failed: ${memErr.message}`);
          }

          const integrationEnvVars: Record<string, string> = {};

          // Bunny DB
          if (ocBunnyConfig?.databases && ocBunnyConfig.databases.length > 0) {
            const db0 = ocBunnyConfig.databases[0];
            integrationEnvVars.BUNNY_DB_URL = db0.databaseUrl;
            integrationEnvVars.BUNNY_DB_TOKEN = db0.fullAccessToken;
            if (db0.readOnlyToken) integrationEnvVars.BUNNY_DB_READONLY_TOKEN = db0.readOnlyToken;
          }
          // Bunny Storage
          if (ocBunnyConfig?.storageZones && ocBunnyConfig.storageZones.length > 0) {
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

          const { fullResponse: openCodeResponse, success, inputTokens: ocInputTokens, outputTokens: ocOutputTokens, reasoningTokens: ocReasoningTokens, cachedTokens: ocCachedTokens, costUsd: ocCostUsd } = await handleOpenCodeStream(
            event,
            req,
            abortController,
            {
              placeholderMessageId: placeholderAssistantMessage.id,
              appPath: updatedChat.app.path,
              chatMessages: updatedChat.messages,
              agentId,
              contextInstructions,
              attachmentPaths: attachmentPaths.length > 0 ? attachmentPaths : undefined,
              attachments: req.attachments as any,
              integrationEnvVars: Object.keys(integrationEnvVars).length > 0 ? integrationEnvVars : undefined,
              priorMessages: req.priorMessages as any,
            },
          );

          // ── Handle cancellation gracefully ──────────────────────────────
          if (abortController.signal.aborted) {
            // Strip "Operación cancelada" and vibes tags to see if there's real content
            const stripped = openCodeResponse
              .replace(/Operación cancelada/g, "")
              .replace(/<vibes-[^>]*>[^]*?<\/vibes-[^>]*>/g, "")
              .replace(/<\/?think>/g, "")
              .trim();
            const hasMeaningfulContent = stripped.length > 20;

            if (!hasMeaningfulContent) {
              // No real content — instantly update the frontend, then clean DB in background
              logger.info(`[OpenCode] Cancelled with no content — removing placeholder ${placeholderAssistantMessage.id} and user message ${userMessageId}`);

              // Optimistically compute cleaned message list (remove user msg + assistant placeholder)
              const cleanedMessages = (updatedChat.messages as any[]).filter(
                (m: any) => m.id !== placeholderAssistantMessage.id && m.id !== userMessageId,
              );

              // Send to frontend IMMEDIATELY — no DB wait
              safeSend(event.sender, "chat:response:chunk", {
                chatId: req.chatId,
                messages: cleanedMessages,
              });
              safeSend(event.sender, "chat:response:end", {
                chatId: req.chatId,
                updatedFiles: false,
                restoredPrompt: req.prompt, // Restore the user's prompt to the input box
              } satisfies ChatResponseEnd);

              // Fire-and-forget DB cleanup — doesn't block the UI
              void (async () => {
                try {
                  await db
                    .delete(remoteSchema.messages)
                    .where(
                      and(
                        eq(remoteSchema.messages.id, placeholderAssistantMessage.id),
                        eq(remoteSchema.messages.userId, currentUserId as string),
                      ),
                    );
                  await db
                    .delete(remoteSchema.messages)
                    .where(
                      and(
                        eq(remoteSchema.messages.id, userMessageId),
                        eq(remoteSchema.messages.userId, currentUserId as string),
                      ),
                    );
                } catch (e) {
                  logger.error("[OpenCode] Failed to clean up cancelled messages:", e);
                }
              })();

              return;
            }

            // Has partial content — save it with a "cancelled" visual indicator
            fullResponse = openCodeResponse + "\n\n<vibes-cancelled></vibes-cancelled>\n";
            const openCodeDurationMs = Date.now() - streamStartedAt;

            const ocBillableOutput = ocOutputTokens + ocReasoningTokens;
            const ocTotalTokens = ocInputTokens + ocBillableOutput;

            if (ocTotalTokens > 0) {
              const webSearchCount = (openCodeResponse.match(/<vibes-web-crawl\b/g) || []).length;
              // Prefer the real cost reported by OpenCode over manual token × price calculation.
              // If OpenCode provided a definitive cost, use it directly. Otherwise fall back to
              // looking up OpenRouter's price table (less accurate for cached / discounted tokens).
              let priceIn = "";
              let priceOut = "";
              const directCost = ocCostUsd; // USD reported by OpenCode itself
              if (directCost === null) {
                // Fallback: derive from OpenRouter model pricing
                try {
                  const { fetchOpenRouterModels } = await import("../utils/openrouter_models_service");
                  const models = await fetchOpenRouterModels();
                  const modelData = models.find(m => m.name === settings.selectedModel.name);
                  priceIn = modelData?.pricingInput || "";
                  priceOut = modelData?.pricingOutput || "";
                } catch { /* pricing unavailable */ }
              }
              const tokenXml = directCost !== null
                ? `<vibes-token-usage input="${ocInputTokens}" output="${ocBillableOutput}" cached="${ocCachedTokens}" web-searches="${webSearchCount}" cost="${directCost.toFixed(8)}"></vibes-token-usage>`
                : `<vibes-token-usage input="${ocInputTokens}" output="${ocBillableOutput}" cached="${ocCachedTokens}" web-searches="${webSearchCount}" price-input="${priceIn}" price-output="${priceOut}"></vibes-token-usage>`;
              fullResponse += tokenXml + "\n";

              void logChatInfo(
                req.chatId,
                "token-usage",
                `[Cancelled] Total tokens: ${ocTotalTokens} (input: ${ocInputTokens}, output: ${ocOutputTokens}, reasoning: ${ocReasoningTokens}, billable output: ${ocBillableOutput})`,
                {
                  totalTokens: ocTotalTokens,
                  inputTokens: ocInputTokens,
                  outputTokens: ocOutputTokens,
                  reasoningTokens: ocReasoningTokens,
                  billableOutput: ocBillableOutput,
                  model: settings.selectedModel.name,
                  type: "opencode-agent",
                  cancelled: true,
                },
                placeholderAssistantMessage.id,
              );

              logTokenUsage({
                chatId: req.chatId,
                messageId: placeholderAssistantMessage.id,
                totalTokens: ocTotalTokens,
                promptTokens: ocInputTokens,
                completionTokens: ocBillableOutput,
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
              })
              .where(
                and(
                  eq(remoteSchema.messages.id, placeholderAssistantMessage.id),
                  eq(remoteSchema.messages.userId, currentUserId as string),
                ),
              );

            safeSend(event.sender, "chat:response:chunk", {
              chatId: req.chatId,
              messages: [
                ...updatedChat.messages.slice(0, -1),
                { ...placeholderAssistantMessage, content: fullResponse, durationMs: openCodeDurationMs, totalTokens: ocTotalTokens > 0 ? ocTotalTokens : undefined },
              ],
            });
            safeSend(event.sender, "chat:response:end", {
              chatId: req.chatId,
              updatedFiles: false,
              totalTokens: ocTotalTokens > 0 ? ocTotalTokens : undefined,
            } satisfies ChatResponseEnd);
            
            // Log telemetry
            sendTelemetryEvent("chat:stream:end", {
              chatMode: `opencode-${agentId}`,
              model: settings.selectedModel.name,
              responseLength: fullResponse.length,
              success: false,
              totalTokens: ocTotalTokens,
              cancelled: true,
            });

            // ── Memory extraction from partial response (fire-and-forget) ──
            // Even if the user stopped the stream, there may be valuable knowledge
            // in whatever was already generated.
            if (updatedChat.app?.id && openCodeResponse.length > 100) {
              extractMemoriesFromChatCycle({
                appId: updatedChat.app.id,
                userId: currentUserId as string,
                chatId: req.chatId,
                userPrompt,
                assistantResponse: openCodeResponse,
              }).catch(err => logger.warn("[Memory] Extraction failed (cancelled):", err));
            }

            return;
          }

          // ── Normal (non-cancelled) response ─────────────────────────────
          // Persist the response to the database
          fullResponse = openCodeResponse;
          const openCodeDurationMs = Date.now() - streamStartedAt;
          // Reasoning tokens (thinking) are billed at the same rate as output tokens.
          // They MUST be included in the billable output count for correct cost calculation.
          const ocBillableOutput = ocOutputTokens + ocReasoningTokens;
          const ocTotalTokens = ocInputTokens + ocBillableOutput;

          // Append token usage badge to the response (like legacy agent does)
          if (ocTotalTokens > 0) {
            // Count web searches to calculate correct cost (each search via OpenCode webfetch tool)
            const webSearchCount = (openCodeResponse.match(/<vibes-web-crawl\b/g) || []).length;
            // Prefer the real cost reported by OpenCode over manual token × price calculation.
            // If OpenCode provided a definitive cost, use it directly. Otherwise fall back to
            // looking up OpenRouter's price table (less accurate for cached / discounted tokens).
            let priceIn = "";
            let priceOut = "";
            const directCost = ocCostUsd; // USD reported by OpenCode itself
            if (directCost === null) {
              // Fallback: derive from OpenRouter model pricing
              try {
                const { fetchOpenRouterModels } = await import("../utils/openrouter_models_service");
                const models = await fetchOpenRouterModels();
                const modelData = models.find(m => m.name === settings.selectedModel.name);
                priceIn = modelData?.pricingInput || "";
                priceOut = modelData?.pricingOutput || "";
              } catch { /* pricing unavailable */ }
            }
            const tokenXml = directCost !== null
              ? `<vibes-token-usage input="${ocInputTokens}" output="${ocBillableOutput}" cached="${ocCachedTokens}" web-searches="${webSearchCount}" cost="${directCost.toFixed(8)}"></vibes-token-usage>`
              : `<vibes-token-usage input="${ocInputTokens}" output="${ocBillableOutput}" cached="${ocCachedTokens}" web-searches="${webSearchCount}" price-input="${priceIn}" price-output="${priceOut}"></vibes-token-usage>`;
            fullResponse += tokenXml + "\n";
            // Log token usage for verbose chat logs and ChatLogsPanel
            void logChatInfo(
              req.chatId,
              "token-usage",
              `Total tokens: ${ocTotalTokens} (input: ${ocInputTokens}, output: ${ocOutputTokens}, reasoning: ${ocReasoningTokens}, billable output: ${ocBillableOutput})`,
              {
                totalTokens: ocTotalTokens,
                inputTokens: ocInputTokens,
                outputTokens: ocOutputTokens,
                reasoningTokens: ocReasoningTokens,
                billableOutput: ocBillableOutput,
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
              completionTokens: ocBillableOutput,
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
            })
            .where(
              and(
                eq(remoteSchema.messages.id, placeholderAssistantMessage.id),
                eq(remoteSchema.messages.userId, currentUserId as string),
              ),
            );

          // Send the final response to the frontend
          const finalMessages = [
            ...updatedChat.messages.slice(0, -1),
            { ...placeholderAssistantMessage, content: fullResponse, durationMs: openCodeDurationMs, totalTokens: ocTotalTokens > 0 ? ocTotalTokens : undefined },
          ];

          safeSend(event.sender, "chat:response:chunk", {
            chatId: req.chatId,
            messages: finalMessages,
          });

          // Process any file changes from OpenCode's response
          // (OpenCode writes files directly, so we just need to notify the frontend)
          const responseEnd: ChatResponseEnd = {
            chatId: req.chatId,
            updatedFiles: !!success,
            totalTokens: ocTotalTokens > 0 ? ocTotalTokens : undefined,
            selectedMemories: selectedMemories.length > 0 ? selectedMemories : undefined,
          };
          safeSend(event.sender, "chat:response:end", responseEnd);

          // Log telemetry
          sendTelemetryEvent("chat:stream:end", {
            chatMode: `opencode-${agentId}`,
            model: settings.selectedModel.name,
            responseLength: fullResponse.length,
            success,
            totalTokens: ocTotalTokens,
          });

          // ── Memory extraction (fire-and-forget, never blocks UI) ─────────
          if (success && updatedChat.app?.id) {
            extractMemoriesFromChatCycle({
              appId: updatedChat.app.id,
              userId: currentUserId as string,
              chatId: req.chatId,
              userPrompt,
              assistantResponse: fullResponse,
            }).catch(err => logger.warn("[Memory] Extraction failed:", err));
          }

          // ── Post-agent clean install ────────────────────────────────────
          // The agent may have modified package.json (adding new dependencies)
          // or run a partial `npm install` via bash that left node_modules in
          // a dirty state. Delete node_modules so the upcoming `runApp` call
          // performs a pristine `npm install --legacy-peer-deps`.
          // ONLY do this when the app is NOT already running — if the dev
          // server is live, a restart is the user's responsibility (we don't
          // want to crash a working server mid-session).
          if (success && updatedChat.app?.id && !runningApps.has(updatedChat.app.id)) {
            try {
              const cleanupAppPath = getVibesAppPath(updatedChat.app.path);
              const nodeModulesPath = path.join(cleanupAppPath, "node_modules");
              if (fs.existsSync(nodeModulesPath)) {
                logger.info(`🧹 [POST-AGENT] Removing node_modules for clean install (app ${updatedChat.app.id})`);
                await fsRm(nodeModulesPath, { recursive: true, force: true });
                logger.info(`🧹 [POST-AGENT] node_modules removed — runApp will do a fresh npm install`);
              }
            } catch (cleanupErr: any) {
              logger.warn(`🧹 [POST-AGENT] Failed to remove node_modules: ${cleanupErr.message}`);
            }
          }

          return;
        }

        // Fallback: mentioned apps case falls through to here
        // (rare case — most paths return before this point)
        return req.chatId;
      }
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
      // Abort the stream — the main chat:stream handler will detect the abort
      // and handle cleanup (DB deletion, sending updated messages, and
      // chat:response:end). We do NOT send chat:response:end here because
      // that would remove the stream callbacks before the main handler
      // can send the chat:response:chunk with cleaned-up messages.
      abortController.abort();
      activeStreams.delete(chatId);
      logger.log(`Aborted stream for chat ${chatId}`);
    } else {
      logger.warn(`No active stream found for chat ${chatId}`);
      // No active stream — send end event directly since nobody else will
      safeSend(event.sender, "chat:response:end", {
        chatId,
        updatedFiles: false,
      } satisfies ChatResponseEnd);
    }

    // Always emit stream:end so cleanup listeners (e.g., pending agent consents) fire
    safeSend(event.sender, "chat:stream:end", { chatId });

    return true;
  });
}

export default registerChatStreamHandlers;



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

