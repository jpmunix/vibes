import { useEffect, useState } from "react";
import { useSetAtom } from "jotai";
import { selectedAppIdAtom, currentAppAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { DatabasePanel } from "@/components/database/DatabasePanel";
import { ThemeProvider } from "@/contexts/ThemeContext";
import {
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";

import "@/index.css";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 30_000, retry: false },
        mutations: { retry: false },
    },
});

function DatabaseWindowContent({ appId }: { appId: number }) {
    const setSelectedAppId = useSetAtom(selectedAppIdAtom);
    const setCurrentApp = useSetAtom(currentAppAtom);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setSelectedAppId(appId);

        // Load the app data so currentAppAtom has supabaseProjectId
        ipc.app
            .getApp(appId)
            .then((app) => {
                setCurrentApp(app);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [appId, setSelectedAppId, setCurrentApp]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-background">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="h-screen bg-background text-foreground">
            <DatabasePanel />
        </div>
    );
}

export function DatabaseWindowApp({ appId }: { appId: number }) {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <DatabaseWindowContent appId={appId} />
                <Toaster richColors />
            </ThemeProvider>
        </QueryClientProvider>
    );
}
