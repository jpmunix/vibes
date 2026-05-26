import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import {
    PanelGroup,
    Panel,
    PanelResizeHandle,
    type ImperativePanelHandle,
} from "react-resizable-panels";
import { GripVertical } from "@/components/ui/icons";
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

import { ThemeProvider } from "../../contexts/ThemeContext";
import { getColorById, adjustChroma, DEFAULT_LIGHT_COLOR, DEFAULT_DARK_COLOR } from "@/components/PrimaryColorPicker";
import { ChatPanel } from "../ChatPanel";
import { PreviewPanel } from "../preview_panel/PreviewPanel";
import { ArtifactSidebar } from "../chat/ArtifactSidebar";
import { AuthGate } from "../AuthGate";
import { useSetAtom, useAtom, useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { isPreviewOpenAtom, isPreviewExpandedAtom } from "@/atoms/viewAtoms";
import {
    selectedChatIdAtom,
    pendingAgentConsentsAtom,
    pendingAskUsersAtom,
    pendingOpenCodePermissionsAtom,
    agentTodosByChatIdAtom,
    autoRouterModelInfoByChatIdAtom,
    isSelectingModelByIdAtom,
    quotedMessagesAtom,
} from "@/atoms/chatAtoms";
import { ipc } from "../../ipc/types";
import { useChats } from "@/hooks/useChats";
import { useStreamChat } from "@/hooks/useStreamChat";
import { useRunApp, useAppOutputSubscription } from "@/hooks/useRunApp";
import { queryKeys } from "@/lib/queryKeys";

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

    // When the app has a pending prompt (brand-new app), start with preview
    // collapsed so the user doesn't see a broken preview while the agent works.
    // Once serverReady becomes true (first stream ends), auto-expand the preview.
    useEffect(() => {
        if (hasPendingPrompt && !serverReady) {
            setIsPreviewOpen(false);
        }
    }, []); // Only on mount

    useEffect(() => {
        if (serverReady && hasPendingPrompt) {
            // First AI message finished — open the preview, which triggers
            // PreviewPanel's auto-start effect to run npm install + dev server
            setIsPreviewOpen(true);
        }
    }, [serverReady]);

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

    // Apply font scale CSS variables from settings
    useEffect(() => {
        if (settings) {
            const root = document.documentElement;
            if (settings.fontScaleUI !== undefined) root.style.setProperty("--scale-ui", settings.fontScaleUI.toString());
            if (settings.fontScaleSidebar !== undefined) root.style.setProperty("--scale-sidebar", settings.fontScaleSidebar.toString());
            if (settings.fontScaleChat !== undefined) root.style.setProperty("--scale-chat", settings.fontScaleChat.toString());
            if (settings.fontScaleBubbleWidth !== undefined) root.style.setProperty("--bubble-width", `${settings.fontScaleBubbleWidth}%`);
        }
    }, [settings?.fontScaleUI, settings?.fontScaleSidebar, settings?.fontScaleChat, settings?.fontScaleBubbleWidth]);

    // Fetch and stream pending prompt+attachments via IPC when the chat window loads
    // Guard: wait for initialChatMode to be applied to settings before streaming,
    // so that ChatPanel and other consumers see the correct mode from the start.
    useEffect(() => {
        if (
            hasPendingPrompt &&
            chatId &&
            !hasAutoStreamedRef.current &&
            (!initialChatMode || hasAppliedInitialModeRef.current)
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
                        // Force the correct chat mode synchronously — avoids race
                        // condition where settings haven't propagated yet.
                        chatModeOverride: initialChatMode || undefined,
                    });
                }
            });
        }
    }, [hasPendingPrompt, chatId, streamMessage, initialChatMode]);

    useEffect(() => {
        if (!chatId && chats.length && !loading) {
            setChatId(chats[0].id);
        }
    }, [chatId, chats, loading]);

    useAppOutputSubscription();

    // Cross-window console log: when a console window sends a log to this chat,
    // the main process routes it here as a quote card via the appId.
    const setQuotedForConsole = useSetAtom(quotedMessagesAtom);
    useEffect(() => {
        // @ts-ignore — using raw preload API for custom event
        const unsubscribe = window.electron?.ipcRenderer?.on?.(
            "console-log-to-chat",
            (payload: { appId: number; formattedLog: string }) => {
                if (payload.appId === appId) {
                    setQuotedForConsole((prev) => {
                        const id = Date.now();
                        return [...prev, { id, role: "console" as const, content: payload.formattedLog }];
                    });
                }
            },
        );
        return () => unsubscribe?.();
    }, [appId, setQuotedForConsole]);


    // Set document.title so the native title bar shows app name
    useEffect(() => {
        if (currentApp?.name) {
            document.title = `${currentApp.name} \u2013 Chat`;
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
    const setPendingOCPermissions = useSetAtom(pendingOpenCodePermissionsAtom);
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

    useEffect(() => {
        const unsubscribe = ipc.events.misc.onChatStreamEnd(({ chatId }) => {
            // Enable server startup after a CODE-PRODUCING stream completes.
            // Plan/ask modes don't generate runnable code, so we defer until
            // an agent/code stream finishes writing actual files.
            if (!serverReady) {
                const currentMode = settings?.selectedChatMode;
                const isCodeProducingMode = currentMode !== "plan" && currentMode !== "ask";

                if (isCodeProducingMode || !hasPendingPrompt) {
                    setServerReady(true);
                    // Preview open is handled by the [serverReady] effect above
                }
                // If still in plan/ask mode with pending prompt, keep serverReady=false
                // so the preview stays collapsed until code is actually generated.
            } else if (hasPendingPrompt) {
                // serverReady was already set (e.g. plan stream finished first),
                // but preview might still be closed. Re-open it if the user has
                // now switched to a code-producing mode.
                if (!isPreviewOpen) {
                    const currentMode = settings?.selectedChatMode;
                    if (currentMode !== "plan" && currentMode !== "ask") {
                        setIsPreviewOpen(true);
                    }
                }
            }
            setPendingAgentConsents((prev) =>
                prev.filter((consent) => consent.chatId !== chatId),
            );
            setPendingAskUsers((prev) =>
                prev.filter((ask) => ask.chatId !== chatId),
            );
            setPendingOCPermissions((prev) =>
                prev.filter((p) => p.chatId !== chatId),
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
            // Invalidate chats to update dropdown list in standalone window
            queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
        });
        return () => unsubscribe();
    }, [setPendingAgentConsents, setPendingAskUsers, setPendingOCPermissions, setAgentTodosByChatId, serverReady, settings?.selectedChatMode, hasPendingPrompt, isPreviewOpen, setIsPreviewOpen]);

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
                    chatId={chatId ?? undefined}
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
                {serverReady && <ActionHeader />}
                <div className="flex-1 min-h-0">
                    {serverReady ? (
                        <PreviewPanel />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-6">
                            <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                            <p className="text-sm text-center">
                                Generando proyecto…<br />
                                <span className="text-xs text-muted-foreground/60">
                                    La vista previa aparecerá cuando el agente termine
                                </span>
                            </p>
                        </div>
                    )}
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
                            "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 cursor-col-resize",
                            isPreviewExpanded && "invisible",
                        )}
                        disabled={isPreviewExpanded}
                    >
                        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border dark:bg-zinc-800">
                            <GripVertical className="h-2.5 w-2.5 text-zinc-500" />
                        </div>
                    </PanelResizeHandle>
                    {chatPosition === "left" ? previewPanelNode : chatPanelNode}
                    <ArtifactSidebar />
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
            <ThemeProvider>
                <AuthGate>
                    {/* @ts-ignore — minimal router type doesn't match full app router, but it's safe */}
                    <RouterProvider router={chatRouter} />
                </AuthGate>
            </ThemeProvider>
        </QueryClientProvider>
    );
}
