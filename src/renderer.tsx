import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./router";
import { RouterProvider } from "@tanstack/react-router";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  MutationCache,
} from "@tanstack/react-query";
import { showError } from "./lib/toast";
import { ipc } from "./ipc/types";
import { useSetAtom } from "jotai";
import {
  pendingAgentConsentsAtom,
  pendingAskUsersAtom,
  pendingOpenCodePermissionsAtom,
  agentTodosByChatIdAtom,
  autoRouterModelInfoByChatIdAtom,
  isSelectingModelByIdAtom,
} from "./atoms/chatAtoms";
import { queryKeys } from "./lib/queryKeys";
import { useUpdateChecker } from "./hooks/useUpdateChecker";
import { UpdateAvailableDialog } from "./components/UpdateAvailableDialog";
import { ChatWindowSkeleton, MainWindowSkeleton } from "./components/skeletons";
import { AuthGate } from "./components/AuthGate";

// @ts-ignore
console.log("Running in mode:", import.meta.env.MODE);

interface MyMeta extends Record<string, unknown> {
  showErrorToast: boolean;
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: MyMeta;
    mutationMeta: MyMeta;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.showErrorToast) {
        showError(error);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.showErrorToast) {
        showError(error);
      }
    },
  }),
});

// Telemetry removed

function App() {
  // Telemetry navigation capture removed

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
    });
    return () => unsubscribe();
  }, [setPendingAgentConsents, setPendingAskUsers, setPendingOCPermissions, setAgentTodosByChatId]);

  // Telemetry events removed
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

  // Agent problems updates - update the TanStack Query cache when the agent runs type checks
  useEffect(() => {
    const unsubscribe = ipc.events.agent.onProblemsUpdate((payload) => {
      queryClient.setQueryData(
        queryKeys.problems.byApp({ appId: payload.appId }),
        payload.problems,
      );
    });
    return () => unsubscribe();
  }, []);

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

// Skeleton components (ChatWindowSkeleton, MainWindowSkeleton) are imported
// from ./components/skeletons.tsx — shared with AuthGate for visual continuity.

// Check if this is a pop-out database window
const urlParams = new URLSearchParams(window.location.search);
const windowType = urlParams.get("window");
const appIdStr = urlParams.get("appId");
const chatIdStr = urlParams.get("chatId");
const messageIdStr = urlParams.get("messageId");
const hasPendingPrompt = urlParams.get("hasPendingPrompt") === "true";
const chatModeParam = urlParams.get("chatMode");
const themeParam = urlParams.get("theme");
const intensityParam = urlParams.get("intensity");

if (windowType === "database" && appIdStr) {
  // Lazy import to avoid loading full app dependencies
  import("./components/database/DatabaseWindowApp").then(
    ({ DatabaseWindowApp }) => {
      createRoot(document.getElementById("root")!).render(
        <StrictMode>
          <DatabaseWindowApp appId={Number(appIdStr)} />
        </StrictMode>,
      );
    },
  );
} else if (windowType === "git" && appIdStr) {
  // Sync theme from parent window via URL params
  if (themeParam) {
    localStorage.setItem("theme", themeParam);
  }
  if (intensityParam) {
    localStorage.setItem("theme-intensity", intensityParam);
    document.documentElement.style.setProperty("--theme-intensity", intensityParam);
  }

  // Lazy import — Git module only loads when this window type is opened
  const commitHashParam = urlParams.get("commitHash") || undefined;
  import("./components/git_window/GitWindowApp").then(
    ({ GitWindowApp }) => {
      createRoot(document.getElementById("root")!).render(
        <StrictMode>
          <GitWindowApp
            appId={Number(appIdStr)}
            commitHash={commitHashParam}
          />
        </StrictMode>,
      );
    },
  );
} else if (windowType === "chat" && appIdStr) {
  // P18 — Sync theme from parent window via URL params
  if (themeParam) {
    localStorage.setItem("theme", themeParam);
  }
  if (intensityParam) {
    localStorage.setItem("theme-intensity", intensityParam);
    // Apply intensity immediately to CSS variable so it's ready for skeleton
    document.documentElement.style.setProperty("--theme-intensity", intensityParam);
  }

  // P18 — Show skeleton loader immediately while JS loads
  const root = createRoot(document.getElementById("root")!);
  root.render(<ChatWindowSkeleton />);


  import("./components/chat_window/ChatWindowApp").then(
    ({ ChatWindowApp }) => {
      root.render(
        <StrictMode>
          <ChatWindowApp
            appId={Number(appIdStr)}
            chatId={chatIdStr ? Number(chatIdStr) : undefined}
            hasPendingPrompt={hasPendingPrompt}
            initialChatMode={chatModeParam || undefined}
          />
        </StrictMode>,
      );
    },
  ).catch((err) => {
    console.error("Failed to load ChatWindowApp:", err);
    // Replace skeleton with error UI so the animation stops consuming resources
    root.render(
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100%",
        background: "var(--background, #1a1a1a)",
        color: "var(--foreground, #e5e5e5)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        gap: "16px",
        padding: "24px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: "24px" }}>⚠️</div>
        <p style={{ fontSize: "14px", opacity: 0.8 }}>
          Error al cargar la ventana de chat
        </p>
        <p style={{ fontSize: "12px", opacity: 0.5, maxWidth: "400px" }}>
          {String(err?.message || err)}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 20px",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.1)",
            color: "inherit",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          Reintentar
        </button>
      </div>,
    );
  });
} else if (windowType === "code" && appIdStr) {
  // Sync theme from parent window via URL params
  if (themeParam) {
    localStorage.setItem("theme", themeParam);
  }
  if (intensityParam) {
    localStorage.setItem("theme-intensity", intensityParam);
    document.documentElement.style.setProperty("--theme-intensity", intensityParam);
  }

  // Lazy import — Code module only loads when this window type is opened
  import("./components/code_window/CodeWindowApp").then(
    ({ CodeWindowApp }) => {
      createRoot(document.getElementById("root")!).render(
        <StrictMode>
          <CodeWindowApp appId={Number(appIdStr)} />
        </StrictMode>,
      );
    },
  );
} else if (windowType === "console" && appIdStr) {
  // Sync theme from parent window via URL params
  if (themeParam) {
    localStorage.setItem("theme", themeParam);
  }
  if (intensityParam) {
    localStorage.setItem("theme-intensity", intensityParam);
    document.documentElement.style.setProperty("--theme-intensity", intensityParam);
  }

  // Lazy import — Console module only loads when this window type is opened
  import("./components/console_window/ConsoleWindowApp").then(
    ({ ConsoleWindowApp }) => {
      createRoot(document.getElementById("root")!).render(
        <StrictMode>
          <ConsoleWindowApp appId={Number(appIdStr)} />
        </StrictMode>,
      );
    },
  );
} else if (windowType === "message" && appIdStr && chatIdStr && messageIdStr) {
  // Sync theme from parent window via URL params
  if (themeParam) {
    localStorage.setItem("theme", themeParam);
  }
  if (intensityParam) {
    localStorage.setItem("theme-intensity", intensityParam);
    document.documentElement.style.setProperty("--theme-intensity", intensityParam);
  }

  import("./components/message_window/MessageWindowApp").then(
    ({ MessageWindowApp }) => {
      createRoot(document.getElementById("root")!).render(
        <StrictMode>
          <MessageWindowApp 
            appId={Number(appIdStr)} 
            chatId={Number(chatIdStr)} 
            messageId={Number(messageIdStr)} 
          />
        </StrictMode>,
      );
    },
  );
} else if (windowType === "memory" && appIdStr) {
  // Sync theme from parent window via URL params
  if (themeParam) {
    localStorage.setItem("theme", themeParam);
  }
  if (intensityParam) {
    localStorage.setItem("theme-intensity", intensityParam);
    document.documentElement.style.setProperty("--theme-intensity", intensityParam);
  }

  // Lazy import — Memory module only loads when this window type is opened
  import("./components/memory_window/MemoryWindowApp").then(
    ({ MemoryWindowApp }) => {
      createRoot(document.getElementById("root")!).render(
        <StrictMode>
          <MemoryWindowApp appId={Number(appIdStr)} />
        </StrictMode>,
      );
    },
  );
} else if (windowType === "playground") {
  // Sync theme from parent window via URL params
  if (themeParam) {
    localStorage.setItem("theme", themeParam);
  }
  if (intensityParam) {
    localStorage.setItem("theme-intensity", intensityParam);
    document.documentElement.style.setProperty("--theme-intensity", intensityParam);
  }

  // Lazy import — Playground module only loads when this window type is opened
  import("./components/playground_window/PlaygroundWindowApp").then(
    ({ PlaygroundWindowApp }) => {
      createRoot(document.getElementById("root")!).render(
        <StrictMode>
          <PlaygroundWindowApp />
        </StrictMode>,
      );
    },
  );
} else if (windowType === "admin") {
  // Sync theme from parent window via URL params
  if (themeParam) {
    localStorage.setItem("theme", themeParam);
  }
  if (intensityParam) {
    localStorage.setItem("theme-intensity", intensityParam);
    document.documentElement.style.setProperty("--theme-intensity", intensityParam);
  }

  // Lazy import — Admin module only loads when this window type is opened
  import("./components/admin_window/AdminWindowApp").then(
    ({ AdminWindowApp }) => {
      createRoot(document.getElementById("root")!).render(
        <StrictMode>
          <AdminWindowApp />
        </StrictMode>,
      );
    },
  );
} else {
  // Main window — AuthGate is imported eagerly (top-level) since it's always
  // needed here. Show skeleton immediately, then render the real app.
  const root = createRoot(document.getElementById("root")!);
  root.render(<MainWindowSkeleton />);

  // Render immediately — no lazy import needed for the main window path.
  // AuthGate handles its own loading state with the skeleton.
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <App />
        </AuthGate>
      </QueryClientProvider>
    </StrictMode>,
  );
}
