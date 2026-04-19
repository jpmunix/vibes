import { useNavigate, useRouterState } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useLoadApps } from "@/hooks/useLoadApps";

export function TodosList({ show }: { show?: boolean }) {
    const navigate = useNavigate();
    const routerState = useRouterState();
    const { apps, loading } = useLoadApps();

    if (!show) return null;

    // Get current app ID from route
    const currentAppId =
        routerState.location.pathname.startsWith("/todos/")
            ? parseInt(routerState.location.pathname.split("/")[2])
            : null;

    const handleAppClick = (appId: number) => {
        navigate({ to: "/todos/$appId", params: { appId: String(appId) } });
    };

    return (
        <SidebarGroup
            className="overflow-y-auto h-[calc(100vh-112px)]"
            data-testid="todos-list-container"
        >
            
            <SidebarGroupContent>
                <div className="flex flex-col space-y-2">
                    {loading ? (
                        <div className="py-3 px-4 text-sm text-muted-foreground">
                            Cargando aplicaciones...
                        </div>
                    ) : apps.length === 0 ? (
                        <div className="py-3 px-4 text-sm text-muted-foreground">
                            No hay aplicaciones aún
                        </div>
                    ) : (
                        <SidebarMenu className="space-y-1" data-testid="todos-app-list">
                            {apps.map((app) => (
                                <SidebarMenuItem key={app.id} className="mb-1">
                                    <div className="flex ml-2 mr-2 items-center relative group/menu-item">
                                        <Button
                                            variant="ghost"
                                            onClick={() => handleAppClick(app.id)}
                                            className={`justify-start h-11 w-full text-left pr-1 hover:bg-sidebar-accent/80 ${currentAppId === app.id
                                                    ? "bg-primary/10 text-primary"
                                                    : ""
                                                }`}
                                            data-testid={`todos-app-item-${app.name}`}
                                        >
                                            <div className="flex flex-col w-full relative overflow-hidden">
                                                <span
                                                    className={`truncate ${currentAppId === app.id ? "font-semibold" : ""
                                                        }`}
                                                >
                                                    {app.name}
                                                </span>
                                                <span
                                                    className={`text-sm ${currentAppId === app.id
                                                            ? "text-primary/70"
                                                            : "text-muted-foreground"
                                                        }`}
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
                      ${currentAppId === app.id
                                                    ? "bg-gradient-to-l from-primary/10 via-primary/8 to-transparent"
                                                    : "bg-gradient-to-l from-[var(--sidebar-accent)] via-[var(--sidebar-accent)]/90 to-transparent"
                                                }`}
                                        />
                                    </div>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    )}
                </div>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}
