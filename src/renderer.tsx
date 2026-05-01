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

/**
 * Lightweight skeleton shown immediately while the main window JS bundle loads.
 * Uses inline styles so it doesn't depend on any CSS file being loaded yet.
 * Matches the main app layout: title bar + sidebar (icon column + app list) + central content area.
 */
function MainWindowSkeleton() {
  const skeletonKeyframes = `
    @keyframes skeletonPulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.15; }
    }
  `;

  // Reuse the same theme detection logic as ChatWindowSkeleton
  const savedTheme = localStorage.getItem("theme");
  const systemPrefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const isDark =
    savedTheme === "dark" ||
    (savedTheme !== "light" && systemPrefersDark);

  const savedIntensity = localStorage.getItem("theme-intensity");
  const intensity = savedIntensity ? parseFloat(savedIntensity) : 0.58;

  let bgL: number;
  let pulseL1: number;
  let pulseL2: number;
  let sidebarL: number;
  let sepL: number;

  if (isDark) {
    const lOffset = intensity * -0.15;
    bgL = Math.max(0, Math.min(1, 0.28 + lOffset));
    pulseL1 = bgL + 0.06;
    pulseL2 = bgL + 0.10;
    sidebarL = bgL - 0.04;
    sepL = bgL + 0.04;
  } else {
    const lOffset = intensity * -0.15;
    bgL = Math.max(0, Math.min(1, 0.985 + lOffset));
    pulseL1 = bgL - 0.06;
    pulseL2 = bgL - 0.10;
    sidebarL = bgL - 0.02;
    sepL = bgL - 0.04;
  }

  const toHex = (l: number) => {
    const v = Math.round(Math.pow(Math.max(0, Math.min(1, l)), 0.75) * 255);
    return `#${v.toString(16).padStart(2, '0').repeat(3)}`;
  };

  const bgColor = toHex(bgL);
  const pulse1 = toHex(pulseL1);
  const pulse2 = toHex(pulseL2);
  const sidebarBg = toHex(sidebarL);
  const sepColor = toHex(sepL);

  const pulseStyle: React.CSSProperties = {
    animation: "skeletonPulse 1.5s ease-in-out infinite",
    borderRadius: "8px",
    background: `linear-gradient(90deg, ${pulse1} 0%, ${pulse2} 50%, ${pulse1} 100%)`,
  };

  // Title bar height matches the real TitleBar (44px = h-11)
  const titleBarHeight = 44;
  // Top navbar height (40px)
  const topNavHeight = 40;
  // Secondary sidebar panel width (~250px)
  const sidebarPanelWidth = 250;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      width: "100%",
      background: bgColor,
      fontFamily: "system-ui, -apple-system, sans-serif",
      overflow: "hidden",
    }}>
      <style>{skeletonKeyframes}</style>

      {/* Title bar */}
      <div style={{
        height: `${titleBarHeight}px`,
        background: sidebarBg,
        flexShrink: 0,
        // @ts-ignore — Electron-specific CSS for window drag
        WebkitAppRegionDrag: "drag",
      } as React.CSSProperties} />

      {/* Top navbar */}
      <div style={{
        height: `${topNavHeight}px`,
        background: sidebarBg,
        borderBottom: `1px solid ${sepColor}`,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: "8px",
        flexShrink: 0,
      }}>
        {/* Toggle + separator */}
        <div style={{ ...pulseStyle, width: "80px", height: "28px", borderRadius: "8px", animationDelay: "0s" }} />
        <div style={{ width: "1px", height: "20px", background: sepColor, flexShrink: 0 }} />

        {/* 3 nav items (Apps, Agente, Tareas) */}
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "0 10px",
            height: "28px",
            borderRadius: "8px",
            ...(i === 0 ? { background: sepColor } : {}),
          }}>
            <div style={{ ...pulseStyle, width: "16px", height: "16px", borderRadius: "4px", animationDelay: `${i * 0.06}s` }} />
            <div style={{ ...pulseStyle, width: `${40 + i * 10}px`, height: "12px", borderRadius: "4px", animationDelay: `${i * 0.06 + 0.03}s` }} />
          </div>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right side items (credits, settings, avatar) */}
        <div style={{ ...pulseStyle, width: "60px", height: "28px", borderRadius: "8px", animationDelay: "0.3s" }} />
        <div style={{ ...pulseStyle, width: "28px", height: "28px", borderRadius: "8px", animationDelay: "0.35s" }} />
        <div style={{ ...pulseStyle, width: "24px", height: "24px", borderRadius: "50%", animationDelay: "0.4s" }} />
      </div>

      {/* Below topnav: sidebar panel + content */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* Secondary sidebar panel */}
        <div style={{
          width: `${sidebarPanelWidth}px`,
          background: sidebarBg,
          display: "flex",
          flexDirection: "column",
          padding: "8px 8px 16px 8px",
          gap: "6px",
          flexShrink: 0,
          borderRight: `1px solid ${sepColor}`,
        }}>
          {/* Header buttons (Nueva aplicación, etc.) */}
          <div style={{ ...pulseStyle, width: "100%", height: "28px", animationDelay: "0.1s" }} />
          <div style={{ ...pulseStyle, width: "100%", height: "28px", animationDelay: "0.15s" }} />
          <div style={{ ...pulseStyle, width: "100%", height: "28px", animationDelay: "0.2s" }} />
          <div style={{ ...pulseStyle, width: "85%", height: "28px", animationDelay: "0.25s" }} />

          {/* Section label */}
          <div style={{ ...pulseStyle, width: "80px", height: "10px", marginTop: "12px", animationDelay: "0.3s" }} />

          {/* App list items */}
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              display: "flex",
              flexDirection: "column",
              gap: "3px",
              padding: "4px 0",
            }}>
              <div style={{ ...pulseStyle, width: `${70 + (i % 3) * 10}%`, height: "14px", animationDelay: `${0.35 + i * 0.06}s` }} />
              <div style={{ ...pulseStyle, width: "60%", height: "10px", animationDelay: `${0.38 + i * 0.06}s` }} />
            </div>
          ))}

          {/* Another section */}
          <div style={{ ...pulseStyle, width: "100px", height: "10px", marginTop: "8px", animationDelay: "0.7s" }} />
          {[0, 1, 2].map((i) => (
            <div key={`s2-${i}`} style={{
              display: "flex",
              flexDirection: "column",
              gap: "3px",
              padding: "4px 0",
            }}>
              <div style={{ ...pulseStyle, width: `${60 + (i % 2) * 20}%`, height: "14px", animationDelay: `${0.75 + i * 0.06}s` }} />
              <div style={{ ...pulseStyle, width: "50%", height: "10px", animationDelay: `${0.78 + i * 0.06}s` }} />
            </div>
          ))}
        </div>

        {/* Main content area */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          gap: "24px",
        }}>
          {/* Title placeholder (vibes.start()) */}
          <div style={{ ...pulseStyle, width: "280px", height: "36px", animationDelay: "0.15s" }} />

          {/* Input box placeholder */}
          <div style={{
            width: "100%",
            maxWidth: "640px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}>
            {/* Text input area */}
            <div style={{ ...pulseStyle, width: "100%", height: "100px", borderRadius: "12px", animationDelay: "0.2s" }} />

            {/* Toolbar row below input (Agents, Gemini, etc.) */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" as const }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ ...pulseStyle, width: `${60 + i * 15}px`, height: "28px", borderRadius: "14px", animationDelay: `${0.3 + i * 0.05}s` }} />
              ))}
            </div>
          </div>

          {/* Inspiration prompt buttons */}
          <div style={{
            display: "flex",
            flexWrap: "wrap" as const,
            gap: "10px",
            justifyContent: "center",
            maxWidth: "640px",
          }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{
                ...pulseStyle,
                width: `${110 + (i % 3) * 30}px`,
                height: "36px",
                borderRadius: "12px",
                animationDelay: `${0.4 + i * 0.06}s`,
              }} />
            ))}
          </div>

          {/* "Más ideas" button */}
          <div style={{ ...pulseStyle, width: "100px", height: "36px", borderRadius: "12px", animationDelay: "0.8s" }} />
        </div>
      </div>
    </div>
  );
}

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
  // Show skeleton loader immediately while AuthGate JS bundle loads
  const root = createRoot(document.getElementById("root")!);
  root.render(<MainWindowSkeleton />);

  // Lazy-import AuthGate to avoid loading auth deps in sub-windows
  import("./components/AuthGate").then(({ AuthGate }) => {
    function AuthGateApp() {
      return (
        <AuthGate>
          <App />
        </AuthGate>
      );
    }

    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <AuthGateApp />
        </QueryClientProvider>
      </StrictMode>,
    );
  });
}
