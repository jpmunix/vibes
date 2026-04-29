import { useEffect, useState, useCallback, useRef } from "react";
import {
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { getColorById, adjustChroma, DEFAULT_LIGHT_COLOR, DEFAULT_DARK_COLOR } from "@/components/PrimaryColorPicker";
import { useSettings } from "@/hooks/useSettings";
import { WindowsControls } from "@/components/WindowsControls";
import {
    ShieldCheck,
    Loader2,
    ShieldAlert,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import { AdminListUsers } from "@/components/admin_window/AdminListUsers";
import { AdminListApps } from "@/components/admin_window/AdminListApps";
import { AdminApiKeys } from "@/components/admin_window/AdminApiKeys";
import { AdminKnowledgeBase } from "@/components/admin_window/AdminKnowledgeBase";

import "@/styles/globals.css";

import { isAdmin } from "@/lib/admin";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 10_000, retry: false },
        mutations: { retry: false },
    },
});

// ─── Navigation structure (flat, like Settings) ─────────────────────────────

interface NavItem {
    id: string;
    label: string;
}

const NAV_ITEMS: NavItem[] = [
    { id: "usuarios", label: "Usuarios" },
    { id: "aplicaciones", label: "Aplicaciones" },
    { id: "ajustes", label: "Ajustes y preferencias" },
    { id: "conocimientos", label: "Base de conocimientos" },
    { id: "apikeys", label: "API Keys" },
];

// ─── Admin Panel Layout ──────────────────────────────────────────────────────

function AdminPanel() {
    const [activeItem, setActiveItem] = useState<string>(NAV_ITEMS[0].id);

    // ── Resizable sidebar ──
    const [sidebarWidth, setSidebarWidth] = useState(220);
    const isResizingRef = useRef(false);

    const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizingRef.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const onMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = Math.max(180, Math.min(360, moveEvent.clientX));
            setSidebarWidth(newWidth);
        };

        const onMouseUp = () => {
            isResizingRef.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }, []);

    return (
        <div className="flex flex-1 min-h-0">
            {/* ── Sidebar ── */}
            <div
                className="flex flex-col shrink-0 bg-(--sidebar) border-r border-border overflow-hidden"
                style={{ width: sidebarWidth }}
            >
                <div className="flex-1 overflow-y-auto space-y-1 p-4">
                    {NAV_ITEMS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={cn(
                                "w-full text-left px-3 py-2 rounded-md transition-colors typo-menu-item cursor-pointer",
                                activeItem === item.id
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground opacity-100"
                                    : "hover:bg-sidebar-accent opacity-75 hover:opacity-100",
                            )}
                            onClick={() => setActiveItem(item.id)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Resize handle ── */}
            <div
                className="relative shrink-0 cursor-col-resize group"
                style={{ width: 6 }}
                onMouseDown={onResizeMouseDown}
            >
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent group-hover:bg-primary/40 transition-colors" />
            </div>

            {/* ── Content area ── */}
            <div className="flex-1 min-w-0 overflow-y-auto bg-background">
                <AdminContent activeItem={activeItem} />
            </div>
        </div>
    );
}

// ─── Content router ──────────────────────────────────────────────────────────

function AdminContent({ activeItem }: { activeItem: string }) {
    switch (activeItem) {
        case "usuarios":
            return <AdminListUsers />;
        case "aplicaciones":
            return <AdminListApps />;
        case "apikeys":
            return <AdminApiKeys />;
        case "conocimientos":
            return <AdminKnowledgeBase />;
        default: {
            const item = NAV_ITEMS.find((i) => i.id === activeItem);
            return (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                    <span className="text-sm opacity-60">{item?.label ?? activeItem}</span>
                </div>
            );
        }
    }
}

// ─── Window shell (auth + chrome) ────────────────────────────────────────────

function AdminWindowContent() {
    const { settings } = useSettings();
    const [authState, setAuthState] = useState<"loading" | "authorized" | "denied">("loading");

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

    // Auth check: verify the current user is the admin
    useEffect(() => {
        try {
            const raw = localStorage.getItem("vibes_user");
            if (!raw) { setAuthState("denied"); return; }
            const user = JSON.parse(raw);
            setAuthState(isAdmin(user?.id) ? "authorized" : "denied");
        } catch {
            setAuthState("denied");
        }
    }, []);

    useEffect(() => { document.title = "Admin"; }, []);

    // ── Loading state ──
    if (authState === "loading") {
        return (
            <TooltipProvider>
                <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
                    <TitleBar label="Admin" icon={ShieldCheck} iconClass="text-primary" />
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 size={24} className="animate-spin text-muted-foreground" />
                    </div>
                </div>
            </TooltipProvider>
        );
    }

    // ── Denied state ──
    if (authState === "denied") {
        return (
            <TooltipProvider>
                <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
                    <TitleBar label="Acceso denegado" icon={ShieldAlert} iconClass="text-destructive" />
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
                        <ShieldAlert size={48} className="text-destructive/60" />
                        <h2 className="text-lg font-semibold text-foreground">Acceso denegado</h2>
                        <p className="text-sm text-muted-foreground text-center max-w-md">
                            No tienes permisos para acceder al panel de administración.
                        </p>
                        <button
                            onClick={() => window.close()}
                            className="mt-4 px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
                        >
                            Cerrar ventana
                        </button>
                    </div>
                </div>
            </TooltipProvider>
        );
    }

    // ── Authorized ──
    return (
        <TooltipProvider>
            <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
                <TitleBar label="Admin" icon={ShieldCheck} iconClass="text-primary" />
                <AdminPanel />
            </div>
        </TooltipProvider>
    );
}

// ─── Reusable title bar ──────────────────────────────────────────────────────

function TitleBar({
    label,
    icon: Icon,
    iconClass = "text-muted-foreground",
}: {
    label: string;
    icon: React.ElementType;
    iconClass?: string;
}) {
    return (
        <div className="app-region-drag flex items-center justify-between px-3 h-9 bg-(--sidebar) border-b border-border shrink-0">
            <div className="flex items-center gap-2 no-app-region-drag">
                <Icon size={14} className={iconClass} />
                <span className="typo-button">{label}</span>
            </div>
            <WindowsControls className="no-app-region-drag pr-0 pointer-events-auto" buttonClassName="h-9" />
        </div>
    );
}

// ─── Root export ─────────────────────────────────────────────────────────────

export function AdminWindowApp() {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <AdminWindowContent />
                <Toaster richColors />
            </ThemeProvider>
        </QueryClientProvider>
    );
}
