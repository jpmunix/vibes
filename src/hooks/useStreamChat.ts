import { useCallback, startTransition, useRef } from "react";
import type {
  ComponentSelection,
  FileAttachment,
  ChatAttachment,
} from "@/ipc/types";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  chatErrorByIdAtom,
  chatMessagesByIdAtom,
  chatStreamCountByIdAtom,
  isStreamingByIdAtom,
  recentStreamChatIdsAtom,
  selectedChatIdAtom,
  pendingMessageQueueByIdAtom,
} from "@/atoms/chatAtoms";
import { PERSISTED_ERROR_PREFIX } from "@/shared/texts";
import { ipc } from "@/ipc/types";
import { isPreviewOpenAtom } from "@/atoms/viewAtoms";
import type { ChatResponseEnd, App } from "@/ipc/types";
import { useChats } from "./useChats";
import { useLoadApp } from "./useLoadApp";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useVersions } from "./useVersions";
import { showExtraFilesToast } from "@/lib/toast";
import { useMatch } from "@tanstack/react-router";
import { useRunApp } from "./useRunApp";
import { useCountTokens } from "./useCountTokens";
import { useUserBudgetInfo } from "./useUserBudgetInfo";
import { usePostHog } from "posthog-js/react";
import { useCheckProblems } from "./useCheckProblems";
import { useSettings } from "./useSettings";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

import type { ChatSummary } from "@/lib/schemas";

export function getRandomNumberId() {
  return Math.floor(Math.random() * 1_000_000_000_000_000);
}

// Module-level set to track chatIds with active/pending streams
// This prevents race conditions when clicking rapidly before state updates
const pendingStreamChatIds = new Set<number>();

// Helper to update Map atoms without creating new Map if value hasn't changed
function updateMapAtom<K, V>(
  setter: (fn: (prev: Map<K, V>) => Map<K, V>) => void,
  key: K,
  value: V,
) {
  setter((prev) => {
    if (prev.get(key) === value) return prev; // Skip if value unchanged
    const next = new Map(prev);
    next.set(key, value);
    return next;
  });
}


export function useStreamChat({
  hasChatId = true,
}: {
  hasChatId?: boolean;
} = {}) {
  const setMessagesById = useSetAtom(chatMessagesByIdAtom);
  const isStreamingById = useAtomValue(isStreamingByIdAtom);
  const setIsStreamingById = useSetAtom(isStreamingByIdAtom);
  const errorById = useAtomValue(chatErrorByIdAtom);
  const setErrorById = useSetAtom(chatErrorByIdAtom);
  const setIsPreviewOpen = useSetAtom(isPreviewOpenAtom);
  const [selectedAppId] = useAtom(selectedAppIdAtom);
  const { invalidateChats } = useChats(selectedAppId);
  const { refreshApp } = useLoadApp(selectedAppId);

  const setStreamCountById = useSetAtom(chatStreamCountByIdAtom);
  const { refreshVersions } = useVersions(selectedAppId);
  const { refreshAppIframe } = useRunApp();
  const { refetchUserBudget } = useUserBudgetInfo();
  const { checkProblems } = useCheckProblems(selectedAppId);
  const { settings } = useSettings();
  const setRecentStreamChatIds = useSetAtom(recentStreamChatIdsAtom);
  const setPendingMessageQueue = useSetAtom(pendingMessageQueueByIdAtom);
  const pendingMessageQueueById = useAtomValue(pendingMessageQueueByIdAtom);
  // Stable ref so onEnd can read the current queue without stale closure
  const pendingQueueRef = useRef(pendingMessageQueueById);
  pendingQueueRef.current = pendingMessageQueueById;

  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const chatRouteMatch = useMatch({ from: "/chat", strict: false, shouldThrow: false });
  let chatId: number | undefined = hasChatId && chatRouteMatch ? (chatRouteMatch as any).search?.id : undefined;

  // For atom lookups (isStreaming, error), prefer selectedChatIdAtom which is
  // always a proper number. useSearch can return a string from URL params even
  // with validateSearch, causing Map key mismatches with the atom's numeric keys.
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const lookupChatId = selectedChatId ?? chatId;

  const { invalidateTokenCount } = useCountTokens(chatId ?? null, "");

  // Stable ref so the queue drain inside onEnd can call streamMessage
  // without creating a circular dependency in the useCallback dep array.
  const streamMessageRef = useRef<typeof streamMessage | null>(null);

  const streamMessage = useCallback(
    async ({
      prompt,
      chatId,
      redo,
      attachments,
      selectedComponents,
      onSettled,
      isSystemPrompt = false,
      undoRedo,
      priorMessages,
    }: {
      prompt: string;
      chatId: number;
      redo?: boolean;
      attachments?: FileAttachment[];
      selectedComponents?: ComponentSelection[];
      onSettled?: () => void;
      isSystemPrompt?: boolean;
      undoRedo?: boolean;
      /** Pre-converted prior messages to inject into OpenCode via noReply:true */
      priorMessages?: import("@/ipc/types").ChatStreamParams["priorMessages"];
    }) => {
      // Setup listener for undo-redo content restoring
      // This needs to be outside the ipc.chatStream.start call as it's a separate event
      if (undoRedo) {
        const removeListener = window.electron.on(
          "chat:undo-redo:content",
          (_: any, data: { chatId: number; prompt: string; attachments?: any[] }) => {
            if (data.chatId === chatId) {
              const attachmentsToRestore: File[] = [];
              if (data.attachments && data.attachments.length > 0) {
                data.attachments.forEach((part: any, i: number) => {
                  try {
                    const mimeType = part.mediaType || part.mimeType || "image/png";
                    const ext = mimeType.split("/")[1] || "png";
                    let base64 = part.image;
                    if (base64.startsWith("data:")) {
                      base64 = base64.split(",")[1] || "";
                    }
                    const byteChars = atob(base64);
                    const byteArr = new Uint8Array(byteChars.length);
                    for (let j = 0; j < byteChars.length; j++) byteArr[j] = byteChars.charCodeAt(j);
                    attachmentsToRestore.push(new File([new Blob([byteArr], { type: mimeType })], `restored-${Date.now()}-${i}.${ext}`, { type: mimeType }));
                  } catch (e) {
                    console.error("Failed to restore attachment", e);
                  }
                });
              }

              window.dispatchEvent(new CustomEvent('vibes:restore-chat-input', {
                detail: { prompt: data.prompt, attachments: attachmentsToRestore }
              }));
            }
          }
        );

        // Clean up listener after a short timeout (it should happen quickly)
        setTimeout(removeListener, 5000);
      }

      if (
        (!prompt.trim() && (!attachments || attachments.length === 0) && !undoRedo) ||
        !chatId
      ) {
        return;
      }



      // Prevent duplicate streams - check module-level set to avoid race conditions
      if (pendingStreamChatIds.has(chatId)) {
        console.warn(
          `[CHAT] Ignoring duplicate stream request for chat ${chatId} - stream already in progress`,
        );
        // Call onSettled to allow callers to clean up their local loading state
        onSettled?.();
        return;
      }

      // Mark this chat as having a pending stream
      pendingStreamChatIds.add(chatId);

      setRecentStreamChatIds((prev) => {
        const next = new Set(prev);
        next.add(chatId);
        return next;
      });

      updateMapAtom(setErrorById, chatId, null);
      updateMapAtom(setIsStreamingById, chatId, true);

      // Convert FileAttachment[] (with File objects) to ChatAttachment[] (base64 encoded)
      let convertedAttachments: ChatAttachment[] | undefined;
      if (attachments && attachments.length > 0) {
        convertedAttachments = await Promise.all(
          attachments.map(
            (attachment) =>
              new Promise<ChatAttachment>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  resolve({
                    name: attachment.file.name,
                    type: attachment.file.type,
                    data: reader.result as string,
                    attachmentType: attachment.type,
                  });
                };
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(attachment.file);
              }),
          ),
        );
      }

      // Fire and forget title generation with the prompt for new chats
      (async () => {
        try {
          // Don't generate title for system prompts
          if (isSystemPrompt) {
            return;
          }

          const chat = await ipc.chat.getChat(chatId);
          if (!chat.title || chat.title.trim() === "Nuevo chat") {
            ipc.chat.generateChatTitle({ chatId, prompt }).then(() => {
              invalidateChats();
            });
          }
        } catch {
          // Ignore errors
        }
      })();

      // Optimistic UI update: instantly show the user message and a loading assistant message
      setMessagesById((prev) => {
        const next = new Map(prev);
        const currentMessages = next.get(chatId) ?? [];

        // Generate temporary negative IDs for optimistic messages
        const tempUserId = -Math.floor(Math.random() * 1000000);
        const tempAssistantId = tempUserId - 1;

        const newMessages = [...currentMessages];

        // Add prior queued messages as optimistic user bubbles first
        if (priorMessages && priorMessages.length > 0) {
          for (let i = 0; i < priorMessages.length; i++) {
            newMessages.push({
              id: tempUserId - i - 2, // unique negative IDs
              chatId,
              role: "user",
              content: priorMessages[i].prompt,
              createdAt: new Date().toISOString(),
            } as any);
          }
        }

        // Add user message if not a redo
        if (!redo && prompt.trim()) {
          newMessages.push({
            id: tempUserId,
            chatId,
            role: "user",
            content: prompt,
            createdAt: new Date().toISOString(),
          } as any);
        }

        // Add loading assistant message
        newMessages.push({
          id: tempAssistantId,
          chatId,
          role: "assistant",
          content: "", // Empty content triggers the loading animation in ChatMessage
          createdAt: new Date().toISOString(),
        } as any);

        next.set(chatId, newMessages);
        return next;
      });

      let hasIncrementedStreamCount = false;
      // RAF throttling: batch onChunk updates to max 1 per animation frame
      let pendingChunkMessages: typeof undefined | Parameters<Parameters<typeof ipc.chatStream.start>[1]["onChunk"]>[0]["messages"] = undefined;
      let chunkRafId: number | null = null;
      try {
        ipc.chatStream.start(
          {
            chatId,
            prompt,
            redo,
            attachments: convertedAttachments,
            selectedComponents: selectedComponents ?? [],
            undoRedo,
            priorMessages,
          },
          {
            onChunk: ({ messages: updatedMessages }) => {
              if (!hasIncrementedStreamCount) {
                setStreamCountById((prev) => {
                  const next = new Map(prev);
                  next.set(chatId, (prev.get(chatId) ?? 0) + 1);
                  return next;
                });
                hasIncrementedStreamCount = true;
              }

              // Batch message updates: store latest and flush once per frame
              pendingChunkMessages = updatedMessages;
              if (!chunkRafId) {
                chunkRafId = requestAnimationFrame(() => {
                  if (pendingChunkMessages) {
                    updateMapAtom(setMessagesById, chatId, pendingChunkMessages!);
                    pendingChunkMessages = undefined;
                  }
                  chunkRafId = null;
                });
              }
            },
            onEnd: (response: ChatResponseEnd) => {
              // Flush any pending RAF updates before processing end
              if (chunkRafId) {
                cancelAnimationFrame(chunkRafId);
                chunkRafId = null;
              }
              if (pendingChunkMessages) {
                updateMapAtom(setMessagesById, chatId, pendingChunkMessages);
                pendingChunkMessages = undefined;
              }

              // Remove from pending set now that stream is complete
              pendingStreamChatIds.delete(chatId);

              const notificationsEnabled =
                settings?.enableChatCompletionNotifications === true;
              const isViewingDifferentChat =
                lookupChatId !== undefined && lookupChatId !== null && lookupChatId !== chatId;
              if (
                notificationsEnabled &&
                Notification.permission === "granted" &&
                (!document.hasFocus() || isViewingDifferentChat)
              ) {
                const app = queryClient.getQueryData<App | null>(
                  queryKeys.apps.detail({ appId: selectedAppId }),
                );
                const chats = queryClient.getQueryData<ChatSummary[]>(
                  queryKeys.chats.list({ appId: selectedAppId }),
                );
                const chat = chats?.find((c) => c.id === chatId);
                const appName = app?.name ?? "Vibes";
                const rawTitle = response.chatSummary ?? chat?.title;
                const body = rawTitle
                  ? rawTitle.length > 80
                    ? rawTitle.slice(0, 80) + "…"
                    : rawTitle
                  : "Respuesta completada";
                new Notification(appName, {
                  body,
                });
              }

              // Immediately mark streaming as done (urgent — affects UI controls)
              updateMapAtom(setIsStreamingById, chatId, false);

              // Persist unread state to DB when response arrives on a chat the user isn't viewing
              if (isViewingDifferentChat) {
                ipc.chat.markChatUnread(chatId).catch(() => {});
              } else {
                setRecentStreamChatIds((prev) => {
                  if (!prev.has(chatId)) return prev;
                  const next = new Set(prev);
                  next.delete(chatId);
                  return next;
                });
              }

              // If the backend sent back the user's prompt (cancel with no content),
              // restore it to the input box so the user doesn't lose their message
              if (response.restoredPrompt) {
                window.dispatchEvent(new CustomEvent("vibes:restore-chat-input", {
                  detail: { prompt: response.restoredPrompt },
                }));
              }

              // Wrap all post-stream work in startTransition so it doesn't block input
              // These are ~10 invalidations/refreshes that would otherwise cause cascading re-renders
              startTransition(() => {
                if (response.updatedFiles) {
                  if (settings?.autoExpandPreviewPanel) {
                    setIsPreviewOpen(true);
                  }
                  refreshAppIframe();
                  checkProblems();
                }
                if (response.extraFiles) {
                  showExtraFilesToast({
                    files: response.extraFiles,
                    error: response.extraFilesError,
                    posthog,
                  });
                }
                queryClient.invalidateQueries({ queryKey: ["proposal", chatId] });
                refetchUserBudget();

                queryClient.invalidateQueries({
                  queryKey: queryKeys.proposals.detail({ chatId }),
                });
                invalidateChats();
                refreshApp();
                refreshVersions();
                invalidateTokenCount();
              });

              // Drain the pending queue using OpenCode's native `noReply: true` mechanism.
              // Only run if there are actually queued messages — reads via ref to avoid
              // stale closure and to not add the queue to useCallback deps.
              const currentQueue = pendingQueueRef.current.get(chatId);
              if (currentQueue && currentQueue.length > 0) {
                setPendingMessageQueue((prev) => {
                  const queue = prev.get(chatId);
                  if (!queue || queue.length === 0) return prev;
                  const nextMap = new Map(prev);
                  nextMap.set(chatId, []); // Clear queue

                  setTimeout(async () => {
                    const priorMessages = queue.slice(0, -1);
                    const lastMsg = queue[queue.length - 1];

                    // Convert FileAttachment[] → ChatAttachment[] (base64 data URLs) for IPC
                    const toAttachment = (a: NonNullable<import("@/atoms/chatAtoms").PendingQueuedMessage["attachments"]>[number]) =>
                      new Promise<import("@/ipc/types").ChatAttachment>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () =>
                          resolve({ name: a.file.name, type: a.file.type, data: reader.result as string, attachmentType: a.type });
                        reader.onerror = () => reject(reader.error);
                        reader.readAsDataURL(a.file);
                      });

                    const convertedPrior = await Promise.all(
                      priorMessages.map(async (m) => ({
                        prompt: m.prompt,
                        attachments: m.attachments?.length
                          ? await Promise.all(m.attachments.map(toAttachment))
                          : undefined,
                      })),
                    );

                    const lastAttachments = lastMsg.attachments?.length
                      ? await Promise.all(lastMsg.attachments.map(toAttachment))
                      : undefined;

                    streamMessageRef.current?.({
                      prompt: lastMsg.prompt,
                      chatId,
                      attachments: lastAttachments,
                      priorMessages: convertedPrior.length > 0 ? convertedPrior : undefined,
                    });
                  }, 0);

                  return nextMap;
                });
              }

              onSettled?.();
            },
            onError: ({ error: errorMessage }) => {
              // Cancel any pending RAF updates on error
              if (chunkRafId) {
                cancelAnimationFrame(chunkRafId);
                chunkRafId = null;
              }
              pendingChunkMessages = undefined;

              // Remove from pending set now that stream ended with error
              pendingStreamChatIds.delete(chatId);

              console.error(`[CHAT] Stream error for ${chatId}:`, errorMessage);
              updateMapAtom(setErrorById, chatId, errorMessage);

              const isViewingDifferentChat =
                lookupChatId !== undefined && lookupChatId !== null && lookupChatId !== chatId;
              if (!isViewingDifferentChat) {
                setRecentStreamChatIds((prev) => {
                  if (!prev.has(chatId)) return prev;
                  const next = new Set(prev);
                  next.delete(chatId);
                  return next;
                });
              }

              // Persist error text into the optimistic assistant message
              // so it survives reloads via the DB save on the backend
              setMessagesById((prev) => {
                const msgs = prev.get(chatId);
                if (!msgs) return prev;
                const updated = [...msgs];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant" && (!last.content || !last.content.trim())) {
                  updated[updated.length - 1] = { ...last, content: `${PERSISTED_ERROR_PREFIX}${errorMessage}` };
                }
                const next = new Map(prev);
                next.set(chatId, updated);
                return next;
              });




              // Keep the same as above
              updateMapAtom(setIsStreamingById, chatId, false);
              // On error, drop the pending queue for this chat (don't keep trying)
              setPendingMessageQueue((prev) => {
                const queue = prev.get(chatId);
                if (!queue || queue.length === 0) return prev;
                const next = new Map(prev);
                next.set(chatId, []);
                return next;
              });
              invalidateChats();
              refreshApp();
              refreshVersions();
              invalidateTokenCount();
              onSettled?.();
            },
          },
        );
      } catch (error) {
        // Remove from pending set on exception
        pendingStreamChatIds.delete(chatId);

        console.error("[CHAT] Exception during streaming setup:", error);
        if (chatId) {
          updateMapAtom(setIsStreamingById, chatId, false);
          updateMapAtom(
            setErrorById,
            chatId,
            error instanceof Error ? error.message : String(error),
          );
        }
        onSettled?.();
      }
    },
    [
      setMessagesById,
      setIsStreamingById,
      setIsPreviewOpen,
      checkProblems,
      selectedAppId,
      refetchUserBudget,
      settings,
      queryClient,
      setPendingMessageQueue,
    ],
  );

  // Keep the ref in sync with the latest streamMessage callback
  streamMessageRef.current = streamMessage;

  return {
    streamMessage,
    isStreaming:
      hasChatId && lookupChatId !== undefined && lookupChatId !== null
        ? (isStreamingById.get(lookupChatId) ?? false)
        : false,
    error:
      hasChatId && lookupChatId !== undefined && lookupChatId !== null
        ? (errorById.get(lookupChatId) ?? null)
        : null,
    setError: (value: string | null) =>
      setErrorById((prev) => {
        const next = new Map(prev);
        if (lookupChatId !== undefined && lookupChatId !== null) next.set(lookupChatId, value);
        return next;
      }),
    setIsStreaming: (value: boolean) =>
      setIsStreamingById((prev) => {
        const next = new Map(prev);
        if (lookupChatId !== undefined && lookupChatId !== null) next.set(lookupChatId, value);
        return next;
      }),
  };
}
