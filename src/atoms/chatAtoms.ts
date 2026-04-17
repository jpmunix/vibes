import type { FileAttachment, Message, AgentTodo } from "@/ipc/types";
import { atom } from "jotai";

// Per-chat atoms implemented with maps keyed by chatId
export const chatMessagesByIdAtom = atom<Map<number, Message[]>>(new Map());
export const chatErrorByIdAtom = atom<Map<number, string | null>>(new Map());

// Atom to hold the currently selected chat ID
export const selectedChatIdAtom = atom<number | null>(null);

export const isStreamingByIdAtom = atom<Map<number, boolean>>(new Map());
export const chatInputValueAtom = atom<string>("");
export const homeChatInputValueAtom = atom<string>("");

// Used for scrolling to the bottom of the chat messages (per chat)
export const chatStreamCountByIdAtom = atom<Map<number, number>>(new Map());
export const recentStreamChatIdsAtom = atom<Set<number>>(new Set<number>());

export const attachmentsAtom = atom<FileAttachment[]>([]);

// Quoted messages for the reply/cite feature (supports multiple)
export interface QuotedMessage {
  id: number;
  role: "user" | "assistant";
  content: string; // Plain text excerpt (already stripped)
}
export const quotedMessagesAtom = atom<QuotedMessage[]>([]);

// Agent tool consent request queue
export interface PendingAgentConsent {
  requestId: string;
  chatId: number;
  toolName: string;
  toolDescription?: string | null;
  inputPreview?: string | null;
}

export const pendingAgentConsentsAtom = atom<PendingAgentConsent[]>([]);

// Agent ask_user request queue
export interface PendingAskUser {
  requestId: string;
  chatId: number;
  question: string;
  options: string[] | null;
  context: string | null;
}

export const pendingAskUsersAtom = atom<PendingAskUser[]>([]);

// Agent todos per chat
export const agentTodosByChatIdAtom = atom<Map<number, AgentTodo[]>>(new Map());

// Auto-router model selection info per chat
export interface AutoRouterModelInfo {
  model: {
    provider: string;
    name: string;
  };
  complexity: number;
  taskType: string;
  reasoning: string;
}

export const autoRouterModelInfoByChatIdAtom = atom<
  Map<number, AutoRouterModelInfo>
>(new Map());

// Auto-router model selection loading state per chat
export const isSelectingModelByIdAtom = atom<Map<number, boolean>>(new Map());

// Chat render mode: true when "zen" mode is active (minimal DOM, no tool badges)
// Derived from userSettingsAtom for cheap reads in hot rendering paths.
import { userSettingsAtom } from "./appAtoms";
export const isZenModeAtom = atom((get) => {
  const settings = get(userSettingsAtom);
  return settings?.chatRenderMode === "zen";
});
