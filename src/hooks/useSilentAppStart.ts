import { useEffect, useRef } from "react";
import { useAtom, useAtomValue } from "jotai";
import { selectedAppIdAtom, appUrlAtom } from "@/atoms/appAtoms";
import { silentlyStartedAppsAtom } from "@/atoms/autoRepairAtoms";
import { ipc } from "@/ipc/types";
import { useSettings } from "./useSettings";

/**
 * Hook that silently starts the Vite dev server when the user enters
 * a chat for an app that hasn't been started yet.
 *
 * This ensures that:
 * 1. Stderr error detection works immediately (no need to open preview first)
 * 2. The app is always ready for instant preview if the user opens the preview tab
 * 3. HMR is active so errors from file changes are detected in real-time
 *
 * The "silent" start means:
 * - No loading spinner is shown
 * - No preview panel is opened
 * - The dev server runs in the background
 * - Only console entries will reflect its output
 *
 * The hook tracks which apps have already been silently started in this session
 * to avoid duplicate starts.
 *
 * IMPORTANT: Mount this hook ONCE in layout.tsx.
 */
export function useSilentAppStart({ enabled = true }: { enabled?: boolean } = {}) {
    const selectedAppId = useAtomValue(selectedAppIdAtom);
    const appUrlObj = useAtomValue(appUrlAtom);
    const [silentlyStartedApps, setSilentlyStartedApps] = useAtom(
        silentlyStartedAppsAtom,
    );
    const { settings } = useSettings();

    // Use ref to track in-progress starts to avoid race conditions
    const startingRef = useRef<Set<number>>(new Set<number>());

    useEffect(() => {
        if (!enabled) return;
        if (!selectedAppId) return;
        // Only if auto-repair is enabled (this is the main feature this supports)
        if (!settings?.enableAutoRepairRuntimeErrors) return;

        // If the app already has a URL, the dev server is already running
        if (appUrlObj.appUrl && appUrlObj.appId === selectedAppId) return;

        // If we already silently started this app in this session, skip
        if (silentlyStartedApps.has(selectedAppId)) return;

        // If we're already in the process of starting this app, skip
        if (startingRef.current.has(selectedAppId)) return;

        // Start the app silently
        const appId = selectedAppId;
        startingRef.current.add(appId);

        console.debug(`[SilentAppStart] Starting app ${appId} silently...`);

        ipc.app
            .runApp({ appId })
            .then(() => {
                console.debug(
                    `[SilentAppStart] App ${appId} started successfully in background`,
                );
                setSilentlyStartedApps((prev) => {
                    const next = new Set(prev);
                    next.add(appId);
                    return next;
                });
            })
            .catch((error) => {
                // Silently handle errors - don't bother the user
                console.warn(
                    `[SilentAppStart] Failed to start app ${appId} silently:`,
                    error,
                );
            })
            .finally(() => {
                startingRef.current.delete(appId);
            });
    }, [
        enabled,
        selectedAppId,
        appUrlObj.appUrl,
        appUrlObj.appId,
        silentlyStartedApps,
        settings?.enableAutoRepairRuntimeErrors,
        setSilentlyStartedApps,
    ]);
}
