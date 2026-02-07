import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useLoadApps } from "@/hooks/useLoadApps";
import { ipc } from "@/ipc/types";
import type { Todo } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { CheckSquare } from "lucide-react";
import { useEffect, useState } from "react";

export function TodosList({ show }: { show?: boolean }) {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { apps, loading } = useLoadApps();
  const [todoCounts, setTodoCounts] = useState<Record<number, number>>({});

  // Get current app ID from route
  const pathname = routerState.location.pathname;
  const currentAppId =
    pathname.startsWith("/todos/")
      ? Number.parseInt(pathname.split("/")[2])
      : null;

  useEffect(() => {
    const loadCounts = async () => {
      const counts: Record<number, number> = {};
      for (const app of apps) {
        try {
          const todos: Todo[] = await ipc.todo.getTodosByApp(app.id);
          counts[app.id] = todos.filter((t: Todo) => !t.completed).length;
        } catch {
          counts[app.id] = 0;
        }
      }
      setTodoCounts(counts);
    };

    if (apps.length > 0) {
      loadCounts();
    }
  }, [apps]);

  if (!show) return null;

  const handleAppClick = (appId: number) => {
    navigate({ to: "/todos/$appId", params: { appId: String(appId) } });
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Tableros de Tareas</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {loading ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              Cargando...
            </div>
          ) : apps.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No hay apps
            </div>
          ) : (
            apps.map((app) => (
              <SidebarMenuItem key={app.id} className="mb-1">
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-between",
                    currentAppId === app.id && "bg-accent"
                  )}
                  onClick={() => handleAppClick(app.id)}
                >
                  <span className="flex items-center gap-2 truncate">
                    <CheckSquare className="h-4 w-4 shrink-0" />
                    <span className="truncate">{app.name}</span>
                  </span>
                  {todoCounts[app.id] > 0 && (
                    <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                      {todoCounts[app.id]}
                    </span>
                  )}
                </Button>
              </SidebarMenuItem>
            ))
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
