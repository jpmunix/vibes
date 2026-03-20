import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Star, ExternalLink, AlertTriangle, CloudDownload, Loader2 } from "lucide-react";
import { SidebarMenuItem, SidebarMenuAction } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import { useState } from "react";
import type { ListedApp } from "@/ipc/types/app";

type AppItemProps = {
  app: ListedApp;
  handleAppClick: (id: number) => void;
  selectedAppId: number | null;
  handleToggleFavorite: (appId: number, e: React.MouseEvent) => void;
  isFavoriteLoading: boolean;
  handleOpenChat: (appId: number, e: React.MouseEvent) => void;
  onRefresh?: () => Promise<void>;
};

export function AppItem({
  app,
  handleAppClick,
  selectedAppId,
  handleToggleFavorite,
  isFavoriteLoading,
  handleOpenChat,
  onRefresh,
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
      <div className="flex ml-2 mr-2 items-center relative group/menu-item">
        <Button
          variant="ghost"
          onClick={() => handleAppClick(app.id)}
          className={`justify-start h-auto w-full text-left pr-1 cursor-pointer rounded-xl py-2 transition-all duration-150
            ${selectedAppId === app.id
              ? "bg-primary/10 text-primary"
              : "hover:bg-sidebar-accent/60"
            }`}
          data-testid={`app-list-item-${app.name}`}
        >
          <div className="flex flex-col w-full relative overflow-hidden">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span
                className={`truncate text-[13px] leading-tight ${selectedAppId === app.id ? "font-semibold" : "font-medium"}`}
              >
                {app.name}
              </span>
              {app.localPathExists === false && (
                <AlertTriangle
                  size={11}
                  className="text-red-500 flex-shrink-0 animate-pulse"
                  title="Archivos locales no encontrados"
                />
              )}
            </div>
            <span
              className={`text-[10.5px] leading-tight mt-0.5 flex items-center gap-1 ${selectedAppId === app.id ? "text-primary/60" : "text-muted-foreground/60"}`}
            >
              {formatDistanceToNow(new Date(app.createdAt), {
                addSuffix: true,
                locale: es,
              })}
              {app.localPathExists === false && (
                <span className="text-[9.5px] text-red-400/80 font-medium whitespace-nowrap">
                  • Sin archivos locales
                </span>
              )}
            </span>
          </div>
        </Button>

        {/* Hover gradient shadow */}
        <div
          className={`absolute right-0 top-0 bottom-0 w-20 pointer-events-none opacity-0 group-hover/menu-item:opacity-100 transition-opacity z-10 rounded-r-xl
          ${selectedAppId === app.id
              ? "bg-gradient-to-l from-primary/10 to-transparent"
              : "bg-gradient-to-l from-[var(--sidebar-accent)]/60 to-transparent"
            }`}
        />

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
            <Star
              size={14}
              className={
                app.isFavorite
                  ? "fill-primary text-primary"
                  : "text-muted-foreground hover:text-primary hover:fill-primary"
              }
            />
          </SidebarMenuAction>
          <SidebarMenuAction
            showOnHover
            onClick={(e) => handleOpenChat(app.id, e)}
            className="transition-colors h-7 w-7 flex items-center justify-center relative top-0 right-0 text-muted-foreground hover:text-primary cursor-pointer"
            data-testid="open-chat-button"
            title="Abrir en Chat"
          >
            <ExternalLink size={14} />
          </SidebarMenuAction>
        </div>
      </div>
    </SidebarMenuItem>
  );
}
