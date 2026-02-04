import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Star } from "lucide-react";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import type { ListedApp } from "@/ipc/types/app";

type AppItemProps = {
  app: ListedApp;
  handleAppClick: (id: number) => void;
  selectedAppId: number | null;
  handleToggleFavorite: (appId: number, e: React.MouseEvent) => void;
  isFavoriteLoading: boolean;
};

export function AppItem({
  app,
  handleAppClick,
  selectedAppId,
  handleToggleFavorite,
  isFavoriteLoading,
}: AppItemProps) {
  return (
    <SidebarMenuItem className="mb-1 relative ">
      <div className="flex w-[190px] items-center">
        <Button
          variant="ghost"
          onClick={() => handleAppClick(app.id)}
          className={`justify-start w-full text-left py-3 hover:bg-sidebar-accent/80 ${selectedAppId === app.id
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : ""
            }`}
          data-testid={`app-list-item-${app.name}`}
        >
          <div className="flex flex-col w-4/5">
            <span className="truncate">{app.name}</span>
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(app.createdAt), {
                addSuffix: true,
                locale: es,
              })}
            </span>
          </div>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => handleToggleFavorite(app.id, e)}
          disabled={isFavoriteLoading}
          className="absolute top-1 right-1 p-1 mx-1 h-6 w-6 z-10"
          key={app.id}
          data-testid="favorite-button"
        >
          <Star
            size={12}
            className={
              app.isFavorite
                ? "fill-amber-600 text-amber-600 dark:fill-amber-400 dark:text-amber-400"
                : selectedAppId === app.id
                  ? "hover:fill-black hover:text-black"
                  : "hover:fill-amber-600 hover:stroke-amber-600 hover:text-amber-600 dark:hover:fill-amber-400 dark:hover:stroke-amber-400 dark:hover:text-amber-400"
            }
          />
        </Button>
      </div>
    </SidebarMenuItem>
  );
}
