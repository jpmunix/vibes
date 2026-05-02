import { useEffect } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import { selectedAppIdAtom, currentAppAtom } from "@/atoms/appAtoms";
import {
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { getColorById, adjustChroma, DEFAULT_LIGHT_COLOR, DEFAULT_DARK_COLOR } from "@/components/PrimaryColorPicker";
import { useSettings } from "@/hooks/useSettings";
import { useLoadApp } from "@/hooks/useLoadApp";
import { MemoryPanel } from "@/components/MemoryPanel";
import { WindowsControls } from "@/components/WindowsControls";
import { Database } from "@/components/ui/icons";
import { ipc } from "@/ipc/types";
import { Toaster } from "sonner";

import "@/styles/globals.css";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 10_000, retry: false },
        mutations: { retry: false },
    },
});

interface MemoryWindowAppProps {
    appId: number;
}

function MemoryWindowContent({ appId }: MemoryWindowAppProps) {
    const setSelectedAppId = useSetAtom(selectedAppIdAtom);
    const currentApp = useAtomValue(currentAppAtom);
    const { settings } = useSettings();
    const { app } = useLoadApp(appId);

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

    useEffect(() => {
        setSelectedAppId(appId);
    }, [appId, setSelectedAppId]);

    // Set window title from app name
    useEffect(() => {
        if (currentApp?.name) {
            document.title = `${currentApp.name} – Memorias del agente`;
        } else {
            ipc.app.getApp(appId).then((fetchedApp) => {
                if (fetchedApp?.name) document.title = `${fetchedApp.name} – Memorias del agente`;
            }).catch(() => {});
        }
    }, [appId, currentApp?.name]);

    return (
        <TooltipProvider>
            <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
                {/* ── Window title bar (drag region) — same pattern as GitPanel/CodeWindowApp ── */}
                <div className="app-region-drag flex items-center justify-between px-3 h-9 bg-(--sidebar) border-b border-border shrink-0">
                    <div className="flex items-center gap-2 no-app-region-drag">
                        <Database size={14} className="text-primary" />
                        <span className="typo-button">
                            {currentApp?.name ? `${currentApp.name} – Memorias del agente` : "Memorias del agente"}
                        </span>
                    </div>
                    <WindowsControls className="no-app-region-drag pr-0 pointer-events-auto" buttonClassName="h-9" />
                </div>
                {/* Panel with padding */}
                <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
                    <MemoryPanel appId={appId} />
                </div>
            </div>
        </TooltipProvider>
    );
}

export function MemoryWindowApp({ appId }: MemoryWindowAppProps) {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <MemoryWindowContent appId={appId} />
                <Toaster richColors />
            </ThemeProvider>
        </QueryClientProvider>
    );
}
