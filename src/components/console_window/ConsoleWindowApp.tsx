import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useSetAtom, useAtomValue } from "jotai";
import { selectedAppIdAtom, currentAppAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import type { ConsoleEntry } from "@/ipc/types";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { showError } from "@/lib/toast";
import { Toaster } from "sonner";
import { WindowsControls } from "@/components/WindowsControls";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { cn } from "@/lib/utils";
import { ConsoleEntryComponent } from "../preview_panel/ConsoleEntry";
import { ConsoleFilters } from "../preview_panel/ConsoleFilters";
import { ConsoleTerminal } from "../preview_panel/ConsoleTerminal";
import { Logs } from "lucide-react";

// Isolated QueryClient for the console window
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: false },
    mutations: { retry: false },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.showErrorToast) {
        showError(error);
      }
    },
  }),
});

interface ConsoleWindowAppProps {
  appId: number;
}

// ─── Scroll-seek placeholder ───────────────────────────────────────────────────
const ScrollSeekPlaceholder = () => (
  <div className="font-mono text-xs py-2 px-4 border-b border-gray-200 dark:border-gray-700">
    <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
  </div>
);

// ─── Memoized log item ────────────────────────────────────────────────────────
interface LogItemProps {
  index: number;
  entry: ConsoleEntry | undefined;
  expandedEntries: Set<string>;
  typeFilter: string;
  getEntryKey: (entry: ConsoleEntry | undefined, index: number) => string;
  toggleExpanded: (key: string, index: number) => void;
}

const LogItem = memo(({ index, entry, expandedEntries, typeFilter, getEntryKey, toggleExpanded }: LogItemProps) => {
  if (!entry) return <div />;
  const entryKey = getEntryKey(entry, index);
  const isExpanded = expandedEntries.has(entryKey);
  return (
    <div>
      <ConsoleEntryComponent
        type={entry.type}
        level={entry.level}
        timestamp={entry.timestamp}
        message={entry.message}
        sourceName={entry.sourceName}
        typeFilter={typeFilter}
        isExpanded={isExpanded}
        onToggleExpand={() => toggleExpanded(entryKey, index)}
      />
    </div>
  );
});
LogItem.displayName = "LogItem";

// ─── Logs Panel (self-contained, no useSettings dependency) ────────────────────
function LogsPanel({ appId }: { appId: number }) {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [containerHeight, setContainerHeight] = useState(0);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  // Filters
  const [levelFilter, setLevelFilter] = useState<"all" | "info" | "warn" | "error">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "server" | "client" | "edge-function" | "network-requests">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [isNearBottom, setIsNearBottom] = useState(true);

  const handleClearFilters = () => {
    setLevelFilter("all");
    setTypeFilter("all");
    setSourceFilter("");
  };

  const handleClearLogs = useCallback(async () => {
    try {
      await ipc.misc.clearLogs({ appId });
      setEntries([]);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to clear logs");
    }
  }, [appId]);

  // Fetch initial logs + subscribe to batch updates
  useEffect(() => {
    if (!appId) return;
    let isMounted = true;

    ipc.misc.getConsoleLogs({ appId }).then((logs) => {
      if (isMounted) setEntries(logs);
    }).catch(console.error);

    const unsubscribeBatch = ipc.events.misc.onAppLogsBatch((batch) => {
      if (batch.appId === appId) {
        setEntries((prev) => [
          ...prev,
          ...batch.logs.map((log) => ({
            ...log,
            level: (log.type === "stderr" || log.type === "client-error" ? "error" : "info") as "error" | "info",
            type: "server" as const,
            timestamp: log.timestamp ?? Date.now(),
          })),
        ]);
      }
    });

    return () => {
      isMounted = false;
      unsubscribeBatch();
    };
  }, [appId]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const e of entries) setContainerHeight(e.contentRect.height);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (levelFilter !== "all" && entry.level !== levelFilter) return false;
      if (typeFilter !== "all" && entry.type !== typeFilter) return false;
      if (sourceFilter && entry.sourceName !== sourceFilter) return false;
      return true;
    });
  }, [entries, levelFilter, typeFilter, sourceFilter]);

  // Source names for filter dropdown
  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    entries.forEach((e) => { if (e.sourceName) sources.add(e.sourceName); });
    return Array.from(sources).sort();
  }, [entries]);

  const getEntryKey = useCallback((entry: ConsoleEntry | undefined, index: number) => {
    if (!entry) return `empty-${index}`;
    return `${entry.type}-${entry.timestamp}-${index}`;
  }, []);

  const toggleExpanded = useCallback((key: string, _index: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Auto-scroll when near bottom
  useEffect(() => {
    if (isNearBottom && virtuosoRef.current && filteredEntries.length > 0) {
      const t = setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: filteredEntries.length - 1, behavior: "smooth" });
      }, 50);
      return () => clearTimeout(t);
    }
  }, [filteredEntries.length, isNearBottom]);

  const handleExportLogs = useCallback(() => {
    const text = entries.map((e) => {
      const ts = new Date(e.timestamp).toLocaleTimeString();
      return `${ts} [${e.level}] [${e.type}] ${e.sourceName ? `(${e.sourceName}) ` : ""}${e.message}`;
    }).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `console-logs-${appId}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries, appId]);

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Filters bar */}
      {showFilters && (
        <ConsoleFilters
          levelFilter={levelFilter}
          onLevelFilterChange={setLevelFilter}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          uniqueSources={uniqueSources}
          onClearFilters={handleClearFilters}
          onClearLogs={handleClearLogs}
          onExportLogs={handleExportLogs}
          totalLogs={filteredEntries.length}
          showFilters={showFilters}
        />
      )}

      {/* Log entries */}
      <div className="flex-1 min-h-0">
        {filteredEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No hay logs disponibles
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={filteredEntries}
            followOutput="smooth"
            initialTopMostItemIndex={Math.max(0, filteredEntries.length - 1)}
            atBottomStateChange={setIsNearBottom}
            components={{ ScrollSeekPlaceholder }}
            scrollSeekConfiguration={{ enter: (v) => Math.abs(v) > 600, exit: (v) => Math.abs(v) < 100 }}
            itemContent={(index, entry) => (
              <LogItem
                index={index}
                entry={entry}
                expandedEntries={expandedEntries}
                typeFilter={typeFilter}
                getEntryKey={getEntryKey}
                toggleExpanded={toggleExpanded}
              />
            )}
            style={{ height: "100%" }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main console window content ───────────────────────────────────────────────
function ConsoleWindowContent({ appId }: ConsoleWindowAppProps) {
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const currentApp = useAtomValue(currentAppAtom);
  const [consoleView, setConsoleView] = useState<"logs" | "terminal">("logs");

  useEffect(() => {
    setSelectedAppId(appId);
  }, [appId, setSelectedAppId]);

  // Set window title
  useEffect(() => {
    ipc.app.getApp(appId).then((app) => {
      if (app?.name) document.title = `${app.name} — Consola`;
    }).catch(() => {});
  }, [appId]);

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground text-xs font-mono">
      {/* Custom title bar */}
      <div className="flex items-center px-4 py-0 border-b border-border/40 bg-background/80 backdrop-blur-sm shrink-0 app-region-drag h-9 font-sans">
        <Logs size={14} className="mr-2 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate flex-1">
          {currentApp?.name || "App"} — {consoleView === "logs" ? "Mensajes del sistema" : "Consola"}
        </span>

        {/* Logs/Console toggle */}
        <div className="flex items-center bg-muted rounded-md p-0.5 mr-3 no-app-region-drag">
          <button
            onClick={() => setConsoleView("logs")}
            className={cn(
              "px-2.5 py-0.5 text-[10px] font-medium rounded transition-colors",
              consoleView === "logs"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Logs
          </button>
          <button
            onClick={() => setConsoleView("terminal")}
            className={cn(
              "px-2.5 py-0.5 text-[10px] font-medium rounded transition-colors",
              consoleView === "terminal"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Console
          </button>
        </div>

        <WindowsControls className="ml-auto pr-0 pointer-events-auto no-app-region-drag" buttonClassName="h-9" />
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {consoleView === "logs" ? (
          <LogsPanel appId={appId} />
        ) : (
          <ConsoleTerminal />
        )}
      </div>
      <Toaster richColors />
    </div>
  );
}

// ─── Root wrapper ──────────────────────────────────────────────────────────────
export function ConsoleWindowApp({ appId }: ConsoleWindowAppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ConsoleWindowContent appId={appId} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
