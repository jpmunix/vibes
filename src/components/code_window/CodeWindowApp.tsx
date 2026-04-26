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
import { CodeView } from "@/components/preview_panel/CodeView";
import { WindowsControls } from "@/components/WindowsControls";
import { Code } from "@/components/ui/icons";
import { ipc } from "@/ipc/types";
import { Toaster } from "sonner";

import "@/styles/globals.css";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 10_000, retry: false },
        mutations: { retry: false },
    },
});

interface CodeWindowAppProps {
    appId: number;
}

function CodeWindowContent({ appId }: CodeWindowAppProps) {
    const setSelectedAppId = useSetAtom(selectedAppIdAtom);
    const currentApp = useAtomValue(currentAppAtom);
    const { settings } = useSettings();
    const { app, loading } = useLoadApp(appId);

    // Apply primary colors from settings (same as other window apps)
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
            document.title = `${currentApp.name} – Archivos`;
        } else {
            ipc.app.getApp(appId).then((fetchedApp) => {
                if (fetchedApp?.name) document.title = `${fetchedApp.name} – Archivos`;
            }).catch(() => {});
        }
    }, [appId, currentApp?.name]);

    return (
        <TooltipProvider>
            <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
                {/* ── Window title bar (drag region) — same pattern as GitPanel ── */}
                <div className="app-region-drag flex items-center justify-between px-3 h-9 bg-(--sidebar) border-b border-border shrink-0">
                    <div className="flex items-center gap-2 no-app-region-drag">
                        <Code size={14} className="text-primary" />
                        <span className="typo-button">
                            {currentApp?.name ? `${currentApp.name} – Archivos` : "Archivos"}
                        </span>
                    </div>
                    <WindowsControls className="no-app-region-drag pr-0 pointer-events-auto" buttonClassName="h-9" />
                </div>
                {/* Code view fills remaining space */}
                <div className="flex-1 min-h-0">
                    <CodeView loading={loading} app={app ?? null} />
                </div>
            </div>
        </TooltipProvider>
    );
}

export function CodeWindowApp({ appId }: CodeWindowAppProps) {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <CodeWindowContent appId={appId} />
                <Toaster richColors />
            </ThemeProvider>
        </QueryClientProvider>
    );
}
