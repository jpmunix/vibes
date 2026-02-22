import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import {
    PanelGroup,
    Panel,
    PanelResizeHandle,
    type ImperativePanelHandle,
} from "react-resizable-panels";
import {
    QueryCache,
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import {
    createRouter,
    createRootRoute,
    createRoute,
    createMemoryHistory,
    RouterProvider,
} from "@tanstack/react-router";
import { PostHogProvider } from "posthog-js/react";

import { ThemeProvider } from "../../contexts/ThemeContext";
import { getColorById, adjustChroma, DEFAULT_LIGHT_COLOR, DEFAULT_DARK_COLOR } from "@/components/PrimaryColorPicker";
import { ChatPanel } from "../ChatPanel";
import { PreviewPanel } from "../preview_panel/PreviewPanel";
import { useSetAtom, useAtom, useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { isPreviewOpenAtom, isPreviewExpandedAtom } from "@/atoms/viewAtoms";
import {
    selectedChatIdAtom,
    pendingAgentConsentsAtom,
    pendingAskUsersAtom,
    agentTodosByChatIdAtom,
    autoRouterModelInfoByChatIdAtom,
    isSelectingModelByIdAtom,
} from "@/atoms/chatAtoms";
import { ipc } from "../../ipc/types";
import { useChats } from "@/hooks/useChats";
import { useStreamChat } from "@/hooks/useStreamChat";
import { useRunApp, useAppOutputSubscription } from "@/hooks/useRunApp";

import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import { showError } from "@/lib/toast";
import { SidebarContext, type SidebarContextProps } from "@/components/ui/sidebar";
import { ActionHeader } from "@/components/preview_panel/ActionHeader";
import { currentAppAtom } from "@/atoms/appAtoms";
import { useSettings } from "@/hooks/useSettings";
import { chatPositionAtom } from "@/atoms/uiAtoms";
import { ChatTitleBar } from "./ChatTitleBar";

/**
 * P18 — Lightweight chat+preview shell for dedicated chat windows.
 *
 * Provides minimal-but-complete providers so ALL existing components
 * work without modification:
 *
 * - QueryClientProvider (useChats, useMessages, etc.)
 * - RouterProvider with MEMORY HISTORY starting at /chat (useSearch, useNavigate, etc.)
 * - PostHogProvider (usePostHog — no-op, nothing is sent)
 * - ThemeProvider (dark mode)
 *
 * CRITICAL NOTES:
 * 1. ChatWindowContent renders INSIDE the router tree (root route component)
 *    so all children can call useRouter(), useSearch(), etc.
 * 2. We use createMemoryHistory initialized at /chat?id=<chatId> so that
 *    useSearch({ from: "/chat" }) finds an active match. The actual Electron
 *    window URL is file:///...index.html — NOT /chat.
 */

// ─── QueryClient (isolated from main window) ───────────────────────────
const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 60_000, retry: false },
        mutations: { retry: false },
    },
    queryCache: new QueryCache({
        onError: (error, query) => {
            if (query.meta?.showErrorToast) {
                showError(error);
            }
        },
    }),
});

// ─── No-op PostHog client ───────────────────────────────────────────────
// Instead of initializing the full PostHog SDK (which sets up localStorage,
// timers, and internal data structures), we pass null. The PostHogProvider
// from posthog-js/react gracefully handles this — `usePostHog()` will
// return null/undefined, and posthog.capture() calls become no-ops.
const noopPosthogClient = null;

// ─── Lightweight sidebar context for chat window ────────────────────────
// The full SidebarProvider (780 lines) adds keyboard shortcuts, cookie
// management, resize handlers, and wrapping DOM. The chat window only needs
// the context value so PreviewIframe's ExpandPreviewButton doesn't crash.
const SIDEBAR_STUB_VALUE: SidebarContextProps = {
    state: "collapsed",
    open: false,
    setOpen: () => { },
    toggleSidebar: () => { },
    width: "0",
    setWidth: () => { },
    isResizing: false,
    setIsResizing: () => { },
};

// ─── Types ──────────────────────────────────────────────────────────────
interface ChatWindowAppProps {
    appId: number;
    chatId?: number;
    hasPendingPrompt?: boolean;
    initialChatMode?: string;
}

// ─── Inner content (rendered inside router tree) ────────────────────────
function ChatWindowContent({ appId, chatId: initialChatId, hasPendingPrompt, initialChatMode }: ChatWindowAppProps) {
    const setSelectedAppId = useSetAtom(selectedAppIdAtom);
    const [chatId, setChatId] = useAtom(selectedChatIdAtom);
    const [isPreviewOpen, setIsPreviewOpen] = useAtom(isPreviewOpenAtom);
    const isPreviewExpanded = useAtomValue(isPreviewExpandedAtom);
    const [chatPosition, setChatPosition] = useAtom(chatPositionAtom);
    const [isResizing, setIsResizing] = useState(false);
    const { chats, loading } = useChats(appId);
    const currentApp = useAtomValue(currentAppAtom);
    const hasAutoStreamedRef = useRef(false);
    const { streamMessage } = useStreamChat({ hasChatId: true });

    // Defer server startup until the first AI message finishes streaming.
    // When opening a brand-new app, the code hasn't been generated yet,
    // so starting the dev server immediately always fails and wastes resources.
    const [serverReady, setServerReady] = useState(!hasPendingPrompt);

    const previewRef = useRef<ImperativePanelHandle>(null);
    const chatRef = useRef<ImperativePanelHandle>(null);

    useEffect(() => {
        setSelectedAppId(appId);
        // Initialize chatId atom with the value from URL params
        if (initialChatId) {
            setChatId(initialChatId);
        }
    }, [appId, setSelectedAppId, initialChatId, setChatId]);

    // Apply initial chat mode (e.g. "plan") from the parent window on mount
    const { settings, updateSettings } = useSettings();
    const hasAppliedInitialModeRef = useRef(false);
    useEffect(() => {
        if (initialChatMode && !hasAppliedInitialModeRef.current) {
            hasAppliedInitialModeRef.current = true;
            updateSettings({ selectedChatMode: initialChatMode as any });
        }
    }, [initialChatMode, updateSettings]);

    // Sync preview position from user settings
    useEffect(() => {
        if (settings?.previewPosition) {
            // previewPosition is where the preview is; chatPosition is the opposite
            const chatPos = settings.previewPosition === "left" ? "right" : "left";
            setChatPosition(chatPos);
        }
    }, [settings?.previewPosition, setChatPosition]);

    // Apply primary colors from settings
    useEffect(() => {
        if (settings) {
            const lightColor = getColorById(settings.primaryColorLight || DEFAULT_LIGHT_COLOR);
            const darkColor = getColorById(settings.primaryColorDark || DEFAULT_DARK_COLOR);
            const lightFactor = (settings.primaryChromaLight ?? 100) / 100;
            const darkFactor = (settings.primaryChromaDark ?? 100) / 100;
            const root = document.documentElement;
            if (lightColor) root.style.setProperty("--primary-color-light", adjustChroma(lightColor.light, lightFactor));
            if (darkColor) root.style.setProperty("--primary-color-dark", adjustChroma(darkColor.dark, darkFactor));
        }
    }, [settings?.primaryColorLight, settings?.primaryColorDark, settings?.primaryChromaLight, settings?.primaryChromaDark]);

    // Fetch and stream pending prompt+attachments via IPC when the chat window loads
    useEffect(() => {
        if (
            hasPendingPrompt &&
            chatId &&
            !hasAutoStreamedRef.current
        ) {
            hasAutoStreamedRef.current = true;
            ipc.system.getPendingChatPrompt(chatId).then((pending) => {
                if (pending) {
                    streamMessage({
                        prompt: pending.prompt,
                        chatId,
                        attachments: pending.attachments?.map(a => ({
                            file: new File(
                                [Uint8Array.from(atob(a.data.split(",")[1] || a.data), c => c.charCodeAt(0))],
                                a.name,
                                { type: a.type },
                            ),
                            type: a.attachmentType,
                        })),
                    });
                }
            });
        }
    }, [hasPendingPrompt, chatId, streamMessage]);

    useEffect(() => {
        if (!chatId && chats.length && !loading) {
            setChatId(chats[0].id);
        }
    }, [chatId, chats, loading]);

    useAppOutputSubscription();


    // Set document.title so the native title bar shows app name
    useEffect(() => {
        if (currentApp?.name) {
            document.title = `${currentApp.name} — Vibes Chat`;
        }
    }, [currentApp?.name]);

    useEffect(() => {
        if (isPreviewOpen) {
            previewRef.current?.expand();
        } else {
            previewRef.current?.collapse();
        }
    }, [isPreviewOpen]);

    useEffect(() => {
        if (isPreviewExpanded) {
            chatRef.current?.collapse();
        } else {
            chatRef.current?.expand();
        }
    }, [isPreviewExpanded]);

    // === Streaming event listeners ===
    const setPendingAgentConsents = useSetAtom(pendingAgentConsentsAtom);
    const setPendingAskUsers = useSetAtom(pendingAskUsersAtom);
    const setAgentTodosByChatId = useSetAtom(agentTodosByChatIdAtom);
    const setAutoRouterModelInfo = useSetAtom(autoRouterModelInfoByChatIdAtom);
    const setIsSelectingModelById = useSetAtom(isSelectingModelByIdAtom);

    useEffect(() => {
        // @ts-ignore
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

    useEffect(() => {
        // @ts-ignore
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
                setIsSelectingModelById((prev) => {
                    const next = new Map(prev);
                    next.set(payload.chatId, false);
                    return next;
                });
            },
        );
        return () => unsubscribe?.();
    }, [setAutoRouterModelInfo, setIsSelectingModelById]);

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

    useEffect(() => {
        const unsubscribe = ipc.events.misc.onChatStreamStart(({ chatId }) => {
            setAgentTodosByChatId((prev) => {
                const next = new Map(prev);
                next.delete(chatId);
                return next;
            });
            setAutoRouterModelInfo((prev) => {
                const next = new Map(prev);
                next.delete(chatId);
                return next;
            });
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

    useEffect(() => {
        const unsubscribe = ipc.events.misc.onChatStreamEnd(({ chatId }) => {
            // Enable server startup after first stream completes
            if (!serverReady) {
                setServerReady(true);
            }
            setPendingAgentConsents((prev) =>
                prev.filter((consent) => consent.chatId !== chatId),
            );
            setPendingAskUsers((prev) =>
                prev.filter((ask) => ask.chatId !== chatId),
            );
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
    }, [setPendingAgentConsents, setPendingAskUsers, setAgentTodosByChatId, serverReady]);

    const chatPanelNode = (
        <Panel
            collapsible
            collapsedSize={0}
            ref={chatRef}
            id="chat-panel"
            order={chatPosition === "left" ? 1 : 3}
            minSize={30}
        >
            <div className="h-full w-full">
                <ChatPanel
                    chatId={chatId}
                    autoStart={false}
                    isPreviewOpen={isPreviewOpen}
                    preservePlanMode={hasPendingPrompt && initialChatMode === "plan"}
                    onTogglePreview={() => {
                        setIsPreviewOpen(!isPreviewOpen);
                        if (isPreviewOpen) {
                            previewRef.current?.collapse();
                        } else {
                            previewRef.current?.expand();
                        }
                    }}
                />
            </div>
        </Panel>
    );

    const previewPanelNode = (
        <Panel
            collapsible
            ref={previewRef}
            id="preview-panel"
            order={chatPosition === "left" ? 3 : 1}
            minSize={20}
            className={cn(
                !isResizing && "transition-[opacity] duration-150 ease-in-out",
            )}
        >
            <div className="flex flex-col h-full">
                <ActionHeader />
                <div className="flex-1 min-h-0">
                    <PreviewPanel />
                </div>
            </div>
        </Panel>
    );

    return (
        <div className="flex flex-col h-screen w-full bg-background">
            <ChatTitleBar />
            <div className="flex flex-1 min-h-0">
                <PanelGroup autoSaveId={`chat-window-${appId}-${chatPosition}`} direction="horizontal">
                    {chatPosition === "left" ? chatPanelNode : previewPanelNode}
                    <PanelResizeHandle
                        onDragging={(e) => setIsResizing(e)}
                        className={cn(
                            "w-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors cursor-col-resize",
                            isPreviewExpanded && "invisible",
                        )}
                        disabled={isPreviewExpanded}
                    />
                    {chatPosition === "left" ? previewPanelNode : chatPanelNode}
                </PanelGroup>
            </div>
            <Toaster richColors />
        </div>
    );
}

// ─── Minimal Router with Memory History ─────────────────────────────────
// The Electron window URL is file:///...index.html — NOT /chat.
// We use createMemoryHistory starting at /chat?id=<chatId> so that
// useSearch({ from: "/chat" }) in useStreamChat finds an active match.
// ChatWindowContent is the root route component → inside the router tree.
function createChatWindowRouter(appId: number, chatId?: number, hasPendingPrompt?: boolean, initialChatMode?: string) {
    const chatWindowRootRoute = createRootRoute({
        component: () => (
            <SidebarContext.Provider value={SIDEBAR_STUB_VALUE}>
                <ChatWindowContent appId={appId} chatId={chatId} hasPendingPrompt={hasPendingPrompt} initialChatMode={initialChatMode} />
            </SidebarContext.Provider>
        ),
    });

    const chatRoute = createRoute({
        getParentRoute: () => chatWindowRootRoute,
        path: "/chat",
        component: () => null,
        validateSearch: (search: Record<string, unknown>) => ({
            id: Number(search.id) || chatId,
            autoStart: (search.autoStart as boolean) ?? false,
        }),
    });

    // Catch-all so navigation attempts to /notes, /settings, etc. don't crash
    const catchAllRoute = createRoute({
        getParentRoute: () => chatWindowRootRoute,
        path: "$",
        component: () => null,
    });

    const routeTree = chatWindowRootRoute.addChildren([chatRoute, catchAllRoute]);

    // Memory history starts at /chat with the chatId as search param
    const initialUrl = chatId ? `/chat?id=${chatId}` : "/chat";
    const memoryHistory = createMemoryHistory({
        initialEntries: [initialUrl],
    });

    return createRouter({
        routeTree,
        history: memoryHistory,
        defaultNotFoundComponent: () => null,
    });
}

// ─── Shell (outermost providers) ────────────────────────────────────────
export function ChatWindowApp({ appId, chatId, hasPendingPrompt, initialChatMode }: ChatWindowAppProps) {
    const [chatRouter] = useState(() => createChatWindowRouter(appId, chatId, hasPendingPrompt, initialChatMode));

    return (
        <QueryClientProvider client={queryClient}>
            <PostHogProvider client={noopPosthogClient}>
                <ThemeProvider>
                    {/* @ts-ignore — minimal router type doesn't match full app router, but it's safe */}
                    <RouterProvider router={chatRouter} />
                </ThemeProvider>
            </PostHogProvider>
        </QueryClientProvider>
    );
}
