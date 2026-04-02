import { type IpcMainInvokeEvent } from "electron";
import type {
  CodeProposal,
  ProposalResult,
  ActionProposal,
} from "../../lib/schemas";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { desc, eq, and } from "drizzle-orm";
import path from "node:path"; // Import path for basename
// Import tag parsers
import { processFullResponseActions } from "../processors/response_processor";
import {
  getWriteTags,
  getRenameTags,
  getDeleteTags,
  getExecuteSqlTags,
  getAddDependencyTags,
  getChatSummaryTag,
  getCommandTags,
  getSearchReplaceTags,
} from "../utils/tag_parser";
import log from "electron-log";
import { isServerFunction } from "../../supabase_admin/supabase_utils";
import { withLock } from "../utils/lock_utils";
import { createTypedHandler } from "./base";
import { proposalContracts } from "../types/proposals";
import { ApproveProposalResult } from "@/ipc/types";
import { readSettings } from "@/main/settings";

const logger = log.scope("proposal_handlers");

const getProposalHandler = async (
  _event: IpcMainInvokeEvent,
  { chatId }: { chatId: number },
  context: any,
): Promise<ProposalResult | null> => {
  if (!context?.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  return withLock("get-proposal:" + chatId, async () => {
    logger.log(`IPC: get-proposal called for chatId: ${chatId}`);

    try {
      // Find the latest ASSISTANT message for the chat
      const latestAssistantMessage = await db.query.messages.findFirst({
        where: and(eq(remoteSchema.messages.chatId, chatId), eq(remoteSchema.messages.role, "assistant"), eq(remoteSchema.messages.userId, context.userId)),
        orderBy: [desc(remoteSchema.messages.createdAt)],
        columns: {
          id: true, // Fetch the ID
          content: true, // Fetch the content to parse
          approvalState: true,
        },
      });

      if (
        latestAssistantMessage?.content &&
        latestAssistantMessage.id &&
        !latestAssistantMessage?.approvalState
      ) {
        const messageId = latestAssistantMessage.id; // Get the message ID
        logger.log(
          `Found latest assistant message (ID: ${messageId}), parsing content...`,
        );
        const messageContent = latestAssistantMessage.content;

        const proposalTitle = getChatSummaryTag(messageContent);

        const proposalWriteFiles = getWriteTags(messageContent);
        const proposalSearchReplaceFiles =
          getSearchReplaceTags(messageContent);
        const proposalRenameFiles = getRenameTags(messageContent);
        const proposalDeleteFiles = getDeleteTags(messageContent);
        const proposalExecuteSqlQueries = getExecuteSqlTags(messageContent);
        const packagesAdded = getAddDependencyTags(messageContent);

        const filesChanged = [
          ...proposalWriteFiles
            .concat(proposalSearchReplaceFiles)
            .map((tag) => ({
              name: path.basename(tag.path),
              path: tag.path,
              summary: tag.description ?? "(no change summary found)", // Generic summary
              type: "write" as const,
              isServerFunction: isServerFunction(tag.path),
            })),
          ...proposalRenameFiles.map((tag) => ({
            name: path.basename(tag.to),
            path: tag.to,
            summary: `Rename from ${tag.from} to ${tag.to}`,
            type: "rename" as const,
            isServerFunction: isServerFunction(tag.to),
          })),
          ...proposalDeleteFiles.map((tag) => ({
            name: path.basename(tag),
            path: tag,
            summary: `Delete file`,
            type: "delete" as const,
            isServerFunction: isServerFunction(tag),
          })),
        ];
        // Check if we have enough information to create a proposal
        if (
          filesChanged.length > 0 ||
          packagesAdded.length > 0 ||
          proposalExecuteSqlQueries.length > 0
        ) {
          const proposal: CodeProposal = {
            type: "code-proposal",
            // Use parsed title or a default title if summary tag is missing but write tags exist
            title: proposalTitle ?? "Proposed File Changes",
            securityRisks: [], // Keep empty
            filesChanged,
            packagesAdded,
            sqlQueries: proposalExecuteSqlQueries.map((query) => ({
              content: query.content,
              description: query.description,
            })),
          };
          logger.log(
            "Generated code proposal. title=",
            proposal.title,
            "files=",
            proposal.filesChanged.length,
            "packages=",
            proposal.packagesAdded.length,
          );

          return {
            proposal: proposal,
            chatId,
            messageId,
          };
        } else {
          logger.log(
            "No relevant tags found in the latest assistant message content.",
          );
        }
      }
      const actions: ActionProposal["actions"] = [];
      if (latestAssistantMessage?.content) {
        const writeTags = getWriteTags(latestAssistantMessage.content);
        const refactorTarget = writeTags.reduce(
          (largest, tag) => {
            const lineCount = tag.content.split("\n").length;
            return lineCount > 500 &&
              (!largest || lineCount > largest.lineCount)
              ? { path: tag.path, lineCount }
              : largest;
          },
          null as { path: string; lineCount: number } | null,
        );
        if (refactorTarget) {
          actions.push({
            id: "refactor-file",
            path: refactorTarget.path,
          });
        }
        if (
          writeTags.length === 0 &&
          latestAssistantMessage.content.includes("```")
        ) {
          actions.push({
            id: "write-code-properly",
          });
        }

        // Check for command tags and add corresponding actions
        const commandTags = getCommandTags(latestAssistantMessage.content);
        if (commandTags.includes("rebuild")) {
          actions.push({
            id: "rebuild",
          });
        }
        if (commandTags.includes("restart")) {
          actions.push({
            id: "restart",
          });
        }
        if (commandTags.includes("refresh")) {
          actions.push({
            id: "refresh",
          });
        }
      }

      // Token-based summarize suggestion removed — the action-proposal UI
      // was already disabled (returns null). Keeping only the simple
      // keep-going and action buttons.
      if (latestAssistantMessage) {
        actions.push({
          id: "keep-going",
        });
        return {
          proposal: {
            type: "action-proposal",
            actions: actions,
          },
          chatId,
          messageId: latestAssistantMessage.id,
        };
      }
      return null;
    } catch (error) {
      logger.error(`Error processing proposal for chatId ${chatId}:`, error);
      return null; // Indicate DB or processing error
    }
  });
};

// Handler to approve a proposal (process actions and update message)
const approveProposalHandler = async (
  _event: IpcMainInvokeEvent,
  { chatId, messageId }: { chatId: number; messageId: number },
  context: any,
): Promise<ApproveProposalResult> => {
  if (!context?.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  const settings = readSettings();
  if (settings.selectedChatMode === "ask") {
    throw new Error(
      "Ask mode is not supported for proposal approval. Please switch to build mode.",
    );
  }
  // 1. Fetch the specific assistant message
  const messageToApprove = await db.query.messages.findFirst({
    where: and(
      eq(remoteSchema.messages.id, messageId),
      eq(remoteSchema.messages.chatId, chatId),
      eq(remoteSchema.messages.role, "assistant"),
      eq(remoteSchema.messages.userId, context.userId),
    ),
    columns: {
      content: true,
    },
  });

  if (!messageToApprove?.content) {
    throw new Error(
      `Assistant message not found for chatId: ${chatId}, messageId: ${messageId}`,
    );
  }

  // 2. Process the actions defined in the message content
  const chatSummary = getChatSummaryTag(messageToApprove.content);
  const processResult = await processFullResponseActions(
    messageToApprove.content,
    chatId,
    {
      chatSummary: chatSummary ?? undefined,
      messageId,
    }, // Pass summary if found
  );

  if (processResult.error) {
    throw new Error(
      `Error processing actions for message ${messageId}: ${processResult.error}`,
    );
  }

  return {
    success: true,
    extraFiles: processResult.extraFiles,
    extraFilesError: processResult.extraFilesError,
  };
};

// Handler to reject a proposal (just update message state)
const rejectProposalHandler = async (
  _event: IpcMainInvokeEvent,
  { chatId, messageId }: { chatId: number; messageId: number },
  context: any,
): Promise<void> => {
  if (!context?.userId) throw new Error("Unauthorized");
  const db = getRemoteDb();
  logger.log(
    `IPC: reject-proposal called for chatId: ${chatId}, messageId: ${messageId}`,
  );

  // 1. Verify the message exists and is an assistant message
  const messageToReject = await db.query.messages.findFirst({
    where: and(
      eq(remoteSchema.messages.id, messageId),
      eq(remoteSchema.messages.chatId, chatId),
      eq(remoteSchema.messages.role, "assistant"),
      eq(remoteSchema.messages.userId, context.userId),
    ),
    columns: { id: true },
  });

  if (!messageToReject) {
    throw new Error(
      `Assistant message not found for chatId: ${chatId}, messageId: ${messageId}`,
    );
  }

  // 2. Update the message's approval state to 'rejected'
  await db
    .update(remoteSchema.messages)
    .set({ approvalState: "rejected" })
    .where(and(eq(remoteSchema.messages.id, messageId), eq(remoteSchema.messages.userId, context.userId)));

  logger.log(`Message ${messageId} marked as rejected.`);
};

// Function to register proposal-related handlers
export function registerProposalHandlers() {
  createTypedHandler(proposalContracts.getProposal, getProposalHandler);
  createTypedHandler(proposalContracts.approveProposal, approveProposalHandler);
  createTypedHandler(proposalContracts.rejectProposal, rejectProposalHandler);
}
