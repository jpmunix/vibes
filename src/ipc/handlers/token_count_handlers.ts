import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { and, eq } from "drizzle-orm";
import {
  constructSystemPrompt,
  readAiRules,
} from "../../prompts/system_prompt";
import { getThemePromptById } from "../utils/theme_utils";
import {
  getSupabaseAvailableSystemPrompt,
  SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT,
} from "../../prompts/supabase_prompt";
import { getDyadAppPath } from "../../paths/paths";
import log from "electron-log";
import { extractCodebase } from "../../utils/codebase";
import {
  getSupabaseContext,
  getSupabaseClientCode,
} from "../../supabase_admin/supabase_context";

import { TokenCountParams, TokenCountResult } from "@/ipc/types";
import { estimateTokens, getContextWindow } from "../utils/token_utils";
import { createLoggedHandler } from "./safe_handle";
import { validateChatContext } from "../utils/context_paths_utils";
import { readSettings } from "@/main/settings";
import { extractMentionedAppsCodebases } from "../utils/mention_apps";
import { parseAppMentions } from "@/shared/parse_mention_apps";



const logger = log.scope("token_count_handlers");

const handle = createLoggedHandler(logger);

export function registerTokenCountHandlers() {
  handle(
    "chat:count-tokens",
    async (event, req: TokenCountParams, context): Promise<TokenCountResult> => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const chat = await db.query.chats.findFirst({
        where: and(eq(remoteSchema.chats.id, req.chatId), eq(remoteSchema.chats.userId, context.userId)),
        with: {
          messages: {
            orderBy: (messages, { asc }) => [asc(messages.createdAt)],
          },
          app: true,
        },
      });

      if (!chat) {
        throw new Error(`Chat not found: ${req.chatId}`);
      }

      // Prepare message history for token counting
      const messageHistory = chat.messages
        .map((message) => message.content)
        .join("");
      const messageHistoryTokens = estimateTokens(messageHistory);

      // Count input tokens
      const inputTokens = estimateTokens(req.input);

      const settings = readSettings();

      // Parse app mentions from the input
      const mentionedAppNames = parseAppMentions(req.input);

      // Count system prompt tokens
      const themePrompt = await getThemePromptById(chat.app?.themeId ?? null);
      const selectedMode = (req.chatMode || settings.selectedChatMode || "build") as any;

      let systemPrompt = constructSystemPrompt({
        aiRules: await readAiRules(getDyadAppPath(chat.app.path)),
        chatMode: selectedMode,
        themePrompt,
        chatLanguage: settings.chatLanguage || "es",
        settings,
      });
      let supabaseContext = "";

      if (chat.app?.supabaseProjectId) {
        const supabaseClientCode = await getSupabaseClientCode({
          projectId: chat.app.supabaseProjectId,
          organizationSlug: chat.app.supabaseOrganizationSlug ?? null,
        });
        systemPrompt +=
          "\n\n" + getSupabaseAvailableSystemPrompt(supabaseClientCode);
        supabaseContext = await getSupabaseContext({
          supabaseProjectId: chat.app.supabaseProjectId,
          organizationSlug: chat.app.supabaseOrganizationSlug ?? null,
        });
      } else if (
        // Neon projects don't need Supabase.
        !chat.app?.neonProjectId
      ) {
        systemPrompt += "\n\n" + SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT;
      }

      const systemPromptTokens = estimateTokens(systemPrompt + supabaseContext);

      // Extract codebase information if app is associated with the chat
      let codebaseInfo = "";
      let codebaseTokens = 0;

      if (chat.app) {
        const appPath = getDyadAppPath(chat.app.path);

        if (selectedMode === "local-agent") {
          // Agent mode starts with no file context (uses tools to explore)
          codebaseTokens = 200;
        } else {
          // Standard extraction for build mode and others
          const { formattedOutput, files } = await extractCodebase({
            appPath,
            chatContext: validateChatContext(chat.app.chatContext),
          });
          codebaseInfo = formattedOutput;
          if (
            settings.enableDyadPro &&
            settings.enableProSmartFilesContextMode
          ) {
            codebaseTokens = estimateTokens(
              files
                // It doesn't need to be the exact format but it's just to get a token estimate
                .map(
                  (file) =>
                    `<dyad-file=${file.path}>${file.content}</dyad-file>`,
                )
                .join("\n\n"),
            );
          } else {
            codebaseTokens = estimateTokens(codebaseInfo);
          }
        }

        logger.log(
          `Extracted codebase information estimate from ${appPath}, tokens: ${codebaseTokens}`,
        );
      }

      // Extract codebases for mentioned apps
      const mentionedAppsCodebases = await extractMentionedAppsCodebases(
        mentionedAppNames,
        chat.app?.id, // Exclude current app
      );

      // Calculate tokens for mentioned apps
      let mentionedAppsTokens = 0;
      if (mentionedAppsCodebases.length > 0) {
        const mentionedAppsContent = mentionedAppsCodebases
          .map(
            ({ appName, codebaseInfo }) =>
              `\n\n=== Referenced App: ${appName} ===\n${codebaseInfo}`,
          )
          .join("");

        mentionedAppsTokens = estimateTokens(mentionedAppsContent);

        logger.log(
          `Extracted ${mentionedAppsCodebases.length} mentioned app codebases, tokens: ${mentionedAppsTokens}`,
        );
      }

      // Calculate total tokens
      const totalTokens =
        messageHistoryTokens +
        inputTokens +
        systemPromptTokens +
        codebaseTokens +
        mentionedAppsTokens;

      // Find the last assistant message since totalTokens is only set on assistant messages
      const lastAssistantMessage = [...chat.messages]
        .reverse()
        .find((m) => m.role === "assistant");
      const actualMaxTokens = lastAssistantMessage?.maxTokensUsed ?? null;

      return {
        estimatedTotalTokens: totalTokens,
        actualMaxTokens,
        messageHistoryTokens,
        codebaseTokens,
        mentionedAppsTokens,
        inputTokens,
        systemPromptTokens,
        contextWindow: await getContextWindow(),
      };
    },
  );
}
