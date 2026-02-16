import { dropdownOpenAtom } from "@/atoms/uiAtoms";
import { useSidebar } from "@/components/ui/sidebar"; // import useSidebar hook
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAtom, useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import {
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
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { AuthModal } from "@/components/AuthModal";
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
import { DebatesList } from "./DebatesList";

// Menu items.
const items = [
  {
    title: "Apps",
    to: "/",
    icon: Home,
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
    title: "Debates",
    to: "/debates",
    icon: MessageCircle,
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
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
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
    } else if (routerState.location.pathname.startsWith("/debates")) {
      setActiveTab("Debates");
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
            <div className="flex items-center flex-col gap-2 mb-4">
              <OpenRouterCreditsButton />
              <button
                className="no-app-region-drag cursor-pointer relative flex items-center gap-1 px-2 py-2 rounded-2xl flex-col hover:bg-sidebar-accent transition-colors w-14 h-14 text-foreground"
                title="Documentación"
                onClick={() => setIsDocsOpen(true)}
              >
                <HelpCircle size={20} />
                <span className="text-[10px] font-bold leading-none mt-1">
                  Docs
                </span>
              </button>

              {/* User Avatar */}
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="no-app-region-drag cursor-pointer relative flex items-center gap-1 px-2 py-2 rounded-2xl flex-col hover:bg-sidebar-accent transition-colors w-14 h-14"
                      title={user.displayName || user.email || "Usuario"}
                    >
                      <SimpleAvatar
                        src={user.photoURL || undefined}
                        className="h-7 w-7"
                        fallbackText={(
                          user.displayName?.[0] ||
                          user.email?.[0] ||
                          "U"
                        ).toUpperCase()}
                      />
                      <span className="text-[10px] font-bold leading-none mt-0.5 truncate max-w-[50px]">
                        {(user.displayName || "Perfil").split(" ")[0]}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="end" className="w-64 p-2 shadow-xl border-border/50">
                    <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1">
                      Cuenta
                    </DropdownMenuLabel>
                    <div className="flex items-center gap-3 px-2 py-3">
                      <div className="h-10 w-10">
                        <SimpleAvatar
                          src={user.photoURL || undefined}
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
                    <DropdownMenuItem
                      className="py-2 cursor-pointer focus:bg-accent"
                      onClick={() => setIsBackupModalOpen(true)}
                    >
                      <CloudUpload className="mr-3 h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Copias de seguridad</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="py-2 cursor-pointer focus:bg-accent"
                      onClick={() => navigate({ to: "/settings/ai-query-logs" })}
                    >
                      <Database className="mr-3 h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Logs de Consultas IA</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="py-2 cursor-pointer focus:bg-accent text-foreground"
                      onClick={handleLogout}
                    >
                      <LogOut className="mr-3 h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Cerrar sesión</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <button
                  className="no-app-region-drag cursor-pointer relative flex items-center gap-1 px-2 py-2 rounded-2xl flex-col hover:bg-sidebar-accent transition-colors w-14 h-14 text-foreground"
                  title="Iniciar sesión"
                  onClick={() => setIsAuthModalOpen(true)}
                >
                  <SimpleAvatar className="h-7 w-7" fallbackText={<UserIcon className="h-4 w-4" />} />
                  <span className="text-[10px] font-bold leading-none mt-0.5">
                    Login
                  </span>
                </button>
              )}
            </div>
          </div>
          {/* Right Column: Chat List Section */}
          <div className={cn("flex-1 min-w-0", state === "collapsed" && "hidden")}>
            <AppList show={selectedItem === "Aplicaciones"} />
            <NotesList show={selectedItem === "Notas"} />
            <TodosList show={selectedItem === "Tareas"} />
            <SettingsList show={selectedItem === "Ajustes"} />
            <LibraryList show={selectedItem === "Biblioteca"} />
            <DebatesList show={selectedItem === "Debates"} />
          </div>
        </div>
      </SidebarContent>

      <SidebarRail />
      <DocumentationDialog isOpen={isDocsOpen} onOpenChange={setIsDocsOpen} />

      {/* User modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
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
    // When collapsed: only show the main menu
    <SidebarGroup className="pr-0">
      {/* <SidebarGroupLabel>Dyad</SidebarGroupLabel> */}

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
                    className={`flex flex-col items-center gap-1 h-14 mb-2 rounded-2xl ${isActive ? "bg-sidebar-accent" : ""
                      }`}
                    onClick={() => {
                      if (item.title === "Apps") {
                        onTabChange("Aplicaciones");
                      } else if (item.title === "Notas") {
                        onTabChange("Notas");
                      } else if (item.title === "Ajustes") {
                        onTabChange("Ajustes");
                      } else if (item.title === "Biblioteca") {
                        onTabChange("Biblioteca");
                      } else if (item.title === "Debates") {
                        onTabChange("Debates");
                      }
                    }}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <item.icon className="h-5 w-5" />
                      <span className={"text-xs"}>{item.title}</span>
                    </div>
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
