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
import { cn } from "@/lib/utils";
import { ConsoleEntryComponent } from "../preview_panel/ConsoleEntry";
import { ConsoleFilters } from "../preview_panel/ConsoleFilters";
import { ConsoleTerminal } from "../preview_panel/ConsoleTerminal";
import { Logs } from "@/components/ui/icons";

// Logs are mostly used to spot startup errors; cap the rendered buffer so the
// DOM stays bounded (card #103 Slice 4). Full history lives in the backend.
const MAX_RENDERED_LOGS = 100;

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

// ─── Memoized log item ────────────────────────────────────────────────────────
interface LogItemProps {
  index: number;
  entry: ConsoleEntry | undefined;
  expandedEntries: Set<string>;
  typeFilter: string;
  getEntryKey: (entry: ConsoleEntry | undefined, index: number) => string;
  toggleExpanded: (key: string, index: number) => void;
  appId: number;
}

const LogItem = memo(
  ({
    index,
    entry,
    expandedEntries,
    typeFilter,
    getEntryKey,
    toggleExpanded,
    appId,
  }: LogItemProps) => {
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
          appId={appId}
        />
      </div>
    );
  },
);
LogItem.displayName = "LogItem";

// ─── Logs Panel (self-contained, no useSettings dependency) ────────────────────
function LogsPanel({ appId }: { appId: number }) {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [containerHeight, setContainerHeight] = useState(0);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
    new Set(),
  );

  // Filters
  const [levelFilter, setLevelFilter] = useState<
    "all" | "info" | "warn" | "error"
  >("all");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "server" | "client" | "edge-function" | "network-requests"
  >("all");
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
      showError(
        error instanceof Error ? error.message : "Failed to clear logs",
      );
    }
  }, [appId]);

  // Fetch initial logs + subscribe to batch updates
  useEffect(() => {
    if (!appId) return;
    let isMounted = true;

    ipc.misc
      .getConsoleLogs({ appId })
      .then((logs) => {
        if (isMounted) setEntries(logs);
      })
      .catch(console.error);

    const unsubscribeBatch = ipc.events.misc.onAppLogsBatch((batch) => {
      if (batch.appId === appId) {
        setEntries((prev) => [
          ...prev,
          ...batch.logs.map((log) => ({
            ...log,
            level: (log.type === "stderr" || log.type === "client-error"
              ? "error"
              : "info") as "error" | "info",
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

  // Only render the most recent N logs — keeps the DOM bounded while the full
  // history stays available for export and counts (card #103 Slice 4).
  const renderedEntries = useMemo(() => {
    return filteredEntries.length > MAX_RENDERED_LOGS
      ? filteredEntries.slice(filteredEntries.length - MAX_RENDERED_LOGS)
      : filteredEntries;
  }, [filteredEntries]);

  // Source names for filter dropdown
  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    entries.forEach((e) => {
      if (e.sourceName) sources.add(e.sourceName);
    });
    return Array.from(sources).sort();
  }, [entries]);

  const getEntryKey = useCallback(
    (entry: ConsoleEntry | undefined, index: number) => {
      if (!entry) return `empty-${index}`;
      return `${entry.type}-${entry.timestamp}-${index}`;
    },
    [],
  );

  const toggleExpanded = useCallback((key: string, _index: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Auto-scroll when near bottom (native scroll)
  useEffect(() => {
    const el = listRef.current;
    if (isNearBottom && el && renderedEntries.length > 0) {
      el.scrollTop = el.scrollHeight;
    }
  }, [renderedEntries.length, isNearBottom]);

  const handleExportLogs = useCallback(() => {
    const text = entries
      .map((e) => {
        const ts = new Date(e.timestamp).toLocaleTimeString();
        return `${ts} [${e.level}] [${e.type}] ${e.sourceName ? `(${e.sourceName}) ` : ""}${e.message}`;
      })
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `console-logs-${appId}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries, appId]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
    >
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
          <div
            ref={listRef}
            className="h-full overflow-y-auto"
            onScroll={(e) => {
              const el = e.currentTarget;
              setIsNearBottom(
                el.scrollHeight - el.scrollTop - el.clientHeight < 100,
              );
            }}
          >
            {renderedEntries.map((entry, index) => (
              <LogItem
                key={getEntryKey(entry, index)}
                index={index}
                entry={entry}
                expandedEntries={expandedEntries}
                typeFilter={typeFilter}
                getEntryKey={getEntryKey}
                toggleExpanded={toggleExpanded}
                appId={appId}
              />
            ))}
          </div>
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
    ipc.app
      .getApp(appId)
      .then((app) => {
        if (app?.name) document.title = `${app.name} \u2013 Consola`;
      })
      .catch(() => {});
  }, [appId]);

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground text-xs font-mono">
      {/* Custom title bar */}
      <div className="flex items-center px-4 py-0 border-b border-border bg-sidebar shrink-0 app-region-drag h-9 font-sans">
        <Logs size={14} className="mr-2 text-muted-foreground shrink-0" />
        <span className="typo-tab truncate flex-1">
          {currentApp?.name || "App"} – Consola
        </span>

        {/* Logs/Console toggle */}
        <div className="flex items-center bg-muted rounded-md p-0.5 mr-3 no-app-region-drag">
          <button
            onClick={() => setConsoleView("logs")}
            className={cn(
              "px-2.5 py-0.5 typo-tab rounded-md transition-colors",
              consoleView === "logs"
                ? "bg-sidebar-accent text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
            )}
          >
            Logs
          </button>
          <button
            onClick={() => setConsoleView("terminal")}
            className={cn(
              "px-2.5 py-0.5 typo-tab rounded-md transition-colors",
              consoleView === "terminal"
                ? "bg-sidebar-accent text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
            )}
          >
            Console
          </button>
        </div>

        <WindowsControls
          className="ml-auto pr-0 pointer-events-auto no-app-region-drag"
          buttonClassName="h-9"
        />
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
