import { Filter, X, Trash2, Download } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConsoleFiltersProps {
  levelFilter: "all" | "info" | "warn" | "error";
  typeFilter:
  | "all"
  | "server"
  | "client"
  | "edge-function"
  | "network-requests";
  sourceFilter: string;
  onLevelFilterChange: (value: "all" | "info" | "warn" | "error") => void;
  onTypeFilterChange: (
    value: "all" | "server" | "client" | "edge-function" | "network-requests",
  ) => void;
  onSourceFilterChange: (value: string) => void;
  onClearFilters: () => void;
  onClearLogs: () => void;
  uniqueSources: string[];
  totalLogs: number;
  showFilters: boolean;
  onExportLogs: () => void;
}

export const ConsoleFilters = ({
  levelFilter,
  typeFilter,
  sourceFilter,
  onLevelFilterChange,
  onTypeFilterChange,
  onSourceFilterChange,
  onClearFilters,
  onClearLogs,
  uniqueSources,
  totalLogs,
  showFilters,
  onExportLogs,
}: ConsoleFiltersProps) => {
  const hasActiveFilters =
    levelFilter !== "all" || typeFilter !== "all" || sourceFilter !== "";

  if (!showFilters) return null;

  return (
    <div className="bg-background border-b border-border p-2 flex flex-wrap gap-2 items-center animate-in fade-in slide-in-from-top-2 duration-300">
      <Filter size={14} className="text-muted-foreground" />

      {/* Level filter */}
      <select
        value={levelFilter}
        onChange={(e) =>
          onLevelFilterChange(
            e.target.value as "all" | "info" | "warn" | "error",
          )
        }
        className="text-xs px-2 py-1 border border-border rounded bg-transparent hover:bg-accent transition-colors"
      >
        <option value="all">Todos los niveles</option>
        <option value="info">Info</option>
        <option value="warn">Warn</option>
        <option value="error">Error</option>
      </select>

      {/* Type filter */}
      <select
        value={typeFilter}
        onChange={(e) =>
          onTypeFilterChange(
            e.target.value as
            | "all"
            | "server"
            | "client"
            | "edge-function"
            | "network-requests",
          )
        }
        className="text-xs px-2 py-1 border border-border rounded bg-transparent hover:bg-accent transition-colors"
      >
        <option value="all">Todos los tipos</option>
        <option value="server">Server</option>
        <option value="client">Client</option>
        <option value="edge-function">Edge Function</option>
        <option value="network-requests">Network Requests</option>
      </select>

      {/* Source filter */}
      {uniqueSources.length > 0 && (
        <select
          value={sourceFilter}
          onChange={(e) => onSourceFilterChange(e.target.value)}
          className="text-xs px-2 py-1 border border-border rounded bg-transparent hover:bg-accent transition-colors"
        >
          <option value="">All Sources</option>
          {uniqueSources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
      )}

      {/* Clear filters button */}
      {hasActiveFilters && (
        <button
          onClick={onClearFilters}
          className="text-xs px-2 py-1 flex items-center gap-1 border border-border rounded bg-transparent hover:bg-accent transition-colors"
        >
          <X size={12} />
          Clear Filters
        </button>
      )}

      {/* Clear logs button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onClearLogs}
              className="p-1 border border-border rounded bg-transparent hover:bg-accent transition-colors"
              data-testid="clear-logs-button"
            >
              <Trash2 size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Clear logs</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onExportLogs}
              className="p-1 border border-border rounded bg-transparent hover:bg-accent transition-colors"
              title="Exportar logs"
            >
              <Download size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Exportar logs a archivo</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="ml-auto text-xs text-muted-foreground">{totalLogs} logs</div>
    </div>
  );
};
