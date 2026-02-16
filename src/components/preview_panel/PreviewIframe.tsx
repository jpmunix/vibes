import {
  selectedAppIdAtom,
  appUrlAtom,
  appConsoleEntriesAtom,
  previewErrorMessageAtom,
  previewCurrentUrlAtom,
  routeHistoryAtom,
} from "@/atoms/appAtoms";
import { useAtomValue, useSetAtom, useAtom } from "jotai";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Loader2,
  X,
  Sparkles,
  ChevronDown,
  Lightbulb,
  ChevronRight,
  MousePointerClick,
  Power,
  MonitorSmartphone,
  Monitor,
  Tablet,
  Smartphone,
  Camera,
  Crop,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { CopyErrorMessage } from "@/components/CopyErrorMessage";
import { ipc } from "@/ipc/types";

import { useParseRouter } from "@/hooks/useParseRouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStreamChat } from "@/hooks/useStreamChat";
import {
  selectedComponentsPreviewAtom,
  visualEditingSelectedComponentAtom,
  currentComponentCoordinatesAtom,
  previewIframeRefAtom,
  annotatorModeAtom,
  screenshotDataUrlAtom,
  pendingVisualChangesAtom,
  elementTypeAtom,
  naturalEditingPanelOpenAtom,
  isDynamicComponentAtom,
  hasStaticTextAtom,
  currentIconNameAtom,
  iconLineAtom,
  componentTextContentAtom,
} from "@/atoms/previewAtoms";
import { ComponentSelection } from "@/ipc/types";
import { isPreviewExpandedAtom } from "@/atoms/viewAtoms";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRunApp } from "@/hooks/useRunApp";
import { useSettings } from "@/hooks/useSettings";
import { useShortcut } from "@/hooks/useShortcut";
import { cn } from "@/lib/utils";
import { normalizePath } from "../../../shared/normalizePath";
import { showError } from "@/lib/toast";
import type { DeviceMode } from "@/lib/schemas";
import { useAttachments } from "@/hooks/useAttachments";
import { Annotator } from "@/pro/ui/components/Annotator/Annotator";
import { VisualEditingToolbar } from "./VisualEditingToolbar";
import { useSidebar } from "@/components/ui/sidebar";
import { chatPositionAtom } from "@/atoms/uiAtoms";

interface ErrorBannerProps {
  error: { message: string; source: "preview-app" | "dyad-app" } | undefined;
  onDismiss: () => void;
  onAIFix: () => void;
}

const ErrorBanner = ({ error, onDismiss, onAIFix }: ErrorBannerProps) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const { isStreaming } = useStreamChat();
  if (!error) return null;
  const isDockerError = error.message.includes("Cannot connect to the Docker");

  const getTruncatedError = () => {
    const firstLine = error.message.split("\n")[0];
    const snippetLength = 250;
    const snippet = error.message.substring(0, snippetLength);
    return firstLine.length < snippet.length
      ? firstLine
      : snippet + (snippet.length === snippetLength ? "..." : "");
  };

  return (
    <>
      {/* Overlay oscuro de fondo */}
      <div
        className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onDismiss}
      />

      {/* Modal centrado */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90%] max-w-2xl bg-white dark:bg-gray-900 rounded-lg shadow-2xl border border-red-200 dark:border-red-800"
        data-testid="preview-error-banner"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
              <X size={20} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Error en la aplicación
              </h3>
              {error.source === "dyad-app" && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/50 rounded text-xs font-medium text-red-700 dark:text-red-300">
                  Error interno
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Contenido del error */}
        <div className="p-4">
          <div
            className="p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800/50 cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <div className="flex gap-2 items-start">
              <ChevronRight
                size={16}
                className={`mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400 transform transition-transform ${isCollapsed ? "" : "rotate-90"}`}
              />
              <div className="flex-1 text-sm font-mono text-red-700 dark:text-red-300 whitespace-pre-wrap break-words">
                {isCollapsed ? getTruncatedError() : error.message}
              </div>
            </div>
          </div>

          {/* Mensaje de consejo */}
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800/50 flex gap-3">
            <Lightbulb size={18} className="flex-shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-900 dark:text-blue-200">
              <span className="font-semibold">Consejo: </span>
              {isDockerError
                ? "Asegúrate de que Docker Desktop está en ejecución e intenta reiniciar la aplicación."
                : error.source === "dyad-app"
                  ? "Intenta reiniciar la aplicación Dyad o reiniciar tu computadora para ver si eso soluciona el error."
                  : "Verifica si reiniciar la aplicación soluciona el error."}
            </div>
          </div>
        </div>

        {/* Botones de acción */}
        {!isDockerError && error.source === "preview-app" && (
          <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg">
            <CopyErrorMessage errorMessage={error.message} />
            <button
              disabled={isStreaming}
              onClick={onAIFix}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg font-medium transition-colors shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-red-600 disabled:hover:to-red-700"
            >
              <Sparkles size={16} />
              <span>Arreglar con IA</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
};

// Expand/Collapse Preview Button
// position="left" → renders only when preview is on the left (chat right)
// position="right" → renders only when preview is on the right (chat left)
const ExpandPreviewButton = ({ position }: { position: "left" | "right" }) => {
  const [isExpanded, setIsExpanded] = useAtom(isPreviewExpandedAtom);
  const chatPosition = useAtomValue(chatPositionAtom);
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar();
  const sidebarWasOpenRef = useRef(true);

  // Preview is on the opposite side of chat
  const previewSide = chatPosition === "left" ? "right" : "left";
  if (previewSide !== position) return null;

  const handleToggle = () => {
    if (!isExpanded) {
      // Expanding: remember sidebar state and collapse it
      sidebarWasOpenRef.current = sidebarOpen;
      setSidebarOpen(false);
      setIsExpanded(true);
    } else {
      // Collapsing: restore sidebar if it was open before
      setIsExpanded(false);
      if (sidebarWasOpenRef.current) {
        setSidebarOpen(true);
      }
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleToggle}
            className={cn(
              "p-1 rounded transition-colors duration-200 dark:text-gray-300",
              isExpanded
                ? "bg-gray-200 dark:bg-gray-700 text-foreground"
                : "hover:bg-gray-200 dark:hover:bg-gray-700",
            )}
            data-testid="preview-expand-button"
            aria-label={isExpanded ? "Contraer vista" : "Expandir vista"}
          >
            <div className="transition-transform duration-200 hover:scale-110">
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isExpanded ? "Contraer vista" : "Expandir vista"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Preview iframe component
export const PreviewIframe = ({ loading }: { loading: boolean }) => {
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const { appUrl, originalUrl } = useAtomValue(appUrlAtom);
  const setConsoleEntries = useSetAtom(appConsoleEntriesAtom);
  // State to trigger iframe reload
  const [reloadKey, setReloadKey] = useState(0);
  const [errorMessage, setErrorMessage] = useAtom(previewErrorMessageAtom);
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const { streamMessage } = useStreamChat();
  const { routes: availableRoutes } = useParseRouter(selectedAppId);
  const { restartApp } = useRunApp();
  const { settings, updateSettings } = useSettings();
  const isProMode = true; // Pro features are now available for everyone

  // Preserved URL state (persists across HMR-induced remounts)
  const [preservedUrls, setPreservedUrls] = useAtom(previewCurrentUrlAtom);

  // Get the initial URL to use - check if we have a preserved URL from before HMR remount
  const initialUrl = selectedAppId ? preservedUrls[selectedAppId] : null;

  // Navigation state - initialize with preserved URL if available
  const [isComponentSelectorInitialized, setIsComponentSelectorInitialized] =
    useState(false);
  const [canGoBack, setCanGoBack] = useState(!!initialUrl);
  const [canGoForward, setCanGoForward] = useState(false);
  const [navigationHistory, setNavigationHistory] = useState<string[]>(() => {
    if (appUrl && initialUrl && initialUrl !== appUrl) {
      return [appUrl, initialUrl];
    }
    return appUrl ? [appUrl] : [];
  });
  const [currentHistoryPosition, setCurrentHistoryPosition] = useState(() => {
    if (appUrl && initialUrl && initialUrl !== appUrl) {
      return 1;
    }
    return 0;
  });
  const setSelectedComponentsPreview = useSetAtom(
    selectedComponentsPreviewAtom,
  );
  const [visualEditingSelectedComponent, setVisualEditingSelectedComponent] =
    useAtom(visualEditingSelectedComponentAtom);
  const setCurrentComponentCoordinates = useSetAtom(
    currentComponentCoordinatesAtom,
  );
  const setPreviewIframeRef = useSetAtom(previewIframeRefAtom);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Ref to store the URL that the iframe should be showing - initialize with preserved URL if available
  // This is different from appUrl - it tracks the CURRENT route, not just the base URL
  const currentIframeUrlRef = useRef<string | null>(initialUrl || appUrl);
  const [isPicking, setIsPicking] = useState(false);
  const [annotatorMode, setAnnotatorMode] = useAtom(annotatorModeAtom);
  const [screenshotDataUrl, setScreenshotDataUrl] = useAtom(
    screenshotDataUrlAtom,
  );

  // Connection error tracking and auto-restart logic
  const [loadFailureCount, setLoadFailureCount] = useState(0);
  const [isAutoRestarting, setIsAutoRestarting] = useState(false);
  const [isIframeLoading, setIsIframeLoading] = useState(false);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { addAttachments } = useAttachments();
  const setPendingChanges = useSetAtom(pendingVisualChangesAtom);
  const setElementType = useSetAtom(elementTypeAtom);
  const setNaturalEditingPanelOpen = useSetAtom(naturalEditingPanelOpenAtom);

  // AST Analysis State (atoms for cross-component access)
  const [isDynamicComponent, setIsDynamicComponent] = useAtom(isDynamicComponentAtom);
  const [hasStaticText, setHasStaticText] = useAtom(hasStaticTextAtom);
  const setCurrentIconName = useSetAtom(currentIconNameAtom);
  const setIconLine = useSetAtom(iconLineAtom);
  const setComponentTextContent = useSetAtom(componentTextContentAtom);

  // Device mode state
  const deviceMode: DeviceMode = settings?.previewDeviceMode ?? "desktop";
  const [isDevicePopoverOpen, setIsDevicePopoverOpen] = useState(false);

  // Address bar combobox state
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState("/");
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [routeHistory, setRouteHistory] = useAtom(routeHistoryAtom);

  // Get current path from navigation history
  const getCurrentPath = useCallback(() => {
    try {
      const currentUrl = navigationHistory[currentHistoryPosition];
      if (currentUrl) return new URL(currentUrl).pathname;
    } catch { }
    return "/";
  }, [navigationHistory, currentHistoryPosition]);

  // Add a path to per-app route history
  const addToHistory = useCallback(
    (path: string) => {
      if (!selectedAppId || path === "/") return;
      setRouteHistory((prev) => {
        const appHistory = prev[selectedAppId] || [];
        // Remove if already exists (will re-add at top)
        const filtered = appHistory.filter((p) => p !== path);
        // Add to front, cap at 10
        const updated = [path, ...filtered].slice(0, 10);
        return { ...prev, [selectedAppId]: updated };
      });
    },
    [selectedAppId, setRouteHistory],
  );

  // Remove a path from per-app route history
  const removeFromHistory = useCallback(
    (path: string) => {
      if (!selectedAppId) return;
      setRouteHistory((prev) => {
        const appHistory = prev[selectedAppId] || [];
        return {
          ...prev,
          [selectedAppId]: appHistory.filter((p) => p !== path),
        };
      });
    },
    [selectedAppId, setRouteHistory],
  );

  // Get filtered history and routes based on input
  const appHistory = selectedAppId ? routeHistory[selectedAppId] || [] : [];
  const filteredHistory = useMemo(() => {
    if (!urlInputValue || urlInputValue === "/") return appHistory;
    return appHistory.filter((p) =>
      p.toLowerCase().includes(urlInputValue.toLowerCase()),
    );
  }, [appHistory, urlInputValue]);
  const filteredRoutes = useMemo(() => {
    if (!urlInputValue || urlInputValue === "/") return availableRoutes;
    return availableRoutes.filter(
      (r) =>
        r.path.toLowerCase().includes(urlInputValue.toLowerCase()) ||
        r.label.toLowerCase().includes(urlInputValue.toLowerCase()),
    );
  }, [availableRoutes, urlInputValue]);

  // Handle submitting a URL from the address bar
  const handleUrlSubmit = () => {
    const path = urlInputValue.trim();
    if (!path) return;
    // Ensure path starts with /
    const normalizedPath = path.startsWith("/") ? path : "/" + path;
    navigateToRoute(normalizedPath);
    addToHistory(normalizedPath);
    setIsEditingUrl(false);
  };

  // Start editing the URL bar
  const startEditingUrl = () => {
    setUrlInputValue(getCurrentPath());
    setIsEditingUrl(true);
    // Focus and select after render
    setTimeout(() => {
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    }, 0);
  };

  // Device configurations
  const deviceWidthConfig = {
    tablet: 768,
    mobile: 375,
  };

  //detect if the user is using Mac
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  const analyzeComponent = async (componentId: string) => {
    if (!componentId || !selectedAppId) return;

    try {
      const result = await ipc.visualEditing.analyzeComponent({
        appId: selectedAppId,
        componentId,
      });
      setIsDynamicComponent(result.isDynamic);
      setHasStaticText(result.hasStaticText);
      if (result.elementType) {
        setElementType(result.elementType);
      }
      setCurrentIconName(result.iconName || null);
      setIconLine(result.iconLine || null);
      setComponentTextContent(result.textContent || "");
      setNaturalEditingPanelOpen(true);

      // Automatically enable text editing if component has static text
      if (result.hasStaticText && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          {
            type: "enable-dyad-text-editing",
            data: {
              componentId: componentId,
              runtimeId: visualEditingSelectedComponent?.runtimeId,
            },
          },
          "*",
        );
      }
    } catch (err) {
      console.error("Failed to analyze component", err);
      setIsDynamicComponent(false);
      setHasStaticText(false);
    }
  };

  const handleTextUpdated = async (data: any) => {
    const { componentId, text } = data;
    if (!componentId || !selectedAppId) return;

    // Parse componentId to extract file path and line number
    const [filePath, lineStr] = componentId.split(":");
    const lineNumber = parseInt(lineStr, 10);

    if (!filePath || isNaN(lineNumber)) {
      console.error("Invalid componentId format:", componentId);
      return;
    }

    // Store text change in pending changes
    setPendingChanges((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(componentId);

      updated.set(componentId, {
        componentId: componentId,
        componentName:
          existing?.componentName || visualEditingSelectedComponent?.name || "",
        relativePath: filePath,
        lineNumber: lineNumber,
        styles: existing?.styles || {},
        textContent: text,
      });

      return updated;
    });
  };

  // Function to get current styles from selected element
  const getCurrentElementStyles = () => {
    if (!iframeRef.current?.contentWindow || !visualEditingSelectedComponent)
      return;

    try {
      // Send message to iframe to get current styles
      iframeRef.current.contentWindow.postMessage(
        {
          type: "get-dyad-component-styles",
          data: {
            elementId: visualEditingSelectedComponent.id,
            runtimeId: visualEditingSelectedComponent.runtimeId,
          },
        },
        "*",
      );
    } catch (error) {
      console.error("Failed to get element styles:", error);
    }
  };
  useEffect(() => {
    setAnnotatorMode(false);
  }, []);
  // Reset visual editing state when app changes or component unmounts
  useEffect(() => {
    return () => {
      // Cleanup on unmount or when app changes
      setVisualEditingSelectedComponent(null);
      setPendingChanges(new Map());
      setCurrentComponentCoordinates(null);
    };
  }, [selectedAppId]);

  // Reset auto-restart state when manual restart is triggered (loading becomes true)
  useEffect(() => {
    if (loading && isAutoRestarting) {
      // Manual restart in progress - cancel auto-restart
      setIsAutoRestarting(false);
      setLoadFailureCount(0);
    }
  }, [loading, isAutoRestarting]);

  // Handle automatic server restart on connection failures
  useEffect(() => {
    // Clear failure count when URL changes successfully
    if (appUrl) {
      setLoadFailureCount(0);
      setIsAutoRestarting(false);
    }
  }, [appUrl]);

  // Auto-restart logic when iframe fails to load multiple times
  useEffect(() => {
    const MAX_FAILURES = 2;

    if (loadFailureCount >= MAX_FAILURES && !isAutoRestarting && selectedAppId) {
      console.warn(`[PreviewIframe] Detected ${loadFailureCount} consecutive load failures. Auto-restarting server...`);
      setIsAutoRestarting(true);

      // Immediately reset failure count to prevent multiple restart attempts
      setLoadFailureCount(0);

      // Force a complete server restart
      restartApp({ removeNodeModules: false }).then(() => {
        console.log('[PreviewIframe] Server restarted successfully');
        setIsAutoRestarting(false);
      }).catch((err) => {
        console.error('[PreviewIframe] Failed to restart server:', err);
        setIsAutoRestarting(false);
        // Don't increment failure count here to avoid infinite loop
      });
    }
  }, [loadFailureCount, isAutoRestarting, selectedAppId, restartApp]);

  // Send pro mode status to iframe
  useEffect(() => {
    if (iframeRef.current?.contentWindow && isComponentSelectorInitialized) {
      iframeRef.current.contentWindow.postMessage(
        { type: "dyad-pro-mode", enabled: isProMode },
        "*",
      );
    }
  }, [isProMode, isComponentSelectorInitialized]);

  // Use refs to avoid re-creating the event listener on every state change
  const navigationHistoryRef = useRef(navigationHistory);
  const currentHistoryPositionRef = useRef(currentHistoryPosition);
  const selectedAppIdRef = useRef(selectedAppId);
  const appUrlRef = useRef(appUrl);

  // Update refs when values change
  useEffect(() => {
    navigationHistoryRef.current = navigationHistory;
  }, [navigationHistory]);

  useEffect(() => {
    currentHistoryPositionRef.current = currentHistoryPosition;
  }, [currentHistoryPosition]);

  useEffect(() => {
    selectedAppIdRef.current = selectedAppId;
  }, [selectedAppId]);

  useEffect(() => {
    appUrlRef.current = appUrl;
  }, [appUrl]);

  // Add message listener for iframe errors and navigation events
  // This effect only runs ONCE to avoid removing/re-adding listeners
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only handle messages from our iframe
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      // Handle console logs from the iframe
      if (event.data?.type === "console-log") {
        const { level, args } = event.data;
        const formattedMessage = `[${level.toUpperCase()}] ${args.join(" ")}`;
        const logLevel: "info" | "warn" | "error" =
          level === "error" ? "error" : level === "warn" ? "warn" : "info";
        const logEntry = {
          level: logLevel,
          type: "client" as const,
          message: formattedMessage,
          appId: selectedAppIdRef.current!,
          timestamp: Date.now(),
        };

        // Send to central log store
        ipc.misc.addLog(logEntry);

        // Also update UI state
        setConsoleEntries((prev) => [...prev, logEntry]);
        return;
      }

      // Handle network requests from the iframe
      if (event.data?.type === "network-request") {
        const { method, url } = event.data;
        const formattedMessage = `→ ${method} ${url}`;
        const logEntry = {
          level: "info" as const,
          type: "network-requests" as const,
          message: formattedMessage,
          appId: selectedAppIdRef.current!,
          timestamp: Date.now(),
        };

        // Send to central log store
        ipc.misc.addLog(logEntry);

        // Also update UI state
        setConsoleEntries((prev) => [...prev, logEntry]);
        return;
      }

      // Handle network responses from the iframe
      if (event.data?.type === "network-response") {
        const { method, url, status, duration } = event.data;
        const formattedMessage = `[${status}] ${method} ${url} (${duration}ms)`;
        const level: "info" | "warn" | "error" =
          status >= 400 ? "error" : status >= 300 ? "warn" : "info";
        const logEntry = {
          level,
          type: "network-requests" as const,
          message: formattedMessage,
          appId: selectedAppIdRef.current!,
          timestamp: Date.now(),
        };

        // Send to central log store
        ipc.misc.addLog(logEntry);

        // Also update UI state
        setConsoleEntries((prev) => [...prev, logEntry]);
        return;
      }

      // Handle network errors from the iframe
      if (event.data?.type === "network-error") {
        const { method, url, status, error, duration } = event.data;
        const statusCode = status && status !== 0 ? `[${status}] ` : "";
        const formattedMessage = `${statusCode}${method} ${url} - ${error} (${duration}ms)`;
        const logEntry = {
          level: "error" as const,
          type: "network-requests" as const,
          message: formattedMessage,
          appId: selectedAppIdRef.current!,
          timestamp: Date.now(),
        };

        // Send to central log store
        ipc.misc.addLog(logEntry);

        // Also update UI state
        setConsoleEntries((prev) => [...prev, logEntry]);
        return;
      }

      if (event.data?.type === "dyad-component-selector-initialized") {
        setIsComponentSelectorInitialized(true);
        iframeRef.current?.contentWindow?.postMessage(
          { type: "dyad-pro-mode", enabled: isProMode },
          "*",
        );
        return;
      }

      if (event.data?.type === "dyad-text-updated") {
        handleTextUpdated(event.data);
        return;
      }

      if (event.data?.type === "dyad-text-finalized") {
        handleTextUpdated(event.data);
        return;
      }

      if (event.data?.type === "dyad-component-selected") {
        console.log("Component picked:", event.data);

        const component = parseComponentSelection(event.data);

        if (!component) return;

        // Store the coordinates
        if (event.data.coordinates && isProMode) {
          setCurrentComponentCoordinates(event.data.coordinates);
        }

        // Add to selected components if not already there
        setSelectedComponentsPreview((prev) => {
          const exists = prev.some((c) => {
            // Check by runtimeId if available otherwise by id
            // Stored components may have lost their runtimeId after re-renders or reloading the page
            if (component.runtimeId && c.runtimeId) {
              return c.runtimeId === component.runtimeId;
            }
            return c.id === component.id;
          });
          if (exists) {
            return prev;
          }
          return [...prev, component];
        });

        if (isProMode) {
          // Remove previous component's overlay if it exists and close panel if switching
          let shouldClosePanel = false;
          setVisualEditingSelectedComponent((prev) => {
            if (prev && prev.id !== component.id) {
              // Different component selected - remove old overlay and mark to close panel
              shouldClosePanel = true;
              if (iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.postMessage(
                  {
                    type: "remove-dyad-component-overlay",
                    componentId: prev.id,
                  },
                  "*",
                );
              }
            }
            return component;
          });

          // Close panel if we were switching to a different component
          if (shouldClosePanel) {
            setNaturalEditingPanelOpen(false);
          }

          // Trigger AST analysis
          analyzeComponent(component.id);
        }

        return;
      }

      if (event.data?.type === "dyad-component-deselected") {
        const componentId = event.data.componentId;
        if (componentId) {
          // Disable text editing for the deselected component
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              {
                type: "disable-dyad-text-editing",
                data: { componentId },
              },
              "*",
            );
          }

          setSelectedComponentsPreview((prev) =>
            prev.filter((c) => c.id !== componentId),
          );
          setVisualEditingSelectedComponent((prev) => {
            const shouldClear = prev?.id === componentId;
            if (shouldClear) {
              setCurrentComponentCoordinates(null);
            }
            return shouldClear ? null : prev;
          });
        }
        return;
      }

      if (event.data?.type === "dyad-component-coordinates-updated") {
        if (event.data.coordinates) {
          setCurrentComponentCoordinates(event.data.coordinates);
        }
        return;
      }

      if (event.data?.type === "dyad-request-native-screenshot") {
        const { rect } = event.data;
        const iframeRect = iframeRef.current?.getBoundingClientRect();

        if (!iframeRect) {
          showError(
            "No se pudo determinar la posición del área de previsualización",
          );
          return;
        }

        // Calculate absolute coordinates relative to the window
        // We need to account for the fact that Electron's capturePage matches the window's content area
        const captureRect = (rect && rect.width && rect.height)
          ? {
            x: Math.round(iframeRect.left + rect.left),
            y: Math.round(iframeRect.top + rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }
          : {
            x: Math.round(iframeRect.left),
            y: Math.round(iframeRect.top),
            width: Math.round(iframeRect.width),
            height: Math.round(iframeRect.height),
          };

        ipc.system
          .takeScreenshot({ rect: captureRect })
          .then((dataUrl) => {
            if (isProMode) {
              setScreenshotDataUrl(dataUrl);
              setAnnotatorMode(true);
            } else {
              // Auto-attach for non-pro users
              fetch(dataUrl)
                .then((res) => res.blob())
                .then((blob) => {
                  const timestamp = new Date()
                    .toISOString()
                    .replace(/[:.]/g, "-");
                  const file = new File([blob], `screenshot-${timestamp}.png`, {
                    type: "image/png",
                  });
                  addAttachments([file], "chat-context");
                })
                .catch((err) => {
                  console.error("Failed to auto-attach screenshot:", err);
                  showError("Error al adjuntar la captura al chat");
                });
            }
          })
          .catch((err) => {
            console.error("Native capture failed:", err);
            showError("Error al realizar la captura nativa");
          });
        return;
      }

      if (event.data?.type === "dyad-screenshot-response") {
        if (event.data.success && event.data.dataUrl) {
          if (isProMode) {
            setScreenshotDataUrl(event.data.dataUrl);
            setAnnotatorMode(true);
          } else {
            // Auto-attach for non-pro users
            fetch(event.data.dataUrl)
              .then((res) => res.blob())
              .then((blob) => {
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                const file = new File([blob], `screenshot-${timestamp}.png`, {
                  type: "image/png",
                });
                addAttachments([file], "chat-context");
              })
              .catch((err) => {
                console.error("Failed to auto-attach screenshot:", err);
                showError("Error al adjuntar la captura al chat");
              });
          }
        } else {
          showError(event.data.error);
        }
        return;
      }

      const { type, payload } = event.data as {
        type:
        | "window-error"
        | "unhandled-rejection"
        | "iframe-sourcemapped-error"
        | "build-error-report"
        | "pushState"
        | "replaceState";
        payload?: {
          message?: string;
          stack?: string;
          reason?: string;
          newUrl?: string;
          file?: string;
          frame?: string;
        };
      };

      if (
        type === "window-error" ||
        type === "unhandled-rejection" ||
        type === "iframe-sourcemapped-error"
      ) {
        const stack =
          type === "iframe-sourcemapped-error"
            ? payload?.stack?.split("\n").slice(0, 1).join("\n")
            : payload?.stack;
        const errorMessage = `Error ${payload?.message || payload?.reason}\nStack trace: ${stack}`;
        console.error("Iframe error:", errorMessage);
        setErrorMessage({ message: errorMessage, source: "preview-app" });
        const logEntry = {
          level: "error" as const,
          type: "client" as const,
          message: `Iframe error: ${errorMessage}`,
          appId: selectedAppIdRef.current!,
          timestamp: Date.now(),
        };

        // Send to central log store
        ipc.misc.addLog(logEntry);

        // Also update UI state
        setConsoleEntries((prev) => [...prev, logEntry]);
      } else if (type === "build-error-report") {
        console.debug(`Build error report: ${payload}`);
        const errorMessage = `${payload?.message} from file ${payload?.file}.\n\nSource code:\n${payload?.frame}`;
        setErrorMessage({ message: errorMessage, source: "preview-app" });
        const logEntry = {
          level: "error" as const,
          type: "client" as const,
          message: `Build error report: ${JSON.stringify(payload)}`,
          appId: selectedAppIdRef.current!,
          timestamp: Date.now(),
        };

        // Send to central log store
        ipc.misc.addLog(logEntry);

        // Also update UI state
        setConsoleEntries((prev) => [...prev, logEntry]);
      } else if (type === "pushState" || type === "replaceState") {
        // Update navigation history based on the type of state change
        // Use refs to get current values without causing re-renders
        if (type === "pushState" && payload?.newUrl) {
          // For pushState, we trim any forward history and add the new URL
          const newHistory = [
            ...navigationHistoryRef.current.slice(
              0,
              currentHistoryPositionRef.current + 1,
            ),
            payload.newUrl,
          ];
          setNavigationHistory(newHistory);
          setCurrentHistoryPosition(newHistory.length - 1);
          // Update the current iframe URL ref to match the navigation
          currentIframeUrlRef.current = payload.newUrl;
          // Preserve URL for HMR remounts - only if it's a different route from root
          // Compare origins and check if there's a meaningful path
          const currentAppId = selectedAppIdRef.current;
          const currentAppUrl = appUrlRef.current;
          if (currentAppId && currentAppUrl) {
            try {
              const newUrlObj = new URL(payload.newUrl);
              const appUrlObj = new URL(currentAppUrl);
              // Only preserve if there's a non-root path
              if (
                newUrlObj.origin === appUrlObj.origin &&
                newUrlObj.pathname !== "/" &&
                newUrlObj.pathname !== ""
              ) {
                const urlToPreserve = payload.newUrl;
                setPreservedUrls((prev) => ({
                  ...prev,
                  [currentAppId]: urlToPreserve,
                }));
              } else if (newUrlObj.origin === appUrlObj.origin) {
                // Clear preserved URL when navigating back to root
                setPreservedUrls((prev) => {
                  const next = { ...prev };
                  delete next[currentAppId];
                  return next;
                });
              }
            } catch {
              // Invalid URL, don't preserve
            }
          }
        } else if (type === "replaceState" && payload?.newUrl) {
          // For replaceState, we replace the current URL
          const newHistory = [...navigationHistoryRef.current];
          newHistory[currentHistoryPositionRef.current] = payload.newUrl;
          setNavigationHistory(newHistory);
          // Update the current iframe URL ref to match the navigation
          currentIframeUrlRef.current = payload.newUrl;
          // Preserve URL for HMR remounts - only if it's a different route from root
          const currentAppId = selectedAppIdRef.current;
          const currentAppUrl = appUrlRef.current;
          if (currentAppId && currentAppUrl) {
            try {
              const newUrlObj = new URL(payload.newUrl);
              const appUrlObj = new URL(currentAppUrl);
              // Only preserve if there's a non-root path
              if (
                newUrlObj.origin === appUrlObj.origin &&
                newUrlObj.pathname !== "/" &&
                newUrlObj.pathname !== ""
              ) {
                const urlToPreserve = payload.newUrl;
                setPreservedUrls((prev) => ({
                  ...prev,
                  [currentAppId]: urlToPreserve,
                }));
              } else if (newUrlObj.origin === appUrlObj.origin) {
                // Clear preserved URL when navigating back to root
                setPreservedUrls((prev) => {
                  const next = { ...prev };
                  delete next[currentAppId];
                  return next;
                });
              }
            } catch {
              // Invalid URL, don't preserve
            }
          }
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
    // Empty deps - only register listener once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Update navigation buttons state
    setCanGoBack(currentHistoryPosition > 0);
    setCanGoForward(currentHistoryPosition < navigationHistory.length - 1);
  }, [navigationHistory, currentHistoryPosition]);

  // Reset navigation when appUrl changes (different app selected)
  const prevAppUrlRef = useRef(appUrl);
  useEffect(() => {
    if (appUrl && appUrl !== prevAppUrlRef.current) {
      prevAppUrlRef.current = appUrl;
      setNavigationHistory([appUrl]);
      setCurrentHistoryPosition(0);
      setCanGoBack(false);
      setCanGoForward(false);
      // Reset iframe URL to the new app's base URL
      currentIframeUrlRef.current = appUrl;
    }
  }, [appUrl]);

  // Get current styles when component is selected for visual editing
  useEffect(() => {
    if (visualEditingSelectedComponent) {
      getCurrentElementStyles();
    }
  }, [visualEditingSelectedComponent]);

  // Function to activate component selector in the iframe
  const handleActivateComponentSelector = () => {
    if (iframeRef.current?.contentWindow) {
      const newIsPicking = !isPicking;
      if (!newIsPicking) {
        // Clean up any text editing states when deactivating
        iframeRef.current.contentWindow.postMessage(
          { type: "cleanup-all-text-editing" },
          "*",
        );

        // Remove all component overlays when deactivating
        if (visualEditingSelectedComponent) {
          iframeRef.current.contentWindow.postMessage(
            {
              type: "remove-dyad-component-overlay",
              componentId: visualEditingSelectedComponent.id,
            },
            "*",
          );
        }

        // Clear visual editing state
        setVisualEditingSelectedComponent(null);
        setCurrentComponentCoordinates(null);
        setNaturalEditingPanelOpen(false);
      }
      setIsPicking(newIsPicking);
      setVisualEditingSelectedComponent(null);
      iframeRef.current.contentWindow.postMessage(
        {
          type: newIsPicking
            ? "activate-dyad-component-selector"
            : "deactivate-dyad-component-selector",
        },
        "*",
      );
    }
  };

  // Function to handle annotator button click
  const handleAnnotatorClick = () => {
    if (annotatorMode) {
      setAnnotatorMode(false);
      return;
    }
    // Delay to let the dropdown menu close before taking the screenshot
    setTimeout(() => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          {
            type: "dyad-take-screenshot",
          },
          "*",
        );
      }
    }, 150);
  };

  const handleStartSelection = () => {
    // Delay to let the dropdown menu close before starting selection
    setTimeout(() => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          {
            type: "dyad-start-selection",
          },
          "*",
        );
      }
    }, 150);
  };

  // Activate component selector using a shortcut
  useShortcut(
    "c",
    { shift: true, ctrl: !isMac, meta: isMac },
    handleActivateComponentSelector,
    isComponentSelectorInitialized,
    iframeRef,
  );

  // Function to navigate back
  const handleNavigateBack = () => {
    if (canGoBack && iframeRef.current?.contentWindow) {
      const newPosition = currentHistoryPosition - 1;
      if (newPosition < 0 || newPosition >= navigationHistory.length) return;
      const targetUrl = navigationHistory[newPosition];
      if (!targetUrl) return;

      // Send the target URL to navigate to (browser history.back() doesn't work in Electron iframes)
      iframeRef.current.contentWindow.postMessage(
        {
          type: "navigate",
          payload: { direction: "backward", url: targetUrl },
        },
        "*",
      );

      // Update our local state
      setCurrentHistoryPosition(newPosition);
      setCanGoBack(newPosition > 0);
      setCanGoForward(true);
      // Update iframe URL ref to match
      currentIframeUrlRef.current = targetUrl;

      // Update preservedUrls to match navigation (for HMR remounts)
      if (selectedAppId && appUrl) {
        try {
          const targetUrlObj = new URL(targetUrl);
          const appUrlObj = new URL(appUrl);
          if (targetUrlObj.origin === appUrlObj.origin) {
            // Clear preserved URL if navigating back to root, otherwise update it
            if (targetUrlObj.pathname === "/" || targetUrlObj.pathname === "") {
              setPreservedUrls((prev) => {
                const newUrls = { ...prev };
                delete newUrls[selectedAppId];
                return newUrls;
              });
            } else {
              setPreservedUrls((prev) => ({
                ...prev,
                [selectedAppId]: targetUrl,
              }));
            }
          }
        } catch {
          // Invalid URL, don't update preservedUrls
        }
      }
    }
  };

  // Function to navigate forward
  const handleNavigateForward = () => {
    if (canGoForward && iframeRef.current?.contentWindow) {
      const newPosition = currentHistoryPosition + 1;
      if (newPosition < 0 || newPosition >= navigationHistory.length) return;
      const targetUrl = navigationHistory[newPosition];
      if (!targetUrl) return;

      // Send the target URL to navigate to (browser history.forward() doesn't work in Electron iframes)
      iframeRef.current.contentWindow.postMessage(
        {
          type: "navigate",
          payload: { direction: "forward", url: targetUrl },
        },
        "*",
      );

      // Update our local state
      setCurrentHistoryPosition(newPosition);
      setCanGoBack(true);
      setCanGoForward(newPosition < navigationHistory.length - 1);
      // Update iframe URL ref to match
      currentIframeUrlRef.current = targetUrl;

      // Update preservedUrls to match navigation (for HMR remounts)
      if (selectedAppId && appUrl) {
        try {
          const targetUrlObj = new URL(targetUrl);
          const appUrlObj = new URL(appUrl);
          if (targetUrlObj.origin === appUrlObj.origin) {
            // Clear preserved URL if navigating forward to root, otherwise update it
            if (targetUrlObj.pathname === "/" || targetUrlObj.pathname === "") {
              setPreservedUrls((prev) => {
                const newUrls = { ...prev };
                delete newUrls[selectedAppId];
                return newUrls;
              });
            } else {
              setPreservedUrls((prev) => ({
                ...prev,
                [selectedAppId]: targetUrl,
              }));
            }
          }
        } catch {
          // Invalid URL, don't update preservedUrls
        }
      }
    }
  };

  // Function to handle reload
  const handleReload = (e?: MouseEvent) => {
    // If Shift is pressed, do a full restart instead
    if (e?.shiftKey) {
      onRestart();
      return;
    }

    // Store the current URL to preserve the route during reload
    const currentUrl = navigationHistory[currentHistoryPosition] || appUrl;

    // Validate that the URL is same-origin as appUrl to prevent XSS/URL injection
    if (currentUrl && appUrl) {
      try {
        const currentOrigin = new URL(currentUrl).origin;
        const appOrigin = new URL(appUrl).origin;

        // Only use the current URL if it has the same origin as the app URL
        if (currentOrigin === appOrigin) {
          currentIframeUrlRef.current = currentUrl;
        } else {
          console.warn(
            `Rejecting reload URL ${currentUrl} - origin mismatch with app URL ${appUrl}`,
          );
          currentIframeUrlRef.current = appUrl;
        }
      } catch (e) {
        console.error("Invalid URL during reload validation", e);
        currentIframeUrlRef.current = appUrl;
      }
    } else {
      currentIframeUrlRef.current = currentUrl || null;
    }

    setReloadKey((prevKey) => prevKey + 1);
    setErrorMessage(undefined);
    setIsIframeLoading(true);
    // Reset visual editing state
    setVisualEditingSelectedComponent(null);
    setPendingChanges(new Map());
    setCurrentComponentCoordinates(null);
    console.debug("Reloading iframe preview for app", selectedAppId);
  };

  // Function to navigate to a specific route
  const navigateToRoute = (path: string) => {
    if (iframeRef.current?.contentWindow && appUrl) {
      // Create the full URL by combining the base URL with the path
      const baseUrl = new URL(appUrl).origin;
      const newUrl = `${baseUrl}${path}`;

      // Navigate to the URL
      setIsIframeLoading(true);
      iframeRef.current.contentWindow.location.href = newUrl;

      // iframeRef.current.src = newUrl;

      // Update navigation history
      const newHistory = [
        ...navigationHistory.slice(0, currentHistoryPosition + 1),
        newUrl,
      ];
      setNavigationHistory(newHistory);
      setCurrentHistoryPosition(newHistory.length - 1);
      setCanGoBack(true);
      setCanGoForward(false);

      // Preserve URL for tab switches / HMR remounts
      if (selectedAppId) {
        if (path === "/" || path === "") {
          setPreservedUrls((prev) => {
            const next = { ...prev };
            delete next[selectedAppId];
            return next;
          });
        } else {
          setPreservedUrls((prev) => ({
            ...prev,
            [selectedAppId]: newUrl,
          }));
        }
      }
    }
  };

  // Convert null to undefined for iframe src prop compatibility
  // Add a cache-busting parameter when reloadKey changes to force a fresh reload from the server
  const iframeSrc = useMemo(() => {
    const base = currentIframeUrlRef.current ?? appUrl;
    if (!base) return undefined;
    if (reloadKey === 0) return base;

    try {
      const url = new URL(base);
      url.searchParams.set("dyad_v", reloadKey.toString());
      return url.toString();
    } catch {
      return base;
    }
  }, [appUrl, reloadKey]);

  // Set iframe load timeout - if iframe doesn't load within 30 seconds, consider it a failure
  useEffect(() => {
    if (!iframeSrc || isAutoRestarting) return;

    // Clear any existing timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    // Set new timeout
    loadTimeoutRef.current = setTimeout(() => {
      console.warn('[PreviewIframe] Iframe load timeout - no response after 30 seconds');

      // Increment failure count
      setLoadFailureCount((prev) => {
        const newCount = prev + 1;
        console.warn(`[PreviewIframe] Timeout failure ${newCount}`);
        return newCount;
      });

      setErrorMessage({
        message: 'Timeout: El servidor local no responde. Intentando reiniciar automáticamente...',
        source: 'preview-app'
      });
    }, 30000); // 30 seconds

    // Cleanup timeout on unmount or when src changes
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [iframeSrc, isAutoRestarting]);

  // Display loading state or auto-restarting state
  if (loading || isAutoRestarting) {
    return (
      <div className="flex flex-col h-full relative">
        <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-gray-50 dark:bg-gray-950">
          <div className="relative w-5 h-5 animate-spin">
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-primary rounded-full"></div>
            <div className="absolute bottom-0 left-0 w-2 h-2 bg-primary rounded-full opacity-80"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 bg-primary rounded-full opacity-60"></div>
          </div>
          <p className="text-gray-600 dark:text-gray-300">
            {isAutoRestarting
              ? "Reiniciando servidor (error de conexión detectado)..."
              : "Preparing app preview..."}
          </p>
        </div>
      </div>
    );
  }

  // Display message if no app is selected
  if (selectedAppId === null) {
    return (
      <div className="p-4 text-gray-500 dark:text-gray-400">
        Select an app to see the preview.
      </div>
    );
  }

  const onRestart = () => {
    restartApp();
  };


  return (
    <div className="flex flex-col h-full">
      {/* Browser-style header - hide when annotator is active */}
      {!annotatorMode && (
        <div className="flex items-center p-2 border-b space-x-2">
          {/* Navigation Buttons */}
          <div className="flex space-x-1">
            {/* ExpandPreview at left when preview is on the left (chat right) */}
            <ExpandPreviewButton position="left" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleActivateComponentSelector}
                    className={`p-1 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${isPicking
                      ? "bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)] hover:opacity-90"
                      : "text-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    disabled={
                      loading ||
                      !selectedAppId ||
                      !isComponentSelectorInitialized
                    }
                    data-testid="preview-pick-element-button"
                  >
                    <MousePointerClick size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {isPicking
                      ? "Deactivate component selector"
                      : "Select component"}
                  </p>
                  <p>{isMac ? "⌘ + ⇧ + C" : "Ctrl + ⇧ + C"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <DropdownMenu>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="p-1 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-foreground hover:bg-accent hover:text-accent-foreground"
                        disabled={loading || !selectedAppId}
                        data-testid="preview-screenshot-button"
                      >
                        <Camera size={16} />
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Take Screenshot</p>
                  </TooltipContent>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={handleAnnotatorClick}>
                      <Monitor size={14} className="mr-2" />
                      <span>Full Page</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={handleStartSelection}>
                      <Crop size={14} className="mr-2" />
                      <span>Selection</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Tooltip>
            </TooltipProvider>
            <button
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-300"
              disabled={!canGoBack || loading || !selectedAppId}
              onClick={handleNavigateBack}
              data-testid="preview-navigate-back-button"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-300"
              disabled={!canGoForward || loading || !selectedAppId}
              onClick={handleNavigateForward}
              data-testid="preview-navigate-forward-button"
            >
              <ArrowRight size={16} />
            </button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleReload}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-300"
                    disabled={loading || !selectedAppId}
                    data-testid="preview-refresh-button"
                  >
                    {isIframeLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Actualizar vista (Shift + Click para reiniciar)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Address Bar - editable combobox with history */}
          <div className="relative flex-grow min-w-20">
            {isEditingUrl ? (
              <>
                <input
                  ref={urlInputRef}
                  type="text"
                  value={urlInputValue}
                  onChange={(e) => setUrlInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleUrlSubmit();
                    } else if (e.key === "Escape") {
                      setIsEditingUrl(false);
                    }
                  }}
                  onBlur={(e) => {
                    // Don't close if clicking inside the suggestions dropdown
                    if (e.relatedTarget?.closest("[data-address-suggestions]")) return;
                    setIsEditingUrl(false);
                  }}
                  className="w-full px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-200 outline-none ring-2 ring-primary/50"
                  data-testid="preview-address-bar-input"
                  spellCheck={false}
                  autoComplete="off"
                />
                {/* Suggestions dropdown */}
                {(filteredHistory.length > 0 || filteredRoutes.length > 0) && (
                  <div
                    data-address-suggestions
                    tabIndex={-1}
                    className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md z-50 max-h-60 overflow-y-auto py-1"
                  >
                    {/* History section */}
                    {filteredHistory.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                          Recientes
                        </div>
                        {filteredHistory.map((path) => (
                          <div
                            key={`hist-${path}`}
                            className="flex items-center justify-between px-2 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground group"
                          >
                            <span
                              className="truncate flex-1 min-w-0"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                navigateToRoute(path);
                                setIsEditingUrl(false);
                              }}
                            >
                              {path}
                            </span>
                            <button
                              className="ml-2 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-opacity flex-shrink-0"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeFromHistory(path);
                              }}
                              title="Eliminar del historial"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                    {/* Detected routes section */}
                    {filteredRoutes.length > 0 && (
                      <>
                        {filteredHistory.length > 0 && (
                          <div className="border-t border-border my-1" />
                        )}
                        <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                          Rutas detectadas
                        </div>
                        {filteredRoutes.map((route) => (
                          <div
                            key={`route-${route.path}`}
                            className="flex items-center justify-between px-2 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              navigateToRoute(route.path);
                              addToHistory(route.path);
                              setIsEditingUrl(false);
                            }}
                          >
                            <span>{route.label}</span>
                            <span className="text-muted-foreground text-xs">
                              {route.path}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div
                className="flex items-center justify-between px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-200 cursor-pointer w-full min-w-0"
                onClick={startEditingUrl}
                data-testid="preview-address-bar-path"
              >
                <span className="truncate flex-1 mr-2 min-w-0">
                  {getCurrentPath()}
                </span>
                {(availableRoutes.length > 0 || appHistory.length > 0) && (
                  <ChevronDown size={14} className="flex-shrink-0 text-muted-foreground" />
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-1">
            <button
              onClick={onRestart}
              className="flex items-center space-x-1 px-3 py-1 rounded-md text-sm hover:bg-[var(--background-darkest)] transition-colors"
              title="Reiniciar aplicación"
            >
              <Power size={16} />
              <span>Reiniciar</span>
            </button>
            <button
              data-testid="preview-open-browser-button"
              onClick={() => {
                if (originalUrl) {
                  ipc.system.openExternalUrl(originalUrl);
                }
              }}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-300"
            >
              <ExternalLink size={16} />
            </button>

            {/* Device Mode Button */}
            <Popover open={isDevicePopoverOpen} modal={false}>
              <PopoverTrigger asChild>
                <button
                  data-testid="device-mode-button"
                  onClick={() => {
                    // Toggle popover open/close
                    if (isDevicePopoverOpen)
                      updateSettings({ previewDeviceMode: "desktop" });
                    setIsDevicePopoverOpen(!isDevicePopoverOpen);
                  }}
                  className={cn(
                    "p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-300",
                    deviceMode !== "desktop" && "bg-gray-200 dark:bg-gray-700",
                  )}
                  title="Modo de dispositivo"
                >
                  <MonitorSmartphone size={16} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-2"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={(e) => e.preventDefault()}
              >
                <TooltipProvider>
                  <ToggleGroup
                    type="single"
                    title="Modo de dispositivo"
                    value={deviceMode}
                    onValueChange={(value) => {
                      if (value) {
                        updateSettings({
                          previewDeviceMode: value as DeviceMode,
                        });
                        setIsDevicePopoverOpen(false);
                      }
                    }}
                    variant="outline"
                  >
                    {/* Tooltips placed inside items instead of wrapping
                    to avoid asChild prop merging that breaks highlighting */}
                    <ToggleGroupItem
                      value="desktop"
                      aria-label="Vista de escritorio"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center justify-center">
                            <Monitor size={16} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Desktop</p>
                        </TooltipContent>
                      </Tooltip>
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="tablet"
                      aria-label="Vista de tableta"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center justify-center">
                            <Tablet size={16} className="scale-x-130" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Tablet</p>
                        </TooltipContent>
                      </Tooltip>
                    </ToggleGroupItem>
                    <ToggleGroupItem value="mobile" aria-label="Vista móvil">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center justify-center">
                            <Smartphone size={16} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Mobile</p>
                        </TooltipContent>
                      </Tooltip>
                    </ToggleGroupItem>
                  </ToggleGroup>
                </TooltipProvider>
              </PopoverContent>
            </Popover>
            {/* ExpandPreview at right when preview is on the right (chat left) */}
            <ExpandPreviewButton position="right" />
          </div>
        </div>
      )}

      <div className="relative flex-grow overflow-hidden">
        <ErrorBanner
          error={errorMessage}
          onDismiss={() => setErrorMessage(undefined)}
          onAIFix={() => {
            if (selectedChatId) {
              streamMessage({
                prompt: `Fix error: ${errorMessage?.message}`,
                chatId: selectedChatId,
              });
            }
          }}
        />

        {!appUrl ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-gray-50 dark:bg-gray-950">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-gray-500" />
            <p className="text-gray-600 dark:text-gray-300">
              Starting your app server...
            </p>
          </div>
        ) : (
          <div
            className={cn(
              "w-full h-full",
              deviceMode !== "desktop" && "flex justify-center",
            )}
          >
            <div
              className="relative h-full"
              style={
                deviceMode == "desktop"
                  ? { width: "100%" }
                  : { width: `${deviceWidthConfig[deviceMode]}px` }
              }
            >
              {annotatorMode && screenshotDataUrl && (
                <div className="absolute inset-0 z-50 bg-white dark:bg-gray-950">
                  <Annotator
                    screenshotUrl={screenshotDataUrl}
                    onSubmit={addAttachments}
                    handleAnnotatorClick={handleAnnotatorClick}
                  />
                </div>
              )}
              <iframe
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-orientation-lock allow-pointer-lock allow-presentation allow-downloads"
                data-testid="preview-iframe-element"
                onLoad={() => {
                  // Clear any pending load timeout
                  if (loadTimeoutRef.current) {
                    clearTimeout(loadTimeoutRef.current);
                    loadTimeoutRef.current = null;
                  }

                  // Reset error state and failure count on successful load
                  setErrorMessage(undefined);
                  setLoadFailureCount(0);
                  setIsAutoRestarting(false);
                  setIsIframeLoading(false);

                  console.log('[PreviewIframe] Successfully loaded iframe');
                  // Note: We don't clear currentIframeUrlRef - it tracks the URL the iframe is showing
                  // This prevents re-renders from accidentally changing the iframe src
                }}
                onError={(e) => {
                  console.error('[PreviewIframe] iframe load error:', e);

                  // Clear any pending load timeout
                  if (loadTimeoutRef.current) {
                    clearTimeout(loadTimeoutRef.current);
                    loadTimeoutRef.current = null;
                  }

                  // Increment failure count
                  setIsIframeLoading(false);
                  setLoadFailureCount((prev) => {
                    const newCount = prev + 1;
                    console.warn(`[PreviewIframe] Load failure ${newCount}`);
                    return newCount;
                  });

                  setErrorMessage({
                    message: 'Error de conexión con el servidor local (127.0.0.1). Intentando reiniciar automáticamente...',
                    source: 'preview-app'
                  });
                }}
                ref={(el) => {
                  iframeRef.current = el;
                  if (setPreviewIframeRef) {
                    setPreviewIframeRef(el);
                  }
                }}
                key={reloadKey}
                title={`Preview for App ${selectedAppId}`}
                className={cn(
                  "w-full h-full border-none bg-white dark:bg-gray-950",
                  annotatorMode && "invisible",
                )}
                src={iframeSrc}
                allow="clipboard-read; clipboard-write; fullscreen; microphone; camera; display-capture; geolocation; autoplay; picture-in-picture"
              />
              {/* Visual Editing Toolbar — replaced by NaturalEditingPanel in PreviewPanel */}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function parseComponentSelection(data: any): ComponentSelection | null {
  if (!data || data.type !== "dyad-component-selected") {
    return null;
  }

  const component = data.component;
  if (
    !component ||
    typeof component.id !== "string" ||
    typeof component.name !== "string"
  ) {
    return null;
  }

  const { id, name, runtimeId } = component;

  // The id is expected to be in the format "filepath:line:column"
  const parts = id.split(":");
  if (parts.length < 3) {
    console.error(`Invalid component selection id format: "${id}"`);
    return null;
  }

  const columnStr = parts.pop();
  const lineStr = parts.pop();
  const relativePath = parts.join(":");

  if (!columnStr || !lineStr || !relativePath) {
    console.error(`Could not parse component selection from id: "${id}"`);
    return null;
  }

  const lineNumber = parseInt(lineStr, 10);
  const columnNumber = parseInt(columnStr, 10);

  if (isNaN(lineNumber) || isNaN(columnNumber)) {
    console.error(`Could not parse line/column from id: "${id}"`);
    return null;
  }

  return {
    id,
    name,
    runtimeId,
    relativePath: normalizePath(relativePath),
    lineNumber,
    columnNumber,
  };
}
