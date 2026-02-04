import {
  Home,
  Inbox,
  Settings,
} from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useSidebar } from "@/components/ui/sidebar"; // import useSidebar hook
import { useEffect, useState, useRef } from "react";
import { useAtom } from "jotai";
import { dropdownOpenAtom } from "@/atoms/uiAtoms";

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
import { ChatList } from "./ChatList";
import { AppList } from "./AppList";
import { SettingsList } from "./SettingsList";
import { LibraryList } from "./LibraryList";

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
    title: "Ajustes",
    to: "/settings",
    icon: Settings,
  },
];

// Hover state types
type HoverState =
  | "start-hover:app"
  | "start-hover:chat"
  | "start-hover:settings"
  | "start-hover:library"
  | "clear-hover"
  | "no-hover";

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar(); // retrieve current sidebar state
  const [hoverState, setHoverState] = useState<HoverState>("no-hover");
  const expandedByHover = useRef(false);
  const [isDropdownOpen] = useAtom(dropdownOpenAtom);

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

  const routerState = useRouterState();
  const isAppRoute =
    routerState.location.pathname === "/" ||
    routerState.location.pathname.startsWith("/app-details");
  const isChatRoute = routerState.location.pathname === "/chat";
  const isSettingsRoute = routerState.location.pathname.startsWith("/settings");
  const isLibraryRoute =
    routerState.location.pathname.startsWith("/library") ||
    routerState.location.pathname.startsWith("/themes");

  let selectedItem: string | null = null;
  if (hoverState === "start-hover:app") {
    selectedItem = "Aplicaciones";
  } else if (hoverState === "start-hover:chat") {
    selectedItem = "Chat";
  } else if (hoverState === "start-hover:settings") {
    selectedItem = "Ajustes";
  } else if (hoverState === "start-hover:library") {
    selectedItem = "Biblioteca";
  } else if (state === "expanded") {
    if (isAppRoute) {
      selectedItem = "Aplicaciones";
    } else if (isChatRoute) {
      selectedItem = "Chat";
    } else if (isSettingsRoute) {
      selectedItem = "Ajustes";
    } else if (isLibraryRoute) {
      selectedItem = "Biblioteca";
    }
  }

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
            <AppIcons onHoverChange={setHoverState} />
          </div>
          {/* Right Column: Chat List Section */}
          <div className="w-[405px]">
            <AppList show={selectedItem === "Aplicaciones"} />
            <ChatList show={selectedItem === "Chat"} />
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

function AppIcons({
  onHoverChange,
}: {
  onHoverChange: (state: HoverState) => void;
}) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  return (
    // When collapsed: only show the main menu
    <SidebarGroup className="pr-0">
      {/* <SidebarGroupLabel>Dyad</SidebarGroupLabel> */}

      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
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
                    onMouseEnter={() => {
                      if (item.title === "Aplicaciones") {
                        onHoverChange("start-hover:app");
                      } else if (item.title === "Chat") {
                        onHoverChange("start-hover:chat");
                      } else if (item.title === "Ajustes") {
                        onHoverChange("start-hover:settings");
                      } else if (item.title === "Biblioteca") {
                        onHoverChange("start-hover:library");
                      }
                    }}
                    onClick={() => {
                      if (item.title === "Aplicaciones") {
                        onHoverChange("start-hover:app");
                      } else if (item.title === "Chat") {
                        onHoverChange("start-hover:chat");
                      } else if (item.title === "Ajustes") {
                        onHoverChange("start-hover:settings");
                      } else if (item.title === "Biblioteca") {
                        onHoverChange("start-hover:library");
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
