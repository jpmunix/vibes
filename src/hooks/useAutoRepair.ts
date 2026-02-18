import { useCallback, useEffect, useRef } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
    autoRepairStateAtom,
    MAX_AUTO_REPAIR_ATTEMPTS,
    AUTO_REPAIR_WATCH_WINDOW_MS,
} from "@/atoms/autoRepairAtoms";
import { appConsoleEntriesAtom, selectedAppIdAtom } from "@/atoms/appAtoms";
import { isStreamingByIdAtom } from "@/atoms/chatAtoms";
import {
    showAutoRepairToast,
    dismissAutoRepairToast,
} from "@/lib/toast";
import { useSettings } from "./useSettings";

/**
 * Patterns that indicate a Vite/esbuild/TypeScript compilation error in stderr.
 * These appear INSTANTLY when Vite detects a change, without needing the iframe.
 */
const ERROR_PATTERNS = [
    "Failed to resolve import",
    "Module not found",
    "SyntaxError:",
    "[vite] Internal server error",
    "✘ [ERROR]",
    "error TS",
    "Cannot find module",
    "is not defined",
    "Unexpected token",
    "Failed to parse source",
    "Transform failed",
    "Build failed",
    "Could not resolve",
    "does not provide an export named",
    "is not exported from",
];

/**
 * Patterns that are false positives / noise from npm/Vite
 * that should NOT trigger auto-repair.
 */
const IGNORE_PATTERNS = [
    "npm warn",
    "npm notice",
    "WARN deprecated",
    "peer dep missing",
    "ExperimentalWarning",
    "DeprecationWarning",
    "node --trace-deprecation",
    "hmr update",
    "page reload",
    "optimized dependencies changed",
    "new dependencies optimized",
    "Pre-bundling",
];

/**
 * Check if a stderr message looks like a compilation error from Vite.
 */
function isCompilationError(message: string): boolean {
    // Skip known false positives
    if (IGNORE_PATTERNS.some((p) => message.includes(p))) {
        return false;
    }
    return ERROR_PATTERNS.some((p) => message.includes(p));
}

/**
 * Extract a clean error summary from a stderr message.
 * Tries to get the most useful part of multi-line error output.
 */
function extractErrorSummary(message: string): string {
    const lines = message.split("\n").filter((l) => l.trim());
    for (const line of lines) {
        if (ERROR_PATTERNS.some((p) => line.includes(p))) {
            return line.trim().slice(0, 500);
        }
    }
    return lines[0]?.trim().slice(0, 500) ?? message.slice(0, 500);
}

/**
 * Hook that monitors the app's stderr output (via appConsoleEntriesAtom)
 * for compilation errors and exposes callbacks to trigger auto-repair.
 *
 * The repair itself is triggered by calling the `streamMessage` function
 * from `useStreamChat`, which is connected externally.
 *
 * Flow:
 * 1. useStreamChat onEnd calls activateMonitoring()
 * 2. This hook watches appConsoleEntriesAtom for new stderr errors
 * 3. When an error is detected, pendingRepairPrompt is set
 * 4. The parent component reads pendingRepairPrompt and calls streamMessage
 * 5. When repair stream ends, onRepairStreamEnd is called to check results
 */
export function useAutoRepair() {
    const [repairState, setRepairState] = useAtom(autoRepairStateAtom);
    const consoleEntries = useAtomValue(appConsoleEntriesAtom);
    const selectedAppId = useAtomValue(selectedAppIdAtom);
    const isStreamingById = useAtomValue(isStreamingByIdAtom);
    const { settings } = useSettings();

    // Refs to avoid stale closures
    const repairStateRef = useRef(repairState);
    repairStateRef.current = repairState;

    const consoleEntriesLengthRef = useRef(consoleEntries.length);
    const watchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Ref to hold the streamMessage function set externally
    const streamMessageRef = useRef<
        | ((params: {
            prompt: string;
            chatId: number;
            isSystemPrompt?: boolean;
        }) => void)
        | null
    >(null);

    /**
     * Register the streamMessage function from useStreamChat.
     * Called by the parent component to wire up the repair action.
     */
    const setStreamMessage = useCallback(
        (
            fn: (params: {
                prompt: string;
                chatId: number;
                isSystemPrompt?: boolean;
            }) => void,
        ) => {
            streamMessageRef.current = fn;
        },
        [],
    );

    /**
     * Called by useStreamChat when a stream ends with updatedFiles=true.
     * Activates the monitoring window.
     */
    const activateMonitoring = useCallback(
        (chatId: number) => {
            // Don't activate if auto-repair is disabled
            if (!settings?.enableAutoRepairRuntimeErrors) return;
            // Don't activate if already repairing
            if (repairStateRef.current.repairing) return;

            // Snapshot the current console entries length so we only look at NEW entries
            consoleEntriesLengthRef.current = consoleEntries.length;

            setRepairState((prev) => ({
                ...prev,
                watching: true,
                chatId,
                watchStartedAt: Date.now(),
            }));

            // Auto-close the monitoring window after the timeout
            if (watchTimerRef.current) {
                clearTimeout(watchTimerRef.current);
            }
            watchTimerRef.current = setTimeout(() => {
                setRepairState((prev) => ({
                    ...prev,
                    watching: false,
                    watchStartedAt: null,
                }));
            }, AUTO_REPAIR_WATCH_WINDOW_MS);
        },
        [
            settings?.enableAutoRepairRuntimeErrors,
            consoleEntries.length,
            setRepairState,
        ],
    );

    /**
     * Reset the auto-repair state. Called when the user sends a new message.
     */
    const resetAutoRepair = useCallback(() => {
        if (watchTimerRef.current) {
            clearTimeout(watchTimerRef.current);
            watchTimerRef.current = null;
        }
        setRepairState({
            watching: false,
            repairing: false,
            attempts: 0,
            chatId: null,
            watchStartedAt: null,
            lastDetectedError: null,
        });
        dismissAutoRepairToast();
    }, [setRepairState]);

    // Main effect: watch for new stderr entries when monitoring is active
    useEffect(() => {
        if (!repairState.watching || repairState.repairing) return;
        if (!repairState.chatId) return;
        if (repairState.attempts >= MAX_AUTO_REPAIR_ATTEMPTS) {
            // Max attempts reached, stop watching
            setRepairState((prev) => ({
                ...prev,
                watching: false,
            }));
            return;
        }

        // Check if there's already a stream in progress for this chat
        const isCurrentlyStreaming = isStreamingById.get(repairState.chatId);
        if (isCurrentlyStreaming) return;

        // Only look at entries added AFTER monitoring started
        const newEntries = consoleEntries.slice(consoleEntriesLengthRef.current);

        // Look for stderr entries that match compilation error patterns
        for (const entry of newEntries) {
            if (entry.level !== "error") continue;
            if (entry.appId !== selectedAppId) continue;

            if (isCompilationError(entry.message)) {
                const errorSummary = extractErrorSummary(entry.message);

                // Don't re-trigger on the exact same error
                if (errorSummary === repairState.lastDetectedError) continue;

                console.log(
                    `[AutoRepair] Detected compilation error (attempt ${repairState.attempts + 1}/${MAX_AUTO_REPAIR_ATTEMPTS}):`,
                    errorSummary,
                );

                // Stop watching and start repairing
                if (watchTimerRef.current) {
                    clearTimeout(watchTimerRef.current);
                    watchTimerRef.current = null;
                }

                const newAttempt = repairState.attempts + 1;

                setRepairState((prev) => ({
                    ...prev,
                    watching: false,
                    repairing: true,
                    attempts: newAttempt,
                    lastDetectedError: errorSummary,
                }));

                // Show the repair toast
                showAutoRepairToast({
                    status: "repairing",
                    attempt: newAttempt,
                    maxAttempts: MAX_AUTO_REPAIR_ATTEMPTS,
                    errorMessage: errorSummary,
                });

                // Trigger the AI fix via the registered streamMessage
                if (streamMessageRef.current) {
                    streamMessageRef.current({
                        prompt: `Fix this compilation error that appeared in the app's dev server output:\n\n\`\`\`\n${entry.message}\n\`\`\`\n\nPlease fix the root cause of this error.`,
                        chatId: repairState.chatId,
                        isSystemPrompt: true,
                    });
                } else {
                    console.error(
                        "[AutoRepair] streamMessage not registered. Cannot trigger repair.",
                    );
                    setRepairState((prev) => ({
                        ...prev,
                        repairing: false,
                        watching: false,
                    }));
                }

                // Exit after first error found (one fix at a time)
                return;
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- we intentionally
        // depend on .length instead of the full array to avoid re-running on every
        // mutation. The effect uses consoleEntriesLengthRef to scan only new entries.
    }, [
        consoleEntries.length,
        repairState,
        selectedAppId,
        isStreamingById,
        setRepairState,
    ]);

    /**
     * Called when the repair stream ends.
     * Determines if repair was successful or if we need another attempt.
     */
    const onRepairStreamEnd = useCallback(
        (updatedFiles: boolean) => {
            if (!repairStateRef.current.repairing) return;

            if (updatedFiles) {
                // AI finished its part. Show success immediately to the user.
                showAutoRepairToast({ status: "success" });

                // Files were updated, re-activate monitoring to check if the fix worked
                const chatId = repairStateRef.current.chatId;

                setRepairState((prev) => ({
                    ...prev,
                    repairing: false,
                }));

                // Snapshot the console entries AFTER the repair
                consoleEntriesLengthRef.current = consoleEntries.length;

                if (
                    chatId &&
                    repairStateRef.current.attempts < MAX_AUTO_REPAIR_ATTEMPTS
                ) {
                    // Re-activate monitoring to see if the fix worked
                    setRepairState((prev) => ({
                        ...prev,
                        watching: true,
                        watchStartedAt: Date.now(),
                    }));

                    if (watchTimerRef.current) {
                        clearTimeout(watchTimerRef.current);
                    }

                    // Wait for Vite to recompile. If another error appears during this window,
                    // the useEffect will trigger a new repair cycle.
                    watchTimerRef.current = setTimeout(() => {
                        // Just stop watching after the timeout
                        setRepairState((prev) => ({
                            ...prev,
                            watching: false,
                            watchStartedAt: null,
                        }));
                    }, AUTO_REPAIR_WATCH_WINDOW_MS);
                } else {
                    // Max attempts reached or no chatId
                    setRepairState((prev) => ({
                        ...prev,
                        watching: false,
                        watchStartedAt: null,
                    }));
                }
            } else {
                // No files were updated (AI couldn't generate a fix)
                showAutoRepairToast({
                    status: "failed",
                    attempt: repairStateRef.current.attempts,
                    maxAttempts: MAX_AUTO_REPAIR_ATTEMPTS,
                    errorMessage: repairStateRef.current.lastDetectedError ?? undefined,
                });
                setRepairState((prev) => ({
                    ...prev,
                    repairing: false,
                    watching: false,
                    watchStartedAt: null,
                }));
            }
        },
        [consoleEntries.length, setRepairState],
    );

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (watchTimerRef.current) {
                clearTimeout(watchTimerRef.current);
            }
        };
    }, []);

    return {
        activateMonitoring,
        resetAutoRepair,
        onRepairStreamEnd,
        setStreamMessage,
        isRepairing: repairState.repairing,
        isWatching: repairState.watching,
    };
}
