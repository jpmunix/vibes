import { StrictMode, useEffect } from "react";
import { router } from "./router";
import { RouterProvider } from "@tanstack/react-router";
import { ipc } from "./ipc/types";
import { useSetAtom, useAtomValue } from "jotai";
import {
  pendingAgentConsentsAtom,
  pendingAskUsersAtom,
  pendingOpenCodePermissionsAtom,
  agentTodosByChatIdAtom,
  autoRouterModelInfoByChatIdAtom,
  isSelectingModelByIdAtom,
  quotedMessagesAtom,
} from "./atoms/chatAtoms";
import { selectedAppIdAtom } from "./atoms/appAtoms";
import { queryKeys } from "./lib/queryKeys";
import { useUpdateChecker } from "./hooks/useUpdateChecker";
import { UpdateAvailableDialog } from "./components/UpdateAvailableDialog";
import { useQueryClient } from "@tanstack/react-query";

export default function AppRoot() {
  const queryClient = useQueryClient();

  // Agent v2 tool consent requests - queue consents instead of overwriting
  const setPendingAgentConsents = useSetAtom(pendingAgentConsentsAtom);
  const setPendingAskUsers = useSetAtom(pendingAskUsersAtom);
  const setPendingOCPermissions = useSetAtom(pendingOpenCodePermissionsAtom);
  const setAgentTodosByChatId = useSetAtom(agentTodosByChatIdAtom);
  const setAutoRouterModelInfo = useSetAtom(autoRouterModelInfoByChatIdAtom);
  const setIsSelectingModelById = useSetAtom(isSelectingModelByIdAtom);

  // Auto-router model selection start
  useEffect(() => {
    // @ts-ignore - using raw preload API for custom event
    const unsubscribe = window.electron?.ipcRenderer?.on?.(
      "chat:model:selecting",
      (payload: any) => {
        setIsSelectingModelById((prev) => {
          const next = new Map(prev);
          next.set(payload.chatId, true);
          return next;
        });
      },
    );
    return () => unsubscribe?.();
  }, [setIsSelectingModelById]);

  // Auto-router model selection complete
  useEffect(() => {
    // @ts-ignore - using raw preload API for custom event
    const unsubscribe = window.electron?.ipcRenderer?.on?.(
      "chat:model:selected",
      (payload: any) => {
        setAutoRouterModelInfo((prev) => {
          const next = new Map(prev);
          next.set(payload.chatId, {
            model: payload.model,
            complexity: payload.complexity,
            taskType: payload.taskType,
            reasoning: payload.reasoning,
          });
          return next;
        });
        // Clear selecting state
        setIsSelectingModelById((prev) => {
          const next = new Map(prev);
          next.set(payload.chatId, false);
          return next;
        });
      },
    );
    return () => unsubscribe?.();
  }, [setAutoRouterModelInfo, setIsSelectingModelById]);

  // Agent todos updates
  useEffect(() => {
    const unsubscribe = ipc.events.agent.onTodosUpdate((payload) => {
      setAgentTodosByChatId((prev) => {
        const next = new Map(prev);
        next.set(payload.chatId, payload.todos);
        return next;
      });
    });
    return () => unsubscribe();
  }, [setAgentTodosByChatId]);

  // Clear todos when a new stream starts (so previous turn's todos don't persist)
  useEffect(() => {
    const unsubscribe = ipc.events.misc.onChatStreamStart(({ chatId }) => {
      setAgentTodosByChatId((prev) => {
        const next = new Map(prev);
        next.delete(chatId);
        return next;
      });
      // Also clear auto-router model info when a new stream starts
      setAutoRouterModelInfo((prev) => {
        const next = new Map(prev);
        next.delete(chatId);
        return next;
      });
      // Clear selecting state as well
      setIsSelectingModelById((prev) => {
        const next = new Map(prev);
        next.delete(chatId);
        return next;
      });
    });
    return () => unsubscribe();
  }, [setAgentTodosByChatId, setAutoRouterModelInfo, setIsSelectingModelById]);

  useEffect(() => {
    const unsubscribe = ipc.events.agent.onConsentRequest((payload) => {
      setPendingAgentConsents((prev) => [
        ...prev,
        {
          requestId: payload.requestId,
          chatId: payload.chatId,
          toolName: payload.toolName,
          toolDescription: payload.toolDescription,
          inputPreview: payload.inputPreview,
        },
      ]);
    });
    return () => unsubscribe();
  }, [setPendingAgentConsents]);

  // Agent ask_user requests
  useEffect(() => {
    const unsubscribe = ipc.events.agent.onAskUserRequest((payload) => {
      setPendingAskUsers((prev) => {
        // Deduplicate: skip if this requestId or an identical question for the same chat already exists
        if (prev.some((p) => p.requestId === payload.requestId)) return prev;
        // Replace any existing entry for the same question+chatId (OpenCode fires duplicates with different IDs)
        const filtered = prev.filter(
          (p) => !(p.chatId === payload.chatId && p.question === payload.question),
        );
        return [
          ...filtered,
          {
            requestId: payload.requestId,
            chatId: payload.chatId,
            question: payload.question,
            options: payload.options,
            context: payload.context,
            multiple: payload.multiple,
          },
        ];
      });
    });
    return () => unsubscribe();
  }, [setPendingAskUsers]);

  // OpenCode permission requests
  useEffect(() => {
    const unsubscribe = ipc.events.agent.onPermissionRequest((payload) => {
      setPendingOCPermissions((prev) => {
        if (prev.some((p) => p.requestId === payload.requestId)) return prev;
        return [
          ...prev,
          {
            requestId: payload.requestId,
            sessionId: payload.sessionId,
            chatId: payload.chatId,
            toolName: payload.toolName,
            toolInput: payload.toolInput,
          },
        ];
      });
    });
    return () => unsubscribe();
  }, [setPendingOCPermissions]);

  // Clear pending agent consents and finalize in-progress todos when a chat stream ends
  useEffect(() => {
    const unsubscribe = ipc.events.misc.onChatStreamEnd(({ chatId }) => {
      setPendingAgentConsents((prev) =>
        prev.filter((consent) => consent.chatId !== chatId),
      );
      setPendingAskUsers((prev) =>
        prev.filter((ask) => ask.chatId !== chatId),
      );
      setPendingOCPermissions((prev) =>
        prev.filter((p) => p.chatId !== chatId),
      );
      // Finalize any in_progress todos to completed (safety net for when
      // the model doesn't return the correct schema to close out its todos)
      setAgentTodosByChatId((prev) => {
        const todos = prev.get(chatId);
        if (!todos) return prev;
        const hasInProgress = todos.some((t) => t.status === "in_progress");
        if (!hasInProgress) return prev;
        const next = new Map(prev);
        next.set(
          chatId,
          todos.map((t) =>
            t.status === "in_progress" ? { ...t, status: "completed" as const } : t,
          ),
        );
        return next;
      });
      // Invalidate chats queries to update sidebar unread dot
      queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
      queryClient.invalidateQueries({ queryKey: ["pinned-chats"] });
    });
    return () => unsubscribe();
  }, [
    setPendingAgentConsents,
    setPendingAskUsers,
    setPendingOCPermissions,
    setAgentTodosByChatId,
    queryClient,
  ]);

  // Cross-window navigation: when a secondary window (chat, etc.) requests
  // navigation, the main process sends us this event so we navigate the router.
  useEffect(() => {
    // @ts-ignore — using raw preload API for custom event
    const unsubscribe = window.electron?.ipcRenderer?.on?.(
      "navigate-to-route",
      (payload: { route: string; search?: Record<string, any> }) => {
        router.navigate({ to: payload.route as any, search: payload.search as any });
      },
    );
    return () => unsubscribe?.();
  }, []);

  // Cross-window console log: when a console window sends a log to chat,
  // the main process routes it here as a quote card (not raw text).
  const setQuotedForConsole = useSetAtom(quotedMessagesAtom);
  const currentAppIdForConsole = useAtomValue(selectedAppIdAtom);
  useEffect(() => {
    // @ts-ignore — using raw preload API for custom event
    const unsubscribe = window.electron?.ipcRenderer?.on?.(
      "console-log-to-chat",
      (payload: { appId: number; formattedLog: string }) => {
        if (payload.appId === currentAppIdForConsole) {
          setQuotedForConsole((prev) => {
            // Use timestamp as unique id to avoid duplicates
            const id = Date.now();
            return [...prev, { id, role: "console" as const, content: payload.formattedLog }];
          });
        }
      },
    );
    return () => unsubscribe?.();
  }, [currentAppIdForConsole, setQuotedForConsole]);

  // Agent problems updates - update the TanStack Query cache when the agent runs type checks
  useEffect(() => {
    const unsubscribe = ipc.events.agent.onProblemsUpdate((payload) => {
      queryClient.setQueryData(
        queryKeys.problems.byApp({ appId: payload.appId }),
        payload.problems,
      );
    });
    return () => unsubscribe();
  }, [queryClient]);

  // Update checker — shows a dialog when a new version is available
  const { updateVersion, isOpen: isUpdateOpen, dismiss: dismissUpdate, download: downloadUpdate } = useUpdateChecker();

  return (
    <>
      <RouterProvider router={router} />
      <UpdateAvailableDialog
        updateVersion={updateVersion}
        isOpen={isUpdateOpen}
        onDismiss={dismissUpdate}
        onDownload={downloadUpdate}
      />
    </>
  );
}
