import { sidebarActionAtom, type SidebarAction } from "@/atoms/uiAtoms";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import {
  Bot,
  Settings,
  LogOut,
  User as UserIcon,
  Menu,
  GripVertical,
  ChevronDown,
  Plus,
  FolderPlus,
  FolderOpen,
  Search,
  FolderX,
  ShieldCheck,
  BookOpen,
  Rocket,
} from "@/components/ui/icons";
import { useEffect, useState, useCallback, useRef } from "react";
import { OpenRouterCreditsButton } from "./OpenRouterCreditsButton";


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
import { useTheme } from "@/contexts/ThemeContext";
import { isAdmin as checkIsAdmin } from "@/lib/admin";




import { SettingsList } from "./SettingsList";
import { WorkspaceList } from "./WorkspaceList";
import { showReleaseNotesBadgeAtom } from "@/atoms/uiAtoms";

// Menu items.
type NavMenuAction = { label: string; icon: React.ElementType; action: SidebarAction };

const items: {
  title: string;
  tabKey: string;
  to: string;
  icon: React.ElementType;
  menuItems?: NavMenuAction[];
}[] = [
  {
    title: "Agente",
    tabKey: "Workspace",
    to: "/",
    icon: Bot,
    menuItems: [
      { label: "Nuevo proyecto", icon: FolderPlus, action: "workspace:new-project" },
      { label: "Abrir workspace", icon: FolderOpen, action: "workspace:open-folder" },
      { label: "Buscar workspaces", icon: Search, action: "workspace:search" },
      { label: "_separator", icon: Plus, action: null },
      { label: "Cerrar workspaces", icon: FolderX, action: "workspace:bulk-close" },
    ],
  },
  {
    title: "Ajustes",
    tabKey: "Ajustes",
    to: "/settings",
    icon: Settings,
  },
];

/**
 * Top navigation bar — renders horizontally above the content area.
 * Left side: sidebar toggle + navigation items (Apps, Agente, Tareas)
 * Right side: OpenRouter credits, Settings, User avatar
 */
export function TopNavbar() {
  const { state, toggleSidebar } = useSidebar();
  const [activeTab, setActiveTab] = useActiveTab();
  const dispatchAction = useSetAtom(sidebarActionAtom);
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // User avatar state
  const user = useAtomValue(userAtom);

  const { theme, intensity } = useTheme();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const isAdmin = checkIsAdmin(user?.id);

  const showReleaseNotesBadge = useAtomValue(showReleaseNotesBadgeAtom);

  const handleOpenAdmin = () => {
    ipc.system.openAdminWindow({
      theme: theme as "light" | "dark" | "system",
      themeIntensity: intensity,
    });
  };

  const setUser = useSetAtom(userAtom);
  const handleLogout = async () => {
    try {
      const userId = (user as any)?.id || (user as any)?.uid;
      if (userId) {
        await (ipc as any).auth.logout({ userId });
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
    }
  };



  return (
    <>
      <style>{`
        /* ── Top navbar styles ── */
        .topnav {
          display: flex;
          align-items: center;
          height: 46px;
          background: var(--sidebar);
          border-bottom: 1px solid var(--border);
          padding: 0 8px;
          gap: 2px;
          flex-shrink: 0;
          z-index: 9;
          position: relative;
        }

        .topnav-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: 6px;
          height: 32px;
          padding: 0 16px;
          border-radius: 8px;
          cursor: pointer;
          border: none;
          background: transparent;
          color: var(--sidebar-foreground);
          transition: all 0.18s cubic-bezier(0.22, 1, 0.36, 1);
          text-decoration: none;
          white-space: nowrap;
        }
        .topnav-item:hover {
          background: var(--sidebar-accent);
        }
        .topnav-item--active {
          background: var(--sidebar-accent);
          color: var(--primary);
        }
        .topnav-item--active svg {
          color: var(--primary);
        }

        .topnav-separator {
          width: 1px;
          height: 20px;
          background: var(--border);
          opacity: 0.5;
          margin: 0 4px;
          flex-shrink: 0;
        }

        /* ── Dropdown menu on active nav items ── */
        .topnav-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 4px;
          min-width: 200px;
          background: var(--popover);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.18), 0 2px 8px -2px rgba(0, 0, 0, 0.1);
          padding: 4px;
          z-index: 100;
          animation: topnav-dropdown-in 0.12s ease-out;
        }
        @keyframes topnav-dropdown-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .topnav-util-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: var(--sidebar-foreground);
          cursor: pointer;
          transition: all 0.18s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .topnav-util-btn:hover {
          background: var(--sidebar-accent);
        }
        .topnav-util-btn:hover svg {
          color: var(--primary);
          opacity: 1;
        }
        .topnav-util-btn svg {
          opacity: 0.65;
          transition: all 0.18s ease;
        }

        /* Toggle button for secondary sidebar */
        .sidebar-toggle-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          height: 32px;
          padding: 0 10px;
          border-radius: 8px;
          cursor: pointer;
          border: none;
          background: transparent;
          color: var(--sidebar-foreground);
          transition: all 0.18s cubic-bezier(0.22, 1, 0.36, 1);
          opacity: 0.7;
        }
        .sidebar-toggle-btn:hover {
          background: var(--sidebar-accent);
          opacity: 1;
        }
      `}</style>

      {/* ═══ HORIZONTAL TOP NAVBAR ═══ */}
      <div className="topnav no-app-region-drag">
        {/* Left side: Section toggle + Nav items */}
        <div className="flex items-center">
          {/* Sidebar toggle — compact, as always */}
          <button
            className="sidebar-toggle-btn no-app-region-drag"
            onClick={toggleSidebar}
            title={state === "expanded" ? "Cerrar panel lateral" : "Abrir panel lateral"}
          >
            <Menu size={18} />
          </button>

          <div className="topnav-separator" />

          {/* Nav items with generous gap between them */}
          <div className="flex items-center gap-3">
            {items.map((item) => {
              const isActive = item.tabKey === activeTab;
              const hasMenu = isActive && item.menuItems && item.menuItems.length > 0;
              return (
                <div
                  key={item.title}
                  className="relative"
                  onMouseEnter={() => {
                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                    if (hasMenu) setHoveredMenu(item.tabKey);
                  }}
                  onMouseLeave={() => {
                    hoverTimeoutRef.current = setTimeout(() => setHoveredMenu(null), 150);
                  }}
                >
                  <Link
                    to={item.to}
                    className={`topnav-item typo-tab no-app-region-drag ${isActive ? "topnav-item--active" : ""}`}
                    onClick={(e) => {
                      if (hasMenu) {
                        e.preventDefault();
                        setHoveredMenu(hoveredMenu === item.tabKey ? null : item.tabKey);
                      } else if (isActive) {
                        e.preventDefault();
                      } else {
                        setActiveTab(item.tabKey);
                      }
                    }}
                  >
                    <item.icon size={17} />
                    <span>{item.title}</span>
                    {hasMenu && (
                      <ChevronDown size={12} className="opacity-50 -ml-1" />
                    )}
                  </Link>

                  {/* Hover dropdown menu */}
                  {hasMenu && hoveredMenu === item.tabKey && (
                    <div className="topnav-dropdown">
                      {item.menuItems!.map((mi, idx) => {
                        if (mi.label === "_separator") {
                          return <div key={`sep-${idx}`} className="h-px bg-border/60 my-1 mx-1" />;
                        }
                        return (
                          <button
                            key={mi.action}
                            type="button"
                            className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap"
                            onClick={() => {
                              dispatchAction({ action: mi.action, ts: Date.now() });
                              setHoveredMenu(null);
                            }}
                          >
                            <mi.icon size={14} className="opacity-60 shrink-0" />
                            <span>{mi.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right side: Docs, Credits, Settings, Avatar */}
        <div className="flex items-center gap-1 ml-auto">
          {showReleaseNotesBadge && (
            <button
              type="button"
              className="topnav-util-btn no-app-region-drag relative"
              title="Notas de Versión"
              onClick={() => {
                ipc.system.openReleaseNotesWindow({
                  theme: theme as "light" | "dark" | "system",
                  themeIntensity: intensity,
                });
              }}
            >
              <Rocket size={17} />
              <div className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
            </button>
          )}



          {/* User Avatar */}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="no-app-region-drag cursor-pointer relative flex items-center justify-center rounded-full hover:ring-2 hover:ring-primary/30 transition-all w-8 h-8"
                  title={user.displayName || user.email || "Usuario"}
                >
                  <SimpleAvatar
                    src={(user as any).photoUrl || undefined}
                    className="h-6 w-6"
                    fallbackText={(
                      user.displayName?.[0] ||
                      user.email?.[0] ||
                      "U"
                    ).toUpperCase()}
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end" className="w-64 p-2 shadow-xl border-border/50">
                <DropdownMenuLabel className="typo-micro uppercase tracking-wider px-2 py-1">
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
                    <span className="typo-label !text-sm truncate">
                      {user.displayName || "Usuario"}
                    </span>
                    <span className="typo-micro truncate">
                      {user.email}
                    </span>
                  </div>
                </div>
                <OpenRouterCreditsButton />
                <div className="h-px bg-border/50 my-1 mx-1" />
                <DropdownMenuItem
                  className="py-2 cursor-pointer focus:bg-accent"
                  onClick={() => setIsProfileModalOpen(true)}
                >
                  <UserIcon className="mr-3 h-4 w-4 text-muted-foreground" />
                  <span className="typo-tab">Editar Perfil</span>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem
                    className="py-2 cursor-pointer focus:bg-accent"
                    onClick={() => {
                      ipc.system.openDocsWindow({
                        theme: theme as "light" | "dark" | "system",
                        themeIntensity: intensity,
                      });
                    }}
                  >
                    <BookOpen className="mr-3 h-4 w-4 text-muted-foreground" />
                    <span className="typo-tab">Documentación</span>
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem
                    className="py-2 cursor-pointer focus:bg-accent"
                    onClick={handleOpenAdmin}
                  >
                    <ShieldCheck className="mr-3 h-4 w-4 text-muted-foreground" />
                    <span className="typo-tab">Admin</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="py-2 cursor-pointer focus:bg-accent text-foreground"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-3 h-4 w-4 text-muted-foreground" />
                  <span className="typo-tab">Cerrar sesión</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>



      {/* User modals */}
      {user && (
        <>
          <ProfileModal
            isOpen={isProfileModalOpen}
            onClose={() => setIsProfileModalOpen(false)}
            user={user}
          />
        </>
      )}
    </>
  );
}

/**
 * Secondary sidebar panel — shows the list views (AppList, WorkspaceList, etc.)
 * Rendered alongside the main content area, collapsible via the toggle button.
 */
export function SecondarySidebar() {
  const { state, open, setOpen, setWidth, isResizing, setIsResizing } = useSidebar();
  const [activeTab] = useActiveTab();
  const draggingRef = useRef(false);

  // ── Per-section state persistence (width + collapsed) ──
  type SectionState = { width?: string; open?: boolean };
  const stateCacheRef = useRef<Record<string, SectionState>>({});
  const dbLoadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTabRef = useRef<string | null>(null);

  const PREF_SIDEBAR_SECTIONS = "sidebar.sectionState";

  // Debounced save to DB
  const persistState = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const value = JSON.stringify(stateCacheRef.current);
      ipc.misc.setPreference({ key: PREF_SIDEBAR_SECTIONS, value }).catch(() => {});
    }, 500);
  }, []);

  // Load all section states from DB once on mount
  useEffect(() => {
    if (dbLoadedRef.current) return;
    dbLoadedRef.current = true;
    ipc.misc.getPreference({ key: PREF_SIDEBAR_SECTIONS }).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          stateCacheRef.current = parsed;
          // Apply stored state for current tab
          if (activeTab && parsed[activeTab]) {
            const s = parsed[activeTab] as SectionState;
            if (s.width) setWidth(s.width);
            if (s.open !== undefined) setOpen(s.open);
          }
        } catch { /* ignore bad data */ }
      }
    }).catch(() => {});
  }, []);

  // When the active tab changes, save current section state and restore new section state
  useEffect(() => {
    if (!activeTab) return;

    // Save outgoing section state
    if (prevTabRef.current && prevTabRef.current !== activeTab) {
      stateCacheRef.current[prevTabRef.current] = {
        ...stateCacheRef.current[prevTabRef.current],
        open,
      };
      persistState();
    }
    prevTabRef.current = activeTab;

    // Restore incoming section state
    const cached = stateCacheRef.current[activeTab];
    if (cached) {
      if (cached.width) setWidth(cached.width);
      if (cached.open !== undefined) setOpen(cached.open);
    }
  }, [activeTab]);

  // Track hamburger toggle changes → save to cache + DB
  useEffect(() => {
    if (!activeTab || !dbLoadedRef.current) return;
    stateCacheRef.current[activeTab] = {
      ...stateCacheRef.current[activeTab],
      open,
    };
    persistState();
  }, [open]);

  const onMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setIsResizing(true);
      draggingRef.current = false;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (
          !draggingRef.current &&
          Math.abs(moveEvent.clientX - event.clientX) > 5
        ) {
          draggingRef.current = true;
        }
        const newWidth = Math.max(280, Math.min(500, moveEvent.clientX));
        setWidth(`${newWidth}px`);
      };

      const onMouseUp = (upEvent: MouseEvent) => {
        setIsResizing(false);
        // Save the final width for this section
        if (draggingRef.current && activeTab) {
          const finalWidth = Math.max(280, Math.min(500, upEvent.clientX));
          const widthStr = `${finalWidth}px`;
          stateCacheRef.current[activeTab] = {
            ...stateCacheRef.current[activeTab],
            width: widthStr,
          };
          persistState();
        }
        setTimeout(() => {
          draggingRef.current = false;
        }, 100);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [setWidth, setIsResizing, activeTab, persistState],
  );

  return (
    <div
      className={cn(
        "secondary-sidebar",
        state === "collapsed" && "secondary-sidebar--collapsed",
        isResizing && "secondary-sidebar--resizing",
      )}
    >
      <style>{`
        /* ── Secondary sidebar panel ── */
        .secondary-sidebar {
          position: relative;
          width: var(--sidebar-width, 30rem);
          min-width: 280px;
          max-width: 500px;
          background: var(--sidebar);
          border-right: 1px solid var(--border);
          height: 100%;
          overflow: hidden;
          transition: width 0.2s ease-in-out, min-width 0.2s ease-in-out, opacity 0.15s ease-in-out;
          flex-shrink: 0;
        }
        .secondary-sidebar--resizing {
          transition: none !important;
        }
        .secondary-sidebar--collapsed {
          width: 0 !important;
          min-width: 0 !important;
          border-right: none;
          opacity: 0;
          pointer-events: none;
        }
        /* ── Resize handle ── */
        .sidebar-resize-handle {
          position: absolute;
          top: 0;
          right: -6px;
          width: 12px;
          height: 100%;
          cursor: col-resize;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          padding: 0;
        }
        .sidebar-resize-handle::after {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          left: 50%;
          width: 1px;
          transform: translateX(-50%);
          background: transparent;
          transition: background 0.15s ease;
        }
        .sidebar-resize-handle:hover::after {
          background: var(--primary);
          opacity: 0.5;
        }
        .sidebar-resize-grip {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 12px;
          height: 16px;
          border-radius: 3px;
          border: 1px solid var(--border);
          background: var(--sidebar);
          z-index: 1;
        }
      `}</style>

      <WorkspaceList show={activeTab === "Workspace"} />
      <SettingsList show={activeTab === "Ajustes"} />

      {/* Resize handle */}
      {state === "expanded" && (
        <button
          type="button"
          className="sidebar-resize-handle"
          tabIndex={-1}
          aria-label="Redimensionar panel"
          onMouseDown={onMouseDown}
        >
          <div className="sidebar-resize-grip">
            <GripVertical className="h-2.5 w-2.5 text-muted-foreground/60" />
          </div>
        </button>
      )}
    </div>
  );
}

/**
 * Shared hook to keep activeTab state synchronized with the current route.
 * Used by both TopNavbar and SecondarySidebar.
 */
import { atom } from "jotai";

const activeTabAtom = atom<string | null>(null);

function useActiveTab(): [string | null, (tab: string) => void] {
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const routerState = useRouterState();

  const isSettingsRoute = routerState.location.pathname.startsWith("/settings");

  // Sync activeTab with route changes
  useEffect(() => {
    if (isSettingsRoute) {
      setActiveTab("Ajustes");
    } else {
      setActiveTab("Workspace");
    }
  }, [
    isSettingsRoute,
    routerState.location.pathname,
  ]);

  return [activeTab, setActiveTab];
}

// Keep the old export name as an alias so any imports still work
export function AppSidebar() {
  return null;
}
