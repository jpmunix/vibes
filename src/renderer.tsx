import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./router";
import { RouterProvider } from "@tanstack/react-router";
import { PostHogProvider } from "posthog-js/react";
import posthog from "posthog-js";
import { getTelemetryUserId, isTelemetryOptedIn } from "./hooks/useSettings";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  MutationCache,
} from "@tanstack/react-query";
import { showError, showMcpConsentToast } from "./lib/toast";
import { ipc } from "./ipc/types";
import { useSetAtom } from "jotai";
import {
  pendingAgentConsentsAtom,
  agentTodosByChatIdAtom,
  autoRouterModelInfoByChatIdAtom,
  isSelectingModelByIdAtom,
} from "./atoms/chatAtoms";
import { queryKeys } from "./lib/queryKeys";

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

const posthogClient = posthog.init(
  "phc_5Vxx0XT8Ug3eWROhP6mm4D6D2DgIIKT232q4AKxC2ab",
  {
    api_host: "https://us.i.posthog.com",
    // @ts-ignore
    debug: import.meta.env.MODE === "development",
    autocapture: false,
    capture_exceptions: true,
    capture_pageview: false,
    before_send: (event) => {
      if (!isTelemetryOptedIn()) {
        console.debug("Telemetry not opted in, skipping event");
        return null;
      }
      const telemetryUserId = getTelemetryUserId();
      if (telemetryUserId) {
        posthogClient.identify(telemetryUserId);
      }

      if (event?.properties["$ip"]) {
        event.properties["$ip"] = null;
      }

      console.debug(
        "Telemetry opted in - UUID:",
        telemetryUserId,
        "sending event",
        event,
      );
      return event;
    },
    persistence: "localStorage",
  },
);

function App() {
  useEffect(() => {
    // Subscribe to navigation state changes
    const unsubscribe = router.subscribe("onResolved", (navigation) => {
      // Capture the navigation event in PostHog
      posthog.capture("navigation", {
        toPath: navigation.toLocation.pathname,
        fromPath: navigation.fromLocation?.pathname,
      });

      // Optionally capture as a standard pageview as well
      posthog.capture("$pageview", {
        path: navigation.toLocation.pathname,
      });
    });

    // Clean up subscription when component unmounts
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = ipc.events.mcp.onConsentRequest((payload) => {
      showMcpConsentToast({
        serverName: payload.serverName,
        toolName: payload.toolName,
        toolDescription: payload.toolDescription,
        inputPreview: payload.inputPreview,
        onDecision: (d) =>
          ipc.mcp.respondToConsent({
            requestId: payload.requestId,
            decision: d,
          }),
      });
    });
    return () => unsubscribe();
  }, []);

  // Agent v2 tool consent requests - queue consents instead of overwriting
  const setPendingAgentConsents = useSetAtom(pendingAgentConsentsAtom);
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

  // Clear pending agent consents and finalize in-progress todos when a chat stream ends
  useEffect(() => {
    const unsubscribe = ipc.events.misc.onChatStreamEnd(({ chatId }) => {
      setPendingAgentConsents((prev) =>
        prev.filter((consent) => consent.chatId !== chatId),
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
  }, [setPendingAgentConsents, setAgentTodosByChatId]);

  // Forward telemetry events from main process to PostHog
  useEffect(() => {
    const unsubscribe = ipc.events.system.onTelemetryEvent(
      ({ eventName, properties }) => {
        posthog.capture(eventName, properties);
      },
    );
    return () => unsubscribe();
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

  return <RouterProvider router={router} />;
}

/**
 * Lightweight skeleton shown immediately while the ChatWindowApp JS bundle loads.
 * Uses inline styles so it doesn't depend on any CSS file being loaded yet.
 * Matches the chat+preview two-panel layout to feel like the real UI is loading.
 */
function ChatWindowSkeleton() {
  const skeletonKeyframes = `
    @keyframes skeletonPulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.15; }
    }
  `;

  const pulseStyle: React.CSSProperties = {
    animation: "skeletonPulse 1.5s ease-in-out infinite",
    borderRadius: "8px",
    background: "linear-gradient(90deg, #e2e8f0 0%, #cbd5e1 50%, #e2e8f0 100%)",
  };

  // Detect dark mode
  const isDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  if (isDark) {
    pulseStyle.background = "linear-gradient(90deg, #1e293b 0%, #334155 50%, #1e293b 100%)";
  }

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100%",
      background: isDark ? "#0f172a" : "#ffffff",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <style>{skeletonKeyframes}</style>

      {/* Chat panel skeleton */}
      <div style={{ flex: "1 1 50%", display: "flex", flexDirection: "column", padding: "16px", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "8px" }}>
          <div style={{ ...pulseStyle, width: "36px", height: "36px", borderRadius: "50%" }} />
          <div style={{ ...pulseStyle, width: "140px", height: "16px" }} />
          <div style={{ marginLeft: "auto", ...pulseStyle, width: "80px", height: "28px" }} />
        </div>

        {/* Message area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px", paddingTop: "12px" }}>
          {/* User message */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ ...pulseStyle, width: "65%", height: "48px", animationDelay: "0.1s" }} />
          </div>
          {/* Assistant message */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ ...pulseStyle, width: "80%", height: "16px", animationDelay: "0.2s" }} />
            <div style={{ ...pulseStyle, width: "70%", height: "16px", animationDelay: "0.3s" }} />
            <div style={{ ...pulseStyle, width: "55%", height: "16px", animationDelay: "0.4s" }} />
          </div>
        </div>

        {/* Input area */}
        <div style={{ ...pulseStyle, width: "100%", height: "52px", animationDelay: "0.5s" }} />
      </div>

      {/* Separator */}
      <div style={{
        width: "4px",
        background: isDark ? "#1e293b" : "#e2e8f0",
        flexShrink: 0,
      }} />

      {/* Preview panel skeleton */}
      <div style={{ flex: "1 1 50%", display: "flex", flexDirection: "column", padding: "16px", gap: "12px" }}>
        {/* Preview header */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ ...pulseStyle, width: "24px", height: "24px", borderRadius: "6px", animationDelay: "0.2s" }} />
          <div style={{ ...pulseStyle, width: "24px", height: "24px", borderRadius: "6px", animationDelay: "0.3s" }} />
          <div style={{ ...pulseStyle, width: "24px", height: "24px", borderRadius: "6px", animationDelay: "0.4s" }} />
          <div style={{ flex: 1 }} />
          <div style={{ ...pulseStyle, width: "100px", height: "24px", animationDelay: "0.3s" }} />
        </div>
        {/* Preview content area */}
        <div style={{ ...pulseStyle, flex: 1, animationDelay: "0.2s" }} />
      </div>
    </div>
  );
}

// Check if this is a pop-out database window
const urlParams = new URLSearchParams(window.location.search);
const windowType = urlParams.get("window");
const appIdStr = urlParams.get("appId");
const chatIdStr = urlParams.get("chatId");
const hasPendingPrompt = urlParams.get("hasPendingPrompt") === "true";
const chatModeParam = urlParams.get("chatMode");

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
} else if (windowType === "chat" && appIdStr) {
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
  );
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <PostHogProvider client={posthogClient}>
          <App />
        </PostHogProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
