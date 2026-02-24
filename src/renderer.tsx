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
  pendingAskUsersAtom,
  agentTodosByChatIdAtom,
  autoRouterModelInfoByChatIdAtom,
  isSelectingModelByIdAtom,
} from "./atoms/chatAtoms";
import { queryKeys } from "./lib/queryKeys";
import { useUpdateChecker } from "./hooks/useUpdateChecker";
import { UpdateAvailableDialog } from "./components/UpdateAvailableDialog";

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
  const setPendingAskUsers = useSetAtom(pendingAskUsersAtom);
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
      setPendingAskUsers((prev) => [
        ...prev,
        {
          requestId: payload.requestId,
          chatId: payload.chatId,
          question: payload.question,
          options: payload.options,
          context: payload.context,
        },
      ]);
    });
    return () => unsubscribe();
  }, [setPendingAskUsers]);

  // Clear pending agent consents and finalize in-progress todos when a chat stream ends
  useEffect(() => {
    const unsubscribe = ipc.events.misc.onChatStreamEnd(({ chatId }) => {
      setPendingAgentConsents((prev) =>
        prev.filter((consent) => consent.chatId !== chatId),
      );
      setPendingAskUsers((prev) =>
        prev.filter((ask) => ask.chatId !== chatId),
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
  }, [setPendingAgentConsents, setPendingAskUsers, setAgentTodosByChatId]);

  // Forward telemetry events from main process to PostHog
  useEffect(() => {
    const unsubscribe = ipc.events.system.onTelemetryEvent(
      ({ eventName, properties }) => {
        posthog.capture(eventName, properties);
      },
    );
    return () => unsubscribe();
  }, []);

  // Cross-window navigation: when a secondary window (chat, etc.) requests
  // navigation, the main process sends us this event so we navigate the router.
  useEffect(() => {
    // @ts-ignore — using raw preload API for custom event
    const unsubscribe = window.electron?.ipcRenderer?.on?.(
      "navigate-to-route",
      (payload: { route: string; search?: Record<string, any> }) => {
        router.navigate({ to: payload.route as any, search: payload.search });
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

  // Detect dark mode — respect the app's localStorage theme preference first,
  // only falling back to OS prefers-color-scheme when theme is "system" or unset.
  const savedTheme = localStorage.getItem("theme"); // "light" | "dark" | "system" | null
  const systemPrefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const isDark =
    savedTheme === "dark" ||
    (savedTheme !== "light" && systemPrefersDark);

  // Read theme intensity to compute background lightness
  const savedIntensity = localStorage.getItem("theme-intensity");
  const intensity = savedIntensity ? parseFloat(savedIntensity) : 0.58;

  // Compute neutral gray based on intensity (-1=light, 0=middle, 1=dark)
  // Dark mode base lightness ~28%, Light mode base ~98.5% (from globals.css)
  let bgL: number;
  let pulseL1: number;
  let pulseL2: number;
  let sepL: number;

  if (isDark) {
    // intensity goes -1..1; offset shifts lightness
    const lOffset = intensity * -0.15;
    bgL = Math.max(0, Math.min(1, 0.28 + lOffset));
    pulseL1 = bgL + 0.06;
    pulseL2 = bgL + 0.10;
    sepL = bgL + 0.04;
  } else {
    const lOffset = intensity * -0.15;
    bgL = Math.max(0, Math.min(1, 0.985 + lOffset));
    pulseL1 = bgL - 0.06;
    pulseL2 = bgL - 0.10;
    sepL = bgL - 0.04;
  }

  // Convert oklch-ish lightness to approximate hex gray
  const toHex = (l: number) => {
    // oklch lightness to sRGB approximation (perceptual, not exact)
    const v = Math.round(Math.pow(Math.max(0, Math.min(1, l)), 0.75) * 255);
    return `#${v.toString(16).padStart(2, '0').repeat(3)}`;
  };

  const bgColor = toHex(bgL);
  const pulse1 = toHex(pulseL1);
  const pulse2 = toHex(pulseL2);
  const sepColor = toHex(sepL);

  const pulseStyle: React.CSSProperties = {
    animation: "skeletonPulse 1.5s ease-in-out infinite",
    borderRadius: "8px",
    background: `linear-gradient(90deg, ${pulse1} 0%, ${pulse2} 50%, ${pulse1} 100%)`,
  };

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100%",
      background: bgColor,
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
        background: sepColor,
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
