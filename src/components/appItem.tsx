import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Star, Trash2 } from "lucide-react";
import { SidebarMenuItem, SidebarMenuAction } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import type { ListedApp } from "@/ipc/types/app";

type AppItemProps = {
  app: ListedApp;
  handleAppClick: (id: number) => void;
  selectedAppId: number | null;
  handleToggleFavorite: (appId: number, e: React.MouseEvent) => void;
  isFavoriteLoading: boolean;
  handleDeleteApp: (appId: number, appName: string, e: React.MouseEvent) => void;
};

export function AppItem({
  app,
  handleAppClick,
  selectedAppId,
  handleToggleFavorite,
  isFavoriteLoading,
  handleDeleteApp,
}: AppItemProps) {
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
            <span
              className={`truncate mr-10 ${selectedAppId === app.id ? "font-semibold" : ""}`}
            >
              {app.name}
            </span>
            <span
              className={`text-xs ${selectedAppId === app.id ? "text-primary/70" : "text-muted-foreground"}`}
            >
              {formatDistanceToNow(new Date(app.createdAt), {
                addSuffix: true,
                locale: es,
              })}
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
