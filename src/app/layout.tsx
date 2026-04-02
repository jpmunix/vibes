import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "../contexts/ThemeContext";
import { DeepLinkProvider } from "../contexts/DeepLinkContext";
import { Toaster } from "sonner";
import { TitleBar } from "./TitleBar";
import { useEffect, useRef, type ReactNode } from "react";
import { useRunApp, useAppOutputSubscription } from "@/hooks/useRunApp";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { useAtomValue, useSetAtom } from "jotai";
import {
  appConsoleEntriesAtom,
  previewModeAtom,
  selectedAppIdAtom,
} from "@/atoms/appAtoms";
import { useSettings } from "@/hooks/useSettings";
import { getColorById, adjustChroma, DEFAULT_LIGHT_COLOR, DEFAULT_DARK_COLOR } from "@/components/PrimaryColorPicker";
import type { ZoomLevel } from "@/lib/schemas";
import { selectedComponentsPreviewAtom } from "@/atoms/previewAtoms";
import { chatInputValueAtom } from "@/atoms/chatAtoms";
import { ipc } from "@/ipc/types";

// Routes that can be restored on startup
const RESTORABLE_ROUTES = ["/", "/workspace", "/notes", "/todos"];
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
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore last view on startup
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    // Only restore if we're at the root (fresh app start)
    if (routerState.location.pathname !== "/") return;

    ipc.misc.getPreference({ key: PREF_LAST_VIEW }).then((raw) => {
      if (raw && RESTORABLE_ROUTES.includes(raw) && raw !== "/") {
        navigate({ to: raw as any, replace: true });
      }
    }).catch(() => { /* ignore */ });
  }, []);

  // Persist current view to DB on route change (debounced)
  useEffect(() => {
    const pathname = routerState.location.pathname;
    // Only persist restorable routes
    const base = RESTORABLE_ROUTES.find((r) =>
      r === "/" ? pathname === "/" : pathname.startsWith(r),
    );
    if (!base) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      ipc.misc.setPreference({ key: PREF_LAST_VIEW, value: base }).catch(() => {});
    }, 300);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
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

  return (
    <>
      <ThemeProvider>
        <DeepLinkProvider>
          <SidebarProvider>
            <TitleBar />
            <AppSidebar />
            <div
              id="layout-main-content-container"
              className="flex h-[calc(100vh-44px)] w-full overflow-x-hidden mt-11 bg-background"
            >
              {children}
            </div>
            <Toaster richColors />
          </SidebarProvider>
        </DeepLinkProvider>
      </ThemeProvider>
    </>
  );
}
