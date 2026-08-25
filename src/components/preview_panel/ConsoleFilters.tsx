import { Filter, X, Trash2, Download } from "@/components/ui/icons";
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
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
        <option value="all">{t("previewPanel.allLevels")}</option>
        <option value="info">{t("previewPanel.info")}</option>
        <option value="warn">{t("previewPanel.warn")}</option>
        <option value="error">{t("previewPanel.error")}</option>
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
        <option value="all">{t("previewPanel.allTypes")}</option>
        <option value="server">{t("previewPanel.server")}</option>
        <option value="client">{t("previewPanel.client")}</option>
        <option value="edge-function">{t("previewPanel.edgeFunction")}</option>
        <option value="network-requests">{t("previewPanel.networkRequests")}</option>
      </select>

      {/* Source filter */}
      {uniqueSources.length > 0 && (
        <select
          value={sourceFilter}
          onChange={(e) => onSourceFilterChange(e.target.value)}
          className="text-xs px-2 py-1 border border-border rounded bg-transparent hover:bg-accent transition-colors"
        >
          <option value="">{t("previewPanel.allSources")}</option>
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
          <TooltipContent>{t("previewPanel.clearLogs")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onExportLogs}
              className="p-1 border border-border rounded bg-transparent hover:bg-accent transition-colors"
              title={t("preview.exportLogs")}
            >
              <Download size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("previewPanel.exportLogsToFile")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="ml-auto text-xs text-muted-foreground">
        {totalLogs} logs
      </div>
    </div>
  );
};
