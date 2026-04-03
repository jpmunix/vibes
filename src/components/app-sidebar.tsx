import { dropdownOpenAtom } from "@/atoms/uiAtoms";
import { useSidebar } from "@/components/ui/sidebar"; // import useSidebar hook
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import {
  Bot,
  CheckSquare,
  Home,
  Settings,
  StickyNote,
  MessageCircle,
  HelpCircle,
  LogOut,
  User as UserIcon,
  CloudUpload,
  Database,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { OpenRouterCreditsButton } from "./OpenRouterCreditsButton";
import { useSettings } from "@/hooks/useSettings";
import { DocumentationDialog } from "./DocumentationDialog";
import { SimpleAvatar } from "@/components/ui/SimpleAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { userAtom } from "@/atoms/authAtoms";
import { ipc } from "@/ipc/types";
import { ProfileModal } from "@/components/ProfileModal";
import { BackupModal } from "@/components/BackupModal";
import { useRouter } from "@tanstack/react-router";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppList } from "./AppList";
import { LibraryList } from "./LibraryList";
import { NotesList } from "./NotesList";
import { SettingsList } from "./SettingsList";
import { TodosList } from "./TodosList";
import { WorkspaceList } from "./WorkspaceList";

// Menu items.
const items = [
  {
    title: "Apps",
    to: "/",
    icon: Home,
  },
  {
    title: "Agente",
    to: "/workspace",
    icon: Bot,
  },
  {
    title: "Notas",
    to: "/notes",
    icon: StickyNote,
  },
  {
    title: "Tareas",
    to: "/todos",
    icon: CheckSquare,
  },
  {
    title: "Ajustes",
    to: "/settings",
    icon: Settings,
  },
];

// Hover state types
type HoverState =
  | "start-hover:app"
  | "start-hover:workspace"
  | "start-hover:notes"
  | "start-hover:todos"
  | "start-hover:settings"
  | "start-hover:library"
  | "clear-hover"
  | "no-hover";

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar(); // retrieve current sidebar state
  // Using activeTab to explicitly control which view is shown.
  // This decouples the view from the hover state and ensures immediate feedback on click.
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [hoverState, setHoverState] = useState<HoverState>("no-hover");
  const expandedByHover = useRef(false);
  const [isDropdownOpen] = useAtom(dropdownOpenAtom);
  const [isDocsOpen, setIsDocsOpen] = useState(false);

  // User avatar state
  const user = useAtomValue(userAtom);
  const { navigate } = useRouter();
  const { settings } = useSettings();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const setUser = useSetAtom(userAtom);

  const handleLogout = async () => {
    try {
      // Handle both VibesUser (.id) and legacy Firebase User (.uid)
      const userId = (user as any)?.id || (user as any)?.uid;
      if (userId) {
        await (ipc as any).auth.logout({ userId });
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Always clear client state, even if server call fails
      setUser(null);
    }
  };


  const routerState = useRouterState();
  const isAppRoute =
    routerState.location.pathname === "/" ||
    routerState.location.pathname.startsWith("/app-details");
  const isSettingsRoute = routerState.location.pathname.startsWith("/settings");
  const isLibraryRoute =
    routerState.location.pathname.startsWith("/library") ||
    routerState.location.pathname.startsWith("/themes");
  const isTodosRoute = routerState.location.pathname.startsWith("/todos");

  // Sync activeTab with route changes
  useEffect(() => {
    if (isAppRoute) {
      setActiveTab("Aplicaciones");
    } else if (routerState.location.pathname.startsWith("/notes")) {
      setActiveTab("Notas");
    } else if (isTodosRoute) {
      setActiveTab("Tareas");
    } else if (isSettingsRoute) {
      setActiveTab("Ajustes");
    } else if (isLibraryRoute) {
      setActiveTab("Biblioteca");
    } else if (routerState.location.pathname.startsWith("/workspace")) {
      setActiveTab("Workspace");
    }
  }, [
    isAppRoute,
    isSettingsRoute,
    isLibraryRoute,
    isTodosRoute,
    routerState.location.pathname,
  ]);

  useEffect(() => {
    if (hoverState.startsWith("start-hover") && state === "collapsed") {
      expandedByHover.current = true;
      toggleSidebar();
    }
    if (
      hoverState === "clear-hover" &&
      state === "expanded" &&
      expandedByHover.current &&
      !isDropdownOpen
    ) {
      toggleSidebar();
      expandedByHover.current = false;
      setHoverState("no-hover");
    }
  }, [hoverState, toggleSidebar, state, setHoverState, isDropdownOpen]);

  // Determine what to show.
  // Prioritize activeTab for main content.
  // Hover state is only for expanding the sidebar, not for switching tabs anymore.
  const selectedItem = activeTab;

  return (
    <Sidebar
      collapsible="icon"
      onMouseLeave={() => {
        if (!isDropdownOpen) {
          setHoverState("clear-hover");
        }
      }}
    >
      {/* ── Sidebar icon column premium styles ── */}
      <style>{`
        .sidebar-icon-btn {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          width: 48px;
          height: 48px;
          border-radius: 14px;
          cursor: pointer;
          border: none;
          background: transparent;
          color: var(--sidebar-foreground);
          transition: all 0.18s cubic-bezier(0.22, 1, 0.36, 1);
          text-decoration: none;
        }
        .sidebar-icon-btn:hover {
          background: var(--sidebar-accent);
        }
        .sidebar-icon-btn--active {
          background: var(--sidebar-accent);
        }
        .sidebar-icon-btn--active .sidebar-icon-label {
          color: var(--primary);
          font-weight: 700;
        }
        .sidebar-icon-btn--active svg {
          color: var(--primary);
        }
        .sidebar-icon-label {
          font-size: 10px;
          font-weight: 500;
          line-height: 1;
          opacity: 0.8;
        }

        /* Bottom utility button */
        .sidebar-util-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          width: 48px;
          height: 48px;
          border-radius: 14px;
          border: none;
          background: transparent;
          color: var(--sidebar-foreground);
          cursor: pointer;
          transition: all 0.18s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .sidebar-util-btn:hover {
          background: var(--sidebar-accent);
        }
        .sidebar-util-btn:hover svg {
          color: var(--primary);
          opacity: 1;
        }
        .sidebar-util-btn svg {
          opacity: 0.65;
          transition: all 0.18s ease;
        }
      `}</style>

      <SidebarContent className="overflow-hidden">
        <div className="flex mt-8 w-full flex-1">
          {/* Left Column: Menu items */}
          <div className="flex flex-col justify-between pb-4 h-full">
            <div>
              <SidebarTrigger
                onMouseEnter={() => {
                  setHoverState("clear-hover");
                }}
              />
              <AppIcons
                onTabChange={(tab) => {
                  setActiveTab(tab);
                  // If collapsed, expand immediately on click
                  if (state === "collapsed") {
                    toggleSidebar();
                  }
                }}
              />
            </div>
            <div className="flex items-center flex-col gap-1 mb-4">
              <OpenRouterCreditsButton />
              {/* Docs button hidden for now
              <button
                className="no-app-region-drag sidebar-util-btn"
                title="Documentación"
                onClick={() => setIsDocsOpen(true)}
              >
                <HelpCircle size={19} />
                <span className="text-[9.5px] font-semibold leading-none mt-0.5 opacity-70">
                  Docs
                </span>
              </button>
              */}

              {/* User Avatar */}
              {user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="no-app-region-drag cursor-pointer relative flex items-center justify-center rounded-full hover:ring-2 hover:ring-primary/30 transition-all w-9 h-9 mt-1"
                      title={user.displayName || user.email || "Usuario"}
                    >
                      <SimpleAvatar
                        src={(user as any).photoUrl || undefined}
                        className="h-7 w-7"
                        fallbackText={(
                          user.displayName?.[0] ||
                          user.email?.[0] ||
                          "U"
                        ).toUpperCase()}
                      />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="end" className="w-64 p-2 shadow-xl border-border/50">
                    <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1">
                      Cuenta
                    </DropdownMenuLabel>
                    <div className="flex items-center gap-3 px-2 py-3">
                      <div className="h-10 w-10">
                        <SimpleAvatar
                          src={(user as any).photoUrl || undefined}
                          fallbackText={(
                            user.displayName?.[0] ||
                            user.email?.[0] ||
                            "U"
                          ).toUpperCase()}
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold truncate">
                          {user.displayName || "Usuario"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </span>
                      </div>
                    </div>
                    <DropdownMenuItem
                      className="py-2 cursor-pointer focus:bg-accent"
                      onClick={() => setIsProfileModalOpen(true)}
                    >
                      <UserIcon className="mr-3 h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Editar Perfil</span>
                    </DropdownMenuItem>
                    {/* Hiding for now at user request */}
                    {/* 
                    <DropdownMenuItem
                      className="py-2 cursor-pointer focus:bg-accent"
                      onClick={() => setIsBackupModalOpen(true)}
                    >
                      <CloudUpload className="mr-3 h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Copias de seguridad</span>
                    </DropdownMenuItem>
                    {settings?.enableAllStatsAndLogs && (
                      <DropdownMenuItem
                        className="py-2 cursor-pointer focus:bg-accent"
                        onClick={() => navigate({ to: "/settings/ai-query-logs" })}
                      >
                        <Database className="mr-3 h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Logs de Consultas IA</span>
                      </DropdownMenuItem>
                    )}
                    */}
                    <DropdownMenuItem
                      className="py-2 cursor-pointer focus:bg-accent text-foreground"
                      onClick={handleLogout}
                    >
                      <LogOut className="mr-3 h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Cerrar sesión</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          {/* Right Column: List panel with subtle left separator */}
          <div className={cn(
            "flex-1 min-w-0",
            state === "collapsed" && "hidden",
            state === "expanded" && "border-l border-border/30"
          )}>
            <AppList show={selectedItem === "Aplicaciones"} />
            <WorkspaceList show={selectedItem === "Workspace"} />
            <NotesList show={selectedItem === "Notas"} />
            <TodosList show={selectedItem === "Tareas"} />
            <SettingsList show={selectedItem === "Ajustes"} />
            <LibraryList show={selectedItem === "Biblioteca"} />
          </div>
        </div>
      </SidebarContent>

      <SidebarRail />
      <DocumentationDialog isOpen={isDocsOpen} onOpenChange={setIsDocsOpen} />

      {/* User modals */}
      {user && (
        <>
          <ProfileModal
            isOpen={isProfileModalOpen}
            onClose={() => setIsProfileModalOpen(false)}
            user={user}
          />
          <BackupModal
            isOpen={isBackupModalOpen}
            onClose={() => setIsBackupModalOpen(false)}
          />
        </>
      )}
    </Sidebar>
  );
}

function AppIcons({ onTabChange }: { onTabChange: (tab: string) => void }) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const selectedAppId = useAtomValue(selectedAppIdAtom);

  // Filtrar el botón de Chat si no hay app seleccionada
  const displayItems = selectedAppId ? [...items] : items.filter(item => item.title !== "Chat");

  return (
    <SidebarGroup className="pr-0">
      <SidebarGroupContent>
        <SidebarMenu>
          {displayItems.map((item) => {
            const isActive =
              (item.to === "/" && pathname === "/") ||
              (item.to !== "/" && pathname.startsWith(item.to));

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  size="sm"
                  className="font-medium w-14"
                >
                  <Link
                    to={item.to}
                    className={`sidebar-icon-btn mb-1 ${isActive ? "sidebar-icon-btn--active" : ""}`}
                    onClick={() => {
                      if (item.title === "Apps") {
                        onTabChange("Aplicaciones");
                      } else if (item.title === "Agente") {
                        onTabChange("Workspace");
                      } else if (item.title === "Notas") {
                        onTabChange("Notas");
                      } else if (item.title === "Ajustes") {
                        onTabChange("Ajustes");
                      } else if (item.title === "Biblioteca") {
                        onTabChange("Biblioteca");
                      }
                    }}
                  >
                    <item.icon className="h-[18px] w-[18px]" />
                    <span className="sidebar-icon-label">{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
