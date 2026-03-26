/**
 * AuthGate — Controls the auth flow for the entire application.
 *
 * Flow:
 * 1. Check localStorage for existing session → verify against remote DB
 * 2. If no session or invalid → show LoginScreen
 * 3. If session valid → render children (the app)
 *
 * Logout anywhere in the app → clears session → AuthGate shows LoginScreen again.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useAtom } from "jotai";
import { userAtom, authLoadingAtom } from "@/atoms/authAtoms";
import type { VibesUser } from "@/atoms/authAtoms";
import { ipc } from "@/ipc/types";
import { LoginScreen } from "./LoginScreen";
import { WindowsControls } from "./WindowsControls";

// Apply the user's saved theme immediately (before ThemeProvider loads inside the app)
function applyEarlyTheme() {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | "system" | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = savedTheme === "dark" || (savedTheme !== "light" && prefersDark);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(isDark ? "dark" : "light");
}

interface AuthGateProps {
    children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
    const [user, setUser] = useAtom(userAtom);
    const [isLoading, setIsLoading] = useAtom(authLoadingAtom);


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
            }
        };

        checkSession();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setUser, setIsLoading]);

    // Watch for logout - only wipe if user explicitly sets it to null
    useEffect(() => {
        if (!isLoading && user === null) {
            localStorage.removeItem("vibes_user_id");
            localStorage.removeItem("vibes_session_token");
        }
    }, [user, isLoading]);

    // Loading state — show splash
    if (isLoading) {
        return (
            <>
                <WindowsControls className="absolute top-0 right-0 z-[100]" buttonClassName="h-11" />
                <AuthSplash />
            </>
        );
    }

    // Not authenticated — show login screen
    if (!user) {
        return (
            <>
                <WindowsControls className="absolute top-0 right-0 z-[100]" buttonClassName="h-11" />
                <LoginScreen
                    onAuthSuccess={() => {}}
                />
            </>
        );
    }

    // Authenticated — render application
    return <>{children}</>;
}

/**
 * Splash screen shown while verifying the session on app launch.
 * Uses inline styles for immediate rendering (no CSS deps).
 */
function AuthSplash() {
    return (
        <div className="flex flex-col items-center justify-center h-screen w-full bg-background app-region-drag">
            <div className="w-12 h-12 border-3 border-border border-t-primary rounded-full animate-spin" />
            <p className="mt-5 text-muted-foreground text-sm font-medium">
                Cargando...
            </p>
        </div>
    );
}
