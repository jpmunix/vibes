import { SidebarProvider } from "@/components/ui/sidebar";
import { TopNavbar, SecondarySidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "../contexts/ThemeContext";
import { DeepLinkProvider } from "../contexts/DeepLinkContext";
import { Toaster } from "sonner";
import { TitleBar } from "./TitleBar";
import { isElectron } from "@/lib/transport";
import { useEffect, useRef, lazy, Suspense, type ReactNode } from "react";
import { useRunApp, useAppOutputSubscription } from "@/hooks/useRunApp";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { showWarning } from "@/lib/toast";

import { useAtomValue, useSetAtom } from "jotai";
import {
  appConsoleEntriesAtom,
  previewModeAtom,
  selectedAppIdAtom,
} from "@/atoms/appAtoms";
import { chatInputValueAtom } from "@/atoms/chatAtoms";
import { selectedComponentsPreviewAtom } from "@/atoms/previewAtoms";
import { ipc } from "@/ipc/types";
import { useSettings } from "@/hooks/useSettings";
import { getColorById, adjustChroma, DEFAULT_LIGHT_COLOR, DEFAULT_DARK_COLOR } from "@/components/PrimaryColorPicker";
import type { ZoomLevel } from "@/lib/schemas";

const OpenRouterSetupWizard = lazy(() =>
  import("@/components/onboarding/OpenRouterSetupWizard").then(m => ({ default: m.OpenRouterSetupWizard }))
);

// Routes that can be restored on startup
const RESTORABLE_ROUTES = ["/"];
const PREF_LAST_VIEW = "app.lastView";

const DEFAULT_ZOOM_LEVEL: ZoomLevel = "100";

export default function RootLayout({ children }: { children: ReactNode }) {
  const { refreshAppIframe } = useRunApp();
  // Subscribe to app output events once at the root level to avoid duplicates
  useAppOutputSubscription();

  const previewMode = useAtomValue(previewModeAtom);
  const { settings } = useSettings();
  const setSelectedComponentsPreview = useSetAtom(
    selectedComponentsPreviewAtom,
  );
  const setChatInput = useSetAtom(chatInputValueAtom);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const setConsoleEntries = useSetAtom(appConsoleEntriesAtom);

  const navigate = useNavigate();
  const routerState = useRouterState();
  const restoredRef = useRef(false);
  const initializedRef = useRef(false); // true after initial DB read completes
  const lastSavedViewRef = useRef<string | null>(null);

  // Restore last view on startup from remote DB (Bunny Edge SQL).
  // Also initializes lastSavedViewRef so the persist effect doesn't write redundantly.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    ipc.misc.getPreference({ key: PREF_LAST_VIEW }).then((raw) => {
      // Initialize the ref with the DB value to prevent redundant writes
      if (raw) lastSavedViewRef.current = raw;
      initializedRef.current = true; // unblock persist effect

      // Only restore if we're still at the root (hasn't navigated yet)
      if (routerState.location.pathname !== "/") return;

      let targetRoute = raw;
      if (raw === "/todos" || raw === "/notas") {
        targetRoute = "/";
      }

      if (targetRoute && RESTORABLE_ROUTES.includes(targetRoute) && targetRoute !== "/") {
        navigate({ to: targetRoute as any, replace: true });
      }
    }).catch(() => {
      initializedRef.current = true; // unblock even on error
    });
  }, []);

  // Persist current view to remote DB on route change (only if actually changed)
  useEffect(() => {
    // Don't write until the initial DB read has completed (avoids race condition)
    if (!initializedRef.current) return;

    const pathname = routerState.location.pathname;
    // Only persist restorable routes
    const base = RESTORABLE_ROUTES.find((r) =>
      r === "/" ? pathname === "/" : pathname.startsWith(r),
    );
    if (!base) return;

    // Skip write if the value hasn't changed
    if (base === lastSavedViewRef.current) return;
    lastSavedViewRef.current = base;

    // Persist to remote DB preference (Bunny Edge SQL)
    ipc.misc.setPreference({ key: PREF_LAST_VIEW, value: base }).catch(() => {});
  }, [routerState.location.pathname]);

  useEffect(() => {
    const zoomLevel = settings?.zoomLevel ?? DEFAULT_ZOOM_LEVEL;
    const zoomFactor = Number(zoomLevel) / 100;

    const electronApi = (
      window as Window & {
        electron?: {
          webFrame?: {
            setZoomFactor: (factor: number) => void;
          };
        };
      }
    ).electron;

    if (electronApi?.webFrame?.setZoomFactor) {
      electronApi.webFrame.setZoomFactor(zoomFactor);

      return () => {
        electronApi.webFrame?.setZoomFactor(Number(DEFAULT_ZOOM_LEVEL) / 100);
      };
    }

    return () => { };
  }, [settings?.zoomLevel]);

  // Apply user's primary color on startup
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
  // Global keyboard listener for refresh events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+R (Windows/Linux) or Cmd+R (macOS)
      if (event.key === "r" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault(); // Prevent default browser refresh
        if (previewMode === "preview") {
          refreshAppIframe(); // Use our custom refresh function instead
        }
      }
    };

    // Add event listener to document
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup function to remove event listener
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [refreshAppIframe, previewMode]);

  useEffect(() => {
    setChatInput("");
    setSelectedComponentsPreview([]);
    setConsoleEntries([]);
  }, [selectedAppId]);

  // ── Model migration toast ──────────────────────────────────────────────
  // When the boot-time validator replaces stale OpenRouter models, notify
  // the user so they're aware — especially for hidden settings they
  // wouldn't otherwise check (standardModeModel, memory models, etc.)
  useEffect(() => {
    const unsubscribe = window.electron?.ipcRenderer?.on(
      "models:migrated" as any,
      (data: { changes: string[] }) => {
        if (data?.changes?.length) {
          showWarning(
            `Algunos modelos de IA ya no están disponibles en OpenRouter y fueron reemplazados automáticamente:\n\n${data.changes.join("\n")}`,
          );
        }
      },
    );
    return () => { unsubscribe?.(); };
  }, []);

  return (
    <>
      <ThemeProvider>
        <DeepLinkProvider>
          {/* Blocking wizard: shown after login if OpenRouter is not configured */}
          <Suspense fallback={null}>
            <OpenRouterSetupWizard />
          </Suspense>
          <SidebarProvider>
            <TitleBar />
            {/* Layout: TitleBar (fixed 44px, Electron only) → TopNavbar (40px) → [SecondarySidebar + Content] */}
            <div className={`flex flex-col w-full ${isElectron ? "h-[calc(100vh-44px)] mt-11" : "h-screen"}`}>
              <TopNavbar />
              <div className="flex flex-1 min-h-0 overflow-hidden">
                <SecondarySidebar />
                <div
                  id="layout-main-content-container"
                  className="flex flex-1 min-h-0 w-full overflow-x-hidden bg-background"
                >
                  {children}
                </div>
              </div>
            </div>
            <Toaster richColors />
          </SidebarProvider>
        </DeepLinkProvider>
      </ThemeProvider>
    </>
  );
}
