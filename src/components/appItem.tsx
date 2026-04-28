import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Pin, ExternalLink, AlertTriangle, CloudDownload, Loader2 } from "@/components/ui/icons";
import { SidebarMenuItem, SidebarMenuAction } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import { useState } from "react";
import type { ListedApp } from "@/ipc/types/app";
import { LanguageBadge } from "./LanguageBadge";
import { Checkbox } from "@/components/ui/checkbox";

type AppItemProps = {
  app: ListedApp;
  handleAppClick: (id: number) => void;
  selectedAppId: number | null;
  handleToggleFavorite: (appId: number, e: React.MouseEvent) => void;
  isFavoriteLoading: boolean;
  handleOpenChat: (appId: number, e: React.MouseEvent) => void;
  onRefresh?: () => Promise<void>;
  /** Bulk selection mode */
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (appId: number) => void;
};

export function AppItem({
  app,
  handleAppClick,
  selectedAppId,
  handleToggleFavorite,
  isFavoriteLoading,
  handleOpenChat,
  onRefresh,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}: AppItemProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloading) return;

    try {
      setIsDownloading(true);
      const result = await ipc.app.downloadApp({ appId: app.id });
      if (result.success) {
        showSuccess("Aplicación descargada con éxito.");
        if (onRefresh) await onRefresh();
      } else {
        showError(result.error || "Error al descargar la aplicación.");
      }
    } catch (error) {
      showError(error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <SidebarMenuItem className="mb-0.5">
      <div className={`flex items-center relative group/menu-item overflow-hidden ${selectionMode ? "ml-2 mr-4 gap-3" : "ml-4 mr-2"}`}>
        {/* ── Checkbox for bulk selection mode ── */}
        {selectionMode && (
          <div
            className="flex items-center justify-center w-5 shrink-0 cursor-pointer animate-in fade-in slide-in-from-left-2 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect?.(app.id)}
              className="cursor-pointer"
            />
          </div>
        )}

        <Button
          variant="ghost"
          onClick={() => {
            if (selectionMode) {
              onToggleSelect?.(app.id);
            } else {
              handleAppClick(app.id);
            }
          }}
          className={`justify-start h-auto w-full min-w-0 shrink text-left cursor-pointer rounded-xl py-2 transition-all duration-150 ${selectionMode ? "pr-3" : "pr-1"}
            ${selectionMode && isSelected
              ? "bg-primary/10 text-primary ring-1 ring-primary/20"
              : selectionMode
                ? "hover:bg-sidebar-accent/40"
                : selectedAppId === app.id
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-sidebar-accent/60"
            }`}
          data-testid={`app-list-item-${app.name}`}
        >
          <div className="flex flex-col w-full relative overflow-hidden">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="truncate typo-menu-item leading-tight">
                {app.name}
              </span>
              <LanguageBadge language={app.primaryLanguage} />
              {app.localPathExists === false && (
                <AlertTriangle
                  size={14}
                  className="text-red-500 flex-shrink-0 animate-pulse ml-1"
                  title="Archivos locales no encontrados"
                />
              )}
            </div>
            <span
              className={`typo-micro mt-0.5 flex items-center gap-1 ${selectedAppId === app.id ? "opacity-90" : "opacity-50"}`}
            >
              {formatDistanceToNow(new Date(app.createdAt), {
                addSuffix: true,
                locale: es,
              })}
              {app.localPathExists === false && (
                <span className="typo-micro text-red-500 font-medium whitespace-nowrap">
                  • Sin archivos locales
                </span>
              )}
            </span>
          </div>
        </Button>

        {/* Hover gradient shadow — hidden in selection mode */}
        {!selectionMode && (
          <div
            className={`absolute right-0 top-0 bottom-0 w-20 pointer-events-none opacity-0 group-hover/menu-item:opacity-100 transition-opacity z-10 rounded-r-xl
          ${selectedAppId === app.id
                ? "bg-gradient-to-l from-primary/10 to-transparent"
                : "bg-gradient-to-l from-[var(--sidebar-accent)]/60 to-transparent"
              }`}
          />
        )}

        {/* Action buttons — hidden in selection mode */}
        {!selectionMode && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1">
            {app.localPathExists === false && app.canClone && (
              <SidebarMenuAction
                showOnHover
                onClick={handleDownload}
                disabled={isDownloading}
                className="transition-colors h-7 w-7 flex items-center justify-center relative top-0 right-0 text-primary hover:text-primary/80"
                title="Descargar archivos desde GitHub"
              >
                {isDownloading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CloudDownload size={14} />
                )}
              </SidebarMenuAction>
            )}
            <SidebarMenuAction
              showOnHover
              onClick={(e) => handleToggleFavorite(app.id, e)}
              disabled={isFavoriteLoading}
              className={`transition-colors h-7 w-7 flex items-center justify-center relative top-0 right-0 cursor-pointer ${app.isFavorite ? "opacity-100" : ""}`}
              data-testid="favorite-button"
            >
              <Pin
                size={14}
                className={
                  app.isFavorite
                    ? "fill-primary text-primary"
                    : "text-muted-foreground hover:text-primary hover:fill-primary"
                }
              />
            </SidebarMenuAction>
            {(!app.primaryLanguage || ['javascript', 'typescript', 'unknown'].includes(app.primaryLanguage.toLowerCase())) && (
              <SidebarMenuAction
                showOnHover
                onClick={(e) => handleOpenChat(app.id, e)}
                className="transition-colors h-7 w-7 flex items-center justify-center relative top-0 right-0 text-muted-foreground hover:text-primary cursor-pointer"
                data-testid="open-chat-button"
                title="Abrir en Chat"
              >
                <ExternalLink size={14} />
              </SidebarMenuAction>
            )}
          </div>
        )}
      </div>
    </SidebarMenuItem>
  );
}
