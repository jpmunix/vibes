/**
 * DocsWindowApp — Dedicated documentation viewer window.
 *
 * Layout:
 *   TitleBar (draggable, with window controls)
 *   ├── DocsSidebar (tree navigation, resizable)
 *   └── DocsContent (article rendered from markdown)
 */

import { useEffect, useState, useRef, useCallback } from "react";
import {
    QueryClient,
    QueryClientProvider,
    useQuery,
} from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { getColorById, adjustChroma, DEFAULT_LIGHT_COLOR, DEFAULT_DARK_COLOR } from "@/components/PrimaryColorPicker";
import { useSettings } from "@/hooks/useSettings";
import { WindowsControls } from "@/components/WindowsControls";
import { BookOpen } from "@/components/ui/icons";
import { Toaster } from "sonner";
import { ipc } from "@/ipc/types";
import { DocsSidebar } from "./DocsSidebar";
import { DocsContent } from "./DocsContent";
import type { DocTreeNode } from "@/types/docsTypes";

import "@/styles/globals.css";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 60_000, retry: false },
        mutations: { retry: false },
    },
});

// ─── Title bar ──────────────────────────────────────────────────────────────

function TitleBar() {
    return (
        <div className="app-region-drag flex items-center justify-between px-3 h-9 bg-(--sidebar) border-b border-border shrink-0">
            <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-primary" />
                <span className="typo-button">Documentación</span>
            </div>
            <WindowsControls className="no-app-region-drag pr-0 pointer-events-auto" buttonClassName="h-9" />
        </div>
    );
}

// ─── Main content ───────────────────────────────────────────────────────────

function DocsWindowContent() {
    const { settings } = useSettings();
    const [activePath, setActivePath] = useState<string | null>(null);
    const [searchHighlight, setSearchHighlight] = useState<string | null>(null);
    const [scrollToAnchor, setScrollToAnchor] = useState<string | null>(null);

    // Navigate to a page, optionally highlighting search text or scrolling to anchor
    const handleNavigate = useCallback((relativePath: string, anchor?: string, query?: string) => {
        setSearchHighlight(query || null);
        setScrollToAnchor(anchor || null);
        setActivePath(relativePath);
    }, []);

    const handleHighlightDone = useCallback(() => setSearchHighlight(null), []);

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

    // Apply font scale CSS variables
    useEffect(() => {
        if (settings) {
            const root = document.documentElement;
            if (settings.fontScaleUI !== undefined) root.style.setProperty("--scale-ui", settings.fontScaleUI.toString());
            if (settings.fontScaleSidebar !== undefined) root.style.setProperty("--scale-sidebar", settings.fontScaleSidebar.toString());
            if (settings.fontScaleChat !== undefined) root.style.setProperty("--scale-chat", settings.fontScaleChat.toString());
        }
    }, [settings?.fontScaleUI, settings?.fontScaleSidebar, settings?.fontScaleChat]);

    const { applyFont } = useTheme();
    useEffect(() => {
        if (settings?.selectedFont) applyFont(settings.selectedFont);
    }, [settings?.selectedFont, applyFont]);

    useEffect(() => { document.title = "Documentación"; }, []);



    // Fetch the doc tree
    const { data: docTree, isLoading: treeLoading } = useQuery({
        queryKey: ["docTree"],
        queryFn: () => ipc.system.getDocTree(),
    });

    // Auto-select the first page when tree loads
    useEffect(() => {
        if (!activePath && docTree?.root) {
            const firstPage = findFirstPage(docTree.root);
            if (firstPage) setActivePath(firstPage.relativePath);
        }
    }, [docTree, activePath]);

    // ── Resizable sidebar ──
    const [sidebarWidth, setSidebarWidth] = useState(260);
    const isResizingRef = useRef(false);

    const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizingRef.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const onMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = Math.max(200, Math.min(400, moveEvent.clientX));
            setSidebarWidth(newWidth);
        };

        const onMouseUp = () => {
            isResizingRef.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);

            // Persist width preference
            ipc.misc.setPreference({ key: "docs.sidebarWidth", value: String(sidebarWidth) }).catch(() => { });
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }, [sidebarWidth]);

    // Restore sidebar width from preferences
    useEffect(() => {
        ipc.misc.getPreference({ key: "docs.sidebarWidth" }).then((raw) => {
            if (raw) {
                const w = Number(raw);
                if (w >= 200 && w <= 400) setSidebarWidth(w);
            }
        }).catch(() => { });
    }, []);

    return (
        <TooltipProvider>
            <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
                <TitleBar />
                <div className="flex flex-1 min-h-0">
                    {/* Sidebar */}
                    <div
                        className="flex flex-col shrink-0 bg-(--sidebar) border-r border-border overflow-hidden"
                        style={{ width: sidebarWidth }}
                    >
                        <DocsSidebar
                            tree={docTree?.root ?? null}
                            isLoading={treeLoading}
                            activePath={activePath}
                            onNavigate={handleNavigate}
                        />
                    </div>

                    {/* Resize handle */}
                    <div
                        className="relative shrink-0 cursor-col-resize group"
                        style={{ width: 6 }}
                        onMouseDown={onResizeMouseDown}
                    >
                        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent group-hover:bg-primary/40 transition-colors" />
                    </div>

                    {/* Content area */}
                    <div className="flex-1 min-w-0 overflow-y-auto bg-background">
                        <DocsContent
                            activePath={activePath}
                            searchHighlight={searchHighlight}
                            scrollToAnchor={scrollToAnchor}
                            onHighlightDone={handleHighlightDone}
                        />
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findFirstPage(node: DocTreeNode): DocTreeNode | null {
    if (node.type === "page") return node;
    if (node.children) {
        for (const child of node.children) {
            const found = findFirstPage(child);
            if (found) return found;
        }
    }
    return null;
}

// ─── Root export ─────────────────────────────────────────────────────────────

export function DocsWindowApp() {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <DocsWindowContent />
                <Toaster richColors />
            </ThemeProvider>
        </QueryClientProvider>
    );
}
