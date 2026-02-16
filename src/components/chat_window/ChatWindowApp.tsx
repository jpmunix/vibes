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
import posthog from "posthog-js";
import { ThemeProvider } from "../../contexts/ThemeContext";
import { ChatPanel } from "../ChatPanel";
import { PreviewPanel } from "../preview_panel/PreviewPanel";
import { useSetAtom, useAtom, useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { isPreviewOpenAtom, isPreviewExpandedAtom } from "@/atoms/viewAtoms";
import {
    selectedChatIdAtom,
    pendingAgentConsentsAtom,
    agentTodosByChatIdAtom,
    autoRouterModelInfoByChatIdAtom,
    isSelectingModelByIdAtom,
} from "@/atoms/chatAtoms";
import { ipc } from "../../ipc/types";
import { useChats } from "@/hooks/useChats";
import { useStreamChat } from "@/hooks/useStreamChat";
import { useRunApp, useAppOutputSubscription } from "@/hooks/useRunApp";
import { useSilentAppStart } from "@/hooks/useSilentAppStart";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import { showError } from "@/lib/toast";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ActionHeader } from "@/components/preview_panel/ActionHeader";
import { currentAppAtom } from "@/atoms/appAtoms";

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
const noopPosthogClient = posthog.init("phc_noop_chat_window", {
    api_host: "https://localhost",
    autocapture: false,
    capture_exceptions: false,
    capture_pageview: false,
    opt_out_capturing_by_default: true,
    disable_session_recording: true,
    loaded: (ph) => {
        ph.opt_out_capturing();
    },
});

// ─── Types ──────────────────────────────────────────────────────────────
interface ChatWindowAppProps {
    appId: number;
    chatId?: number;
    hasPendingPrompt?: boolean;
}

// ─── Inner content (rendered inside router tree) ────────────────────────
function ChatWindowContent({ appId, chatId: initialChatId, hasPendingPrompt }: ChatWindowAppProps) {
    const setSelectedAppId = useSetAtom(selectedAppIdAtom);
    const [chatId, setChatId] = useAtom(selectedChatIdAtom);
    const [isPreviewOpen, setIsPreviewOpen] = useAtom(isPreviewOpenAtom);
    const isPreviewExpanded = useAtomValue(isPreviewExpandedAtom);
    const [isResizing, setIsResizing] = useState(false);
    const { chats, loading } = useChats(appId);
    const currentApp = useAtomValue(currentAppAtom);
    const hasAutoStreamedRef = useRef(false);
    const { streamMessage } = useStreamChat({ hasChatId: true });

    const previewRef = useRef<ImperativePanelHandle>(null);
    const chatRef = useRef<ImperativePanelHandle>(null);

    useEffect(() => {
        setSelectedAppId(appId);
        // Initialize chatId atom with the value from URL params
        if (initialChatId) {
            setChatId(initialChatId);
        }
    }, [appId, setSelectedAppId, initialChatId, setChatId]);

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
    useSilentAppStart();

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

    useEffect(() => {
        const unsubscribe = ipc.events.misc.onChatStreamEnd(({ chatId }) => {
            setPendingAgentConsents((prev) =>
                prev.filter((consent) => consent.chatId !== chatId),
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
    }, [setPendingAgentConsents, setAgentTodosByChatId]);

    return (
        <div className="flex h-screen w-full bg-background">
            <PanelGroup autoSaveId={`chat-window-${appId}`} direction="horizontal">
                <Panel
                    collapsible
                    collapsedSize={0}
                    ref={chatRef}
                    id="chat-panel"
                    minSize={30}
                >
                    <div className="h-full w-full">
                        <ChatPanel
                            chatId={chatId}
                            autoStart={false}
                            isPreviewOpen={isPreviewOpen}
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

                <>
                    <PanelResizeHandle
                        onDragging={(e) => setIsResizing(e)}
                        className={cn(
                            "w-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors cursor-col-resize",
                            isPreviewExpanded && "invisible",
                        )}
                        disabled={isPreviewExpanded}
                    />
                    <Panel
                        collapsible
                        ref={previewRef}
                        id="preview-panel"
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
                </>
            </PanelGroup>
            <Toaster richColors />
        </div>
    );
}

// ─── Minimal Router with Memory History ─────────────────────────────────
// The Electron window URL is file:///...index.html — NOT /chat.
// We use createMemoryHistory starting at /chat?id=<chatId> so that
// useSearch({ from: "/chat" }) in useStreamChat finds an active match.
// ChatWindowContent is the root route component → inside the router tree.
function createChatWindowRouter(appId: number, chatId?: number, hasPendingPrompt?: boolean) {
    const chatWindowRootRoute = createRootRoute({
        component: () => (
            <SidebarProvider defaultOpen={false}>
                <ChatWindowContent appId={appId} chatId={chatId} hasPendingPrompt={hasPendingPrompt} />
            </SidebarProvider>
        ),
    });

    const chatRoute = createRoute({
        getParentRoute: () => chatWindowRootRoute,
        path: "/chat",
        component: () => null,
        validateSearch: (search: Record<string, unknown>) => ({
            id: (search.id as number) ?? chatId,
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
export function ChatWindowApp({ appId, chatId, hasPendingPrompt }: ChatWindowAppProps) {
    const [chatRouter] = useState(() => createChatWindowRouter(appId, chatId, hasPendingPrompt));

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
