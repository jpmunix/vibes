import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  MutationCache,
} from "@tanstack/react-query";
import { showError } from "./lib/toast";
import { ChatWindowSkeleton, MainWindowSkeleton, SecondaryWindowSkeleton } from "./components/skeletons";
import { AuthGate } from "./components/AuthGate";

const AppRoot = lazy(() => import("./AppRoot"));

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


// Skeleton components (ChatWindowSkeleton, MainWindowSkeleton, SecondaryWindowSkeleton)
// are imported from ./components/skeletons.tsx — shared with AuthGate for visual continuity.

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
  // Show skeleton immediately while JS bundle loads
  const dbRoot = createRoot(document.getElementById("root")!);
  dbRoot.render(<SecondaryWindowSkeleton />);

  import("./components/database/DatabaseWindowApp").then(
    ({ DatabaseWindowApp }) => {
      dbRoot.render(
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

  // Show skeleton immediately while JS bundle loads
  const gitRoot = createRoot(document.getElementById("root")!);
  gitRoot.render(<SecondaryWindowSkeleton />);

  const commitHashParam = urlParams.get("commitHash") || undefined;
  import("./components/git_window/GitWindowApp").then(
    ({ GitWindowApp }) => {
      gitRoot.render(
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

  // Show skeleton immediately while JS bundle loads
  const codeRoot = createRoot(document.getElementById("root")!);
  codeRoot.render(<SecondaryWindowSkeleton />);

  import("./components/code_window/CodeWindowApp").then(
    ({ CodeWindowApp }) => {
      codeRoot.render(
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

  // Show skeleton immediately while JS bundle loads
  const consoleRoot = createRoot(document.getElementById("root")!);
  consoleRoot.render(<SecondaryWindowSkeleton />);

  import("./components/console_window/ConsoleWindowApp").then(
    ({ ConsoleWindowApp }) => {
      consoleRoot.render(
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

  // Show skeleton immediately while JS bundle loads
  const msgRoot = createRoot(document.getElementById("root")!);
  msgRoot.render(<SecondaryWindowSkeleton />);

  import("./components/message_window/MessageWindowApp").then(
    ({ MessageWindowApp }) => {
      msgRoot.render(
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

  // Show skeleton immediately while JS bundle loads
  const memRoot = createRoot(document.getElementById("root")!);
  memRoot.render(<SecondaryWindowSkeleton />);

  import("./components/memory_window/MemoryWindowApp").then(
    ({ MemoryWindowApp }) => {
      memRoot.render(
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

  // Show skeleton immediately while JS bundle loads
  const playRoot = createRoot(document.getElementById("root")!);
  playRoot.render(<SecondaryWindowSkeleton />);

  import("./components/playground_window/PlaygroundWindowApp").then(
    ({ PlaygroundWindowApp }) => {
      playRoot.render(
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

  // Show skeleton immediately while JS bundle loads
  const adminRoot = createRoot(document.getElementById("root")!);
  adminRoot.render(<SecondaryWindowSkeleton />);

  import("./components/admin_window/AdminWindowApp").then(
    ({ AdminWindowApp }) => {
      adminRoot.render(
        <StrictMode>
          <AdminWindowApp />
        </StrictMode>,
      );
    },
  );
} else if (windowType === "docs") {
  // Sync theme from parent window via URL params
  if (themeParam) {
    localStorage.setItem("theme", themeParam);
  }
  if (intensityParam) {
    localStorage.setItem("theme-intensity", intensityParam);
    document.documentElement.style.setProperty("--theme-intensity", intensityParam);
  }

  // Show skeleton immediately while JS bundle loads
  const docsRoot = createRoot(document.getElementById("root")!);
  docsRoot.render(<SecondaryWindowSkeleton />);

  import("./components/docs_window/DocsWindowApp").then(
    ({ DocsWindowApp }) => {
      docsRoot.render(
        <StrictMode>
          <DocsWindowApp />
        </StrictMode>,
      );
    },
  );
} else {
  // Main window — render immediately with eager imports.
  // AuthGate handles the loading skeleton internally (shows MainWindowSkeleton
  // while verifying session, or renders children immediately if cached session exists).
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <Suspense fallback={<MainWindowSkeleton />}>
            <AppRoot />
          </Suspense>
        </AuthGate>
      </QueryClientProvider>
    </StrictMode>,
  );
}
