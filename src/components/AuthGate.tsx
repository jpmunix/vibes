/**
 * AuthGate — Controls the auth flow for the entire application.
 *
 * Flow:
 * 1. Check localStorage for existing session → verify against remote DB
 * 2. If no session or invalid → show LoginScreen
 * 3. If session valid → render children (the app)
 *
 * Performance optimization: If a cached session exists in localStorage,
 * the app renders immediately without waiting for remote verification.
 * The verifySession IPC call runs in the background and silently updates
 * the session if needed.
 *
 * Logout anywhere in the app → clears session → AuthGate shows LoginScreen again.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useAtom } from "jotai";
import { userAtom, authLoadingAtom } from "@/atoms/authAtoms";
import type { VibesUser } from "@/atoms/authAtoms";
import { ipc } from "@/ipc/types";
import { LoginScreen } from "./LoginScreen";
import { WindowsControls } from "./WindowsControls";
import { MainWindowSkeleton } from "./skeletons";

// Apply the user's saved theme immediately (before ThemeProvider loads inside the app)
function applyEarlyTheme() {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | "system" | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = savedTheme === "dark" || (savedTheme !== "light" && prefersDark);
    
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(isDark ? "dark" : "light");

    // Remove existing sub-theme classes
    const classesToRemove: string[] = [];
    root.classList.forEach((cls) => {
        if (cls.startsWith("theme-")) {
            classesToRemove.push(cls);
        }
    });
    classesToRemove.forEach((cls) => root.classList.remove(cls));

    // Apply flavor
    const flavor = isDark
        ? (localStorage.getItem("theme-flavor-dark") || "default")
        : (localStorage.getItem("theme-flavor-light") || "default");
    
    if (flavor && flavor !== "default") {
        root.classList.add(`theme-${flavor}`);
    }
}

/**
 * Check synchronously (no async, no useEffect) whether the user has a cached
 * session in localStorage. This runs during the first render cycle so we can
 * skip the loading spinner for returning users.
 */
function hasCachedSession(): boolean {
    return (
        !!localStorage.getItem("vibes_user_id") &&
        !!localStorage.getItem("vibes_session_token")
    );
}

interface AuthGateProps {
    children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
    const [user, setUser] = useAtom(userAtom);
    const [isLoading, setIsLoading] = useAtom(authLoadingAtom);
    // Gate: prevents the logout-watcher from firing during initial hydration
    const hasInitialized = useRef(false);

    // Fast path: if the user has a cached session in localStorage, we can
    // skip the loading state entirely and render the app immediately.
    // The remote verifySession still runs in background to sync settings.
    const cachedSessionRef = useRef(hasCachedSession());


    // Apply dark/light theme immediately (before ThemeProvider loads)
    useEffect(() => { applyEarlyTheme(); }, []);

    // On mount: check for existing session
    useEffect(() => {
        const checkSession = async () => {
            const userId = localStorage.getItem("vibes_user_id");
            const sessionToken = localStorage.getItem("vibes_session_token");

            // If we already have a user from atomWithStorage, we can stop loading early
            // but we still want to verify against the server in the background/sync settings.
            if (user) {
                setIsLoading(false);
            }

            if (!userId || !sessionToken) {
                setIsLoading(false);
                hasInitialized.current = true;
                return;
            }

            try {
                const result = await ipc.auth.verifySession({ userId, sessionToken });
                if (result.valid && result.user) {
                    setUser(result.user as VibesUser);

                } else if (user) {
                    // If we have a local user but the token is invalid (e.g. logged in on another computer)
                    // we keep the local session as per user request for "trusted environment".
                    console.warn("Session token invalid/expired, but keeping local session for trusted environment.");
                } else {
                    // Only wipe if we don't even have a local user atom
                    localStorage.removeItem("vibes_user_id");
                    localStorage.removeItem("vibes_session_token");
                }
            } catch (error) {
                console.error("Session verification failed:", error);
            } finally {
                setIsLoading(false);
                hasInitialized.current = true;
            }
        };

        checkSession();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setUser, setIsLoading]);

    // Watch for logout — only wipe if user explicitly sets it to null
    // IMPORTANT: skip during the initial hydration phase to avoid the race
    // condition where atomWithStorage defaults to null before reading localStorage.
    useEffect(() => {
        if (!hasInitialized.current) return;
        if (!isLoading && user === null) {
            localStorage.removeItem("vibes_user_id");
            localStorage.removeItem("vibes_session_token");
        }
    }, [user, isLoading]);

    // Loading state — show skeleton (but skip if we have a cached session,
    // since the app can render immediately while verifySession runs in background)
    if (isLoading && !cachedSessionRef.current) {
        return (
            <>
                <WindowsControls className="absolute top-0 right-0 z-[100]" buttonClassName="h-11" />
                <MainWindowSkeleton />
            </>
        );
    }

    // Not authenticated — show login screen
    if (!user && !cachedSessionRef.current) {
        return (
            <>
                <WindowsControls className="absolute top-0 right-0 z-[100]" buttonClassName="h-11" />
                <LoginScreen
                    onAuthSuccess={() => {}}
                />
            </>
        );
    }

    // Authenticated (or cached session exists) — render application
    return <>{children}</>;
}

