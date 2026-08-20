import {
  appConsoleEntriesAtom,
  currentAppAtom,
  selectedAppIdAtom,
} from "@/atoms/appAtoms";
import type { ConsoleEntry } from "@/ipc/types";
import { useAtomValue, useSetAtom } from "jotai";
import { ipc } from "@/ipc/types";
import { useEffect, useRef, useState, useMemo, useCallback, memo } from "react";
import { ConsoleEntryComponent } from "./ConsoleEntry";
import { ConsoleFilters } from "./ConsoleFilters";
import { showError } from "@/lib/toast";

// Logs are mostly used to spot startup errors; cap the rendered buffer so the
// DOM stays bounded (card #103 Slice 4). Full history lives in the backend.
const MAX_RENDERED_LOGS = 100;

// Wrapper component for console items - memoized to prevent unnecessary re-renders
interface ConsoleItemProps {
  index: number;
  entry: ConsoleEntry | undefined;
  expandedEntries: Set<string>;
  typeFilter: string;
  getEntryKey: (entry: ConsoleEntry | undefined, index: number) => string;
  toggleExpanded: (key: string, index: number) => void;
  appId: number | null;
}

const ConsoleItem = memo(
  ({
    index,
    entry,
    expandedEntries,
    typeFilter,
    getEntryKey,
    toggleExpanded,
    appId,
  }: ConsoleItemProps) => {
    if (!entry) {
      return <div />;
    }

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

ConsoleItem.displayName = "ConsoleItem";

// Console component
export const Console = () => {
  const consoleEntries = useAtomValue(appConsoleEntriesAtom);
  const setConsoleEntries = useSetAtom(appConsoleEntriesAtom);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const currentApp = useAtomValue(currentAppAtom);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledToBottom = useRef(false);
  const [showFilters, setShowFilters] = useState(false);
  const [containerHeight, setContainerHeight] = useState(0);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
    new Set(),
  );

  // Filter states
  const [levelFilter, setLevelFilter] = useState<
    "all" | "info" | "warn" | "error"
  >("all");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "server" | "client" | "edge-function" | "network-requests"
  >("all");
  const [sourceFilter, setSourceFilter] = useState<string>("");

  // Track container height for responsive filter visibility
  const prevContainerHeight = useRef(0);

  // Track if user is near bottom (within 100px) for auto-scroll
  const [isNearBottom, setIsNearBottom] = useState(true);
  // Track if initial scroll has completed to prevent glitches during first interaction
  const initialScrollDone = useRef(false);
  const handleClearFilters = () => {
    setLevelFilter("all");
    setTypeFilter("all");
    setSourceFilter("");
  };

  const handleClearLogs = useCallback(async () => {
    if (selectedAppId) {
      try {
        // Clear logs from backend store
        await ipc.misc.clearLogs({ appId: selectedAppId });
        // Clear logs from UI
        setConsoleEntries([]);
      } catch (error) {
        showError(
          error instanceof Error ? error.message : "Failed to clear logs",
        );
      }
    }
  }, [selectedAppId, setConsoleEntries]);

  useEffect(() => {
    const container = containerRef.current?.parentElement;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newHeight = entry.contentRect.height;
        const wasZero = prevContainerHeight.current === 0;
        prevContainerHeight.current = newHeight;
        setContainerHeight(newHeight);
        // Reset scroll flag when container becomes visible (height goes from 0 to > 0)
        // This handles the case when console panel is opened
        if (wasZero && newHeight > 0) {
          hasScrolledToBottom.current = false;
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Fetch initial logs and subscribe to updates
  useEffect(() => {
    if (!selectedAppId) return;

    let isMounted = true;

    // Fetch existing logs
    ipc.misc
      .getConsoleLogs({ appId: selectedAppId })
      .then((logs) => {
        if (isMounted) {
          // Convert ConsoleEntry to match local AppOutput-like structure if needed
          // The atom expects an array of log objects.
          // ConsoleEntry has { type, level, message, timestamp, sourceName, appId }
          // AppOutput has { type, message, appId, timestamp }
          // They are compatible enough for display.
          setConsoleEntries(logs);
        }
      })
      .catch(console.error);

    // Subscribe to batched logs
    const unsubscribeBatch = ipc.events.misc.onAppLogsBatch((batch) => {
      if (batch.appId === selectedAppId) {
        setConsoleEntries((prev) => {
          // Deduplicate logic could go here if needed, but timestamp should be unique enough?
          // Actually, simplest is just append.
          return [
            ...prev,
            ...batch.logs.map((log) => ({
              ...log,
              level:
                log.type === "stderr" || log.type === "client-error"
                  ? ("error" as const)
                  : ("info" as const),
              type: "server" as const,
              timestamp: log.timestamp ?? Date.now(),
            })),
          ];
        });
      }
    });

    // Note: we intentionally do NOT subscribe to onAppOutput here.
    // The batch subscription above already covers all app output.
    // Proxy events and client errors are handled by useAppOutputSubscription in layout.tsx.

    return () => {
      isMounted = false;
      unsubscribeBatch();
    };
  }, [selectedAppId, setConsoleEntries]);

  // Show filters after initial render and when panel is large enough
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowFilters(containerHeight > 150);
    }, 300);
    return () => clearTimeout(timer);
  }, [containerHeight]);

  // Get unique source names for filter dropdown
  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    consoleEntries.forEach((entry) => {
      if (entry.sourceName) sources.add(entry.sourceName);
    });
    return Array.from(sources).sort();
  }, [consoleEntries]);

  // Filter console entries (logs arrive in chronological order from the backend)
  const filteredEntries = useMemo(() => {
    return consoleEntries.filter((entry) => {
      if (levelFilter !== "all" && entry.level !== levelFilter) return false;
      if (typeFilter !== "all" && entry.type !== typeFilter) return false;
      if (
        sourceFilter &&
        sourceFilter !== "all" &&
        entry.sourceName !== sourceFilter
      )
        return false;
      return true;
    });
  }, [consoleEntries, levelFilter, typeFilter, sourceFilter]);

  // Only render the most recent N logs — keeps the DOM bounded while the full
  // history stays available for export and counts (card #103 Slice 4).
  const renderedEntries = useMemo(() => {
    return filteredEntries.length > MAX_RENDERED_LOGS
      ? filteredEntries.slice(filteredEntries.length - MAX_RENDERED_LOGS)
      : filteredEntries;
  }, [filteredEntries]);

  // Auto-scroll: keep following the tail when new logs arrive and the user was
  // already at/near the bottom (replaces Virtuoso's followOutput).
  useEffect(() => {
    const el = listRef.current;
    if (!el || renderedEntries.length === 0) return;
    if (isNearBottom || !hasScrolledToBottom.current) {
      el.scrollTop = el.scrollHeight;
      hasScrolledToBottom.current = true;
      if (!initialScrollDone.current) {
        initialScrollDone.current = true;
      }
    }
  }, [renderedEntries.length, isNearBottom]);

  const handleExportLogs = useCallback(async () => {
    if (filteredEntries.length === 0) {
      showError("No hay logs para exportar");
      return;
    }

    const logText = filteredEntries
      .map((entry) => {
        const time = new Date(entry.timestamp).toLocaleString();
        const level = entry.level.toUpperCase();
        const type = entry.type.toUpperCase();
        const source = entry.sourceName ? `[${entry.sourceName}] ` : "";
        return `[${time}] [${type}] [${level}] ${source}${entry.message}`;
      })
      .join("\n");

    const appName = currentApp?.name ?? `app-${selectedAppId}`;
    const normalizedName = appName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    try {
      const result = await ipc.system.saveTextToFile({
        content: logText,
        defaultName: `logs-${normalizedName}.txt`,
        filters: [{ name: "Text Files", extensions: ["txt", "log"] }],
      });

      if (!result.canceled && result.filePath) {
        // Log saved successfully
      }
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Error al exportar logs",
      );
    }
  }, [filteredEntries, selectedAppId, currentApp]);

  // Generate unique key for each entry
  const getEntryKey = useCallback(
    (entry: (typeof filteredEntries)[0] | undefined, index: number) => {
      if (!entry) return `entry-${index}`;
      return `${entry.timestamp}-${index}`;
    },
    [],
  );

  // Toggle expansion state for an entry
  const toggleExpanded = useCallback((key: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const listHeight = containerHeight - (showFilters ? 60 : 0);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Filter bar */}
      <ConsoleFilters
        levelFilter={levelFilter}
        typeFilter={typeFilter}
        sourceFilter={sourceFilter}
        onLevelFilterChange={setLevelFilter}
        onTypeFilterChange={setTypeFilter}
        onSourceFilterChange={setSourceFilter}
        onClearFilters={handleClearFilters}
        onClearLogs={handleClearLogs}
        onExportLogs={handleExportLogs}
        uniqueSources={uniqueSources}
        totalLogs={filteredEntries.length}
        showFilters={showFilters}
      />

      {/* Log area — native scroll over the most recent MAX_RENDERED_LOGS entries */}
      <div ref={containerRef} className="flex-1 overflow-hidden px-4">
        {containerHeight > 0 && (
          <div
            ref={listRef}
            className="font-mono text-xs"
            style={{ height: listHeight, overflowY: "auto" }}
            onScroll={(e) => {
              const el = e.currentTarget;
              const nearBottom =
                el.scrollHeight - el.scrollTop - el.clientHeight < 100;
              setIsNearBottom(nearBottom);
              if (nearBottom) {
                hasScrolledToBottom.current = true;
                if (!initialScrollDone.current) {
                  initialScrollDone.current = true;
                }
              }
            }}
          >
            {renderedEntries.map((entry, index) => {
              const entryKey = getEntryKey(entry, index);
              const isExpanded = expandedEntries.has(entryKey);

              return (
                <ConsoleItem
                  key={entryKey}
                  index={index}
                  entry={entry}
                  expandedEntries={expandedEntries}
                  typeFilter={typeFilter}
                  getEntryKey={getEntryKey}
                  toggleExpanded={toggleExpanded}
                  appId={selectedAppId}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
