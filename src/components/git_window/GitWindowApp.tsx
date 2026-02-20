import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import {
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { getColorById, adjustChroma, DEFAULT_LIGHT_COLOR, DEFAULT_DARK_COLOR } from "@/components/PrimaryColorPicker";
import { useSettings } from "@/hooks/useSettings";
import { GitPanel } from "@/components/GitPanel";

import "@/styles/globals.css";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 10_000, retry: false },
        mutations: { retry: false },
    },
});

interface GitWindowAppProps {
    appId: number;
    commitHash?: string;
}

function GitWindowContent({ appId, commitHash }: GitWindowAppProps) {
    const setSelectedAppId = useSetAtom(selectedAppIdAtom);
    const { settings } = useSettings();

    // Apply primary colors from settings (same as DatabaseWindowApp)
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

    return (
        <TooltipProvider>
            <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
                <GitPanel
                    onClose={() => window.close()}
                    initialTab="history"
                    initialCommitHash={commitHash}
                />
            </div>
        </TooltipProvider>
    );
}

export function GitWindowApp({ appId, commitHash }: GitWindowAppProps) {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <GitWindowContent appId={appId} commitHash={commitHash} />
            </ThemeProvider>
        </QueryClientProvider>
    );
}
