import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Star, Trash2, AlertTriangle, CloudDownload, Loader2 } from "lucide-react";
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
  handleDeleteApp: (appId: number, appName: string, e: React.MouseEvent) => void;
  onRefresh?: () => Promise<void>;
};

export function AppItem({
  app,
  handleAppClick,
  selectedAppId,
  handleToggleFavorite,
  isFavoriteLoading,
  handleDeleteApp,
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
    <SidebarMenuItem className="mb-1">
      <div className="flex ml-2 mr-2 items-center relative group/menu-item">
        <Button
          variant="ghost"
          onClick={() => handleAppClick(app.id)}
          className={`justify-start h-11 w-full text-left pr-1 hover:bg-sidebar-accent/80 ${selectedAppId === app.id
            ? "bg-primary/10 text-primary"
            : ""
            }`}
          data-testid={`app-list-item-${app.name}`}
        >
          <div className="flex flex-col w-full relative overflow-hidden">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span
                className={`truncate ${selectedAppId === app.id ? "font-semibold" : ""}`}
              >
                {app.name}
              </span>
              {app.localPathExists === false && (
                <AlertTriangle
                  size={12}
                  className="text-red-500 flex-shrink-0 animate-pulse"
                  title="Archivos locales no encontrados"
                />
              )}
            </div>
            <span
              className={`text-xs flex items-center gap-1 ${selectedAppId === app.id ? "text-primary/70" : "text-muted-foreground"}`}
            >
              {formatDistanceToNow(new Date(app.createdAt), {
                addSuffix: true,
                locale: es,
              })}
              {app.localPathExists === false && (
                <span className="text-[10px] text-red-400 font-medium whitespace-nowrap">
                  • Sin archivos locales
                </span>
              )}
            </span>
          </div>
        </Button>

        {/* Hover gradient shadow */}
        <div
          className={`absolute right-0 top-0 bottom-0 w-24 pointer-events-none opacity-0 group-hover/menu-item:opacity-100 transition-opacity z-10 
          ${selectedAppId === app.id
              ? "bg-gradient-to-l from-primary/10 via-primary/8 to-transparent"
              : "bg-gradient-to-l from-[var(--sidebar-accent)] via-[var(--sidebar-accent)]/90 to-transparent"
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
            className={`transition-colors h-7 w-7 flex items-center justify-center relative top-0 right-0 ${app.isFavorite ? "opacity-100" : ""}`}
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
            onClick={(e) => handleDeleteApp(app.id, app.name, e)}
            className="transition-colors h-7 w-7 flex items-center justify-center relative top-0 right-0 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
            data-testid="delete-app-button"
          >
            <Trash2 size={14} />
          </SidebarMenuAction>
        </div>
      </div>
    </SidebarMenuItem>
  );
}
