import { dropdownOpenAtom } from "@/atoms/uiAtoms";
import { useSidebar } from "@/components/ui/sidebar"; // import useSidebar hook
import { Link, useRouterState } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { CheckSquare, Home, Inbox, Settings, StickyNote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { OpenRouterCreditsButton } from "./OpenRouterCreditsButton";

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
import { ChatList } from "./ChatList";
import { LibraryList } from "./LibraryList";
import { NotesList } from "./NotesList";
import { SettingsList } from "./SettingsList";
import { TodosList } from "./TodosList";

// Menu items.
const items = [
  {
    title: "Apps",
    to: "/",
    icon: Home,
  },
  {
    title: "Chat",
    to: "/chat",
    icon: Inbox,
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
  | "start-hover:chat"
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

  const routerState = useRouterState();
  const isAppRoute =
    routerState.location.pathname === "/" ||
    routerState.location.pathname.startsWith("/app-details");
  const isChatRoute = routerState.location.pathname === "/chat";
  const isSettingsRoute = routerState.location.pathname.startsWith("/settings");
  const isLibraryRoute =
    routerState.location.pathname.startsWith("/library") ||
    routerState.location.pathname.startsWith("/themes");
  const isTodosRoute = routerState.location.pathname.startsWith("/todos");

  // Sync activeTab with route changes
  useEffect(() => {
    if (isAppRoute) {
      setActiveTab("Aplicaciones");
    } else if (isChatRoute) {
      setActiveTab("Chat");
    } else if (routerState.location.pathname.startsWith("/notes")) {
      setActiveTab("Notas");
    } else if (isTodosRoute) {
      setActiveTab("Tareas");
    } else if (isSettingsRoute) {
      setActiveTab("Ajustes");
    } else if (isLibraryRoute) {
      setActiveTab("Biblioteca");
    }
  }, [
    isAppRoute,
    isChatRoute,
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
        <div className="flex mt-8">
          {/* Left Column: Menu items */}
          <div className="">
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
          {/* Right Column: Chat List Section */}
          <div className="w-[405px]">
            <AppList show={selectedItem === "Aplicaciones"} />
            <ChatList show={selectedItem === "Chat"} />
            <NotesList show={selectedItem === "Notas"} />
            <TodosList show={selectedItem === "Tareas"} />
            <SettingsList show={selectedItem === "Ajustes"} />
            <LibraryList show={selectedItem === "Biblioteca"} />
          </div>
        </div>
      </SidebarContent>

      {/*<SidebarFooter>*/}
      {/*  <SidebarMenu>*/}
      {/*    <SidebarMenuItem>*/}
      {/*      /!* Change button to open dialog instead of linking *!/*/}
      {/*      <SidebarMenuButton*/}
      {/*        size="sm"*/}
      {/*        className="font-medium w-14 flex flex-col items-center gap-1 h-14 mb-2 rounded-2xl"*/}
      {/*        onClick={() => setIsHelpDialogOpen(true)} // Open dialog on click*/}
      {/*      >*/}
      {/*        <HelpCircle className="h-5 w-5" />*/}
      {/*        <span className={"text-xs"}>Ayuda</span>*/}
      {/*      </SidebarMenuButton>*/}
      {/*      <HelpDialog*/}
      {/*        isOpen={isHelpDialogOpen}*/}
      {/*        onClose={() => setIsHelpDialogOpen(false)}*/}
      {/*      />*/}
      {/*    </SidebarMenuItem>*/}
      {/*  </SidebarMenu>*/}
      {/*</SidebarFooter>*/}

      <SidebarRail />
    </Sidebar>
  );
}

function AppIcons({ onTabChange }: { onTabChange: (tab: string) => void }) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const displayItems = [...items];

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
                    className={`flex flex-col items-center gap-1 h-14 mb-2 rounded-2xl ${
                      isActive ? "bg-sidebar-accent" : ""
                    }`}
                    onClick={() => {
                      if (item.title === "Aplicaciones") {
                        onTabChange("Aplicaciones");
                      } else if (item.title === "Chat") {
                        onTabChange("Chat");
                      } else if (item.title === "Notas") {
                        onTabChange("Notas");
                      } else if (item.title === "Ajustes") {
                        onTabChange("Ajustes");
                      } else if (item.title === "Biblioteca") {
                        onTabChange("Biblioteca");
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
          <SidebarMenuItem>
            <OpenRouterCreditsButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
