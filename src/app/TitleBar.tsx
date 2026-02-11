import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useRouter, useLocation } from "@tanstack/react-router";
import { useSettings } from "@/hooks/useSettings";
import { useVersions } from "@/hooks/useVersions";
import { Button } from "@/components/ui/button";
// @ts-ignore
import logo from "../../assets/logo.svg";
import { cn } from "@/lib/utils";
import { useDeepLink } from "@/contexts/DeepLinkContext";
import { useEffect, useState } from "react";
import { DyadProSuccessDialog } from "@/components/DyadProSuccessDialog";
import { useTheme } from "@/contexts/ThemeContext";
import { ipc } from "@/ipc/types";
import { useUserBudgetInfo } from "@/hooks/useUserBudgetInfo";
import type { UserBudgetInfo } from "@/ipc/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ActionHeader } from "@/components/preview_panel/ActionHeader";
import { SimpleAvatar } from "@/components/ui/SimpleAvatar";
import { AuthModal } from "@/components/AuthModal";
import { userAtom } from "@/atoms/authAtoms";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { ProfileModal } from "@/components/ProfileModal";
import { BackupModal } from "@/components/BackupModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon, Palette, CloudUpload, ScrollText } from "lucide-react";

export const TitleBar = () => {
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const { apps } = useLoadApps();
  const { navigate } = useRouter();
  const location = useLocation();
  const { settings, refreshSettings } = useSettings();
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const [showWindowControls, setShowWindowControls] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const user = useAtomValue(userAtom);
  const { versions, loading: versionsLoading } = useVersions(selectedAppId);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  useEffect(() => {
    // Check if we're running on Windows
    const checkPlatform = async () => {
      try {
        const platform = await ipc.system.getSystemPlatform();
        setShowWindowControls(platform !== "darwin");
      } catch (error) {
        console.error("Failed to get platform info:", error);
      }
    };

    checkPlatform();
  }, []);

  const showDyadProSuccessDialog = () => {
    setIsSuccessDialogOpen(true);
  };

  const { lastDeepLink, clearLastDeepLink } = useDeepLink();
  useEffect(() => {
    const handleDeepLink = async () => {
      if (lastDeepLink?.type === "dyad-pro-return") {
        await refreshSettings();
        showDyadProSuccessDialog();
        clearLastDeepLink();
      }
    };
    handleDeepLink();
  }, [lastDeepLink?.timestamp]);

  // Get selected app name
  const selectedApp = apps.find((app) => app.id === selectedAppId);
  const displayText = selectedApp
    ? `${selectedApp.name}`
    : "No has seleccionado app";

  const handleAppClick = () => {
    if (selectedApp) {
      navigate({ to: "/app-details", search: { appId: selectedApp.id } });
    }
  };
  return (
    <>
      <div className="@container z-11 w-full h-11 bg-(--sidebar) absolute top-0 left-0 app-region-drag flex items-center">
        <div className={`${showWindowControls ? "pl-2" : "pl-18"}`}></div>

        <img src={logo} alt="Vibes Logo" className="w-6 h-6 mr-0.5" />
        <Button
          data-testid="title-bar-app-name-button"
          variant="outline"
          size="sm"
          className={`hidden @2xl:block no-app-region-drag text-xs max-w-60 truncate font-medium ${selectedApp ? "cursor-pointer" : ""
            }`}
          onClick={handleAppClick}
        >
          {displayText}
        </Button>
        <div className="ml-2 no-app-region-drag flex items-center">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="cursor-pointer">
                  <SimpleAvatar
                    src={user.photoURL || undefined}
                    className="h-6 w-6"
                    fallbackText={(
                      user.displayName?.[0] ||
                      user.email?.[0] ||
                      "U"
                    ).toUpperCase()}
                  />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 p-2 shadow-xl border-border/50">
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
                  className="py-2 cursor-pointer focus:bg-accent text-foreground"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-3 h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Cerrar sesión</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="cursor-pointer"
                  onClick={() => setIsAuthModalOpen(true)}
                >
                  <SimpleAvatar className="h-6 w-6" fallbackText={<UserIcon className="h-4 w-4" />} />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Iniciar sesión / Registrarse</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Preview Header */}
        {
          location.pathname === "/chat" && (
            <div className="flex-1 flex justify-end">
              <ActionHeader
                versions={versions}
                versionsLoading={versionsLoading}
              />
            </div>
          )
        }

        {showWindowControls && <WindowsControls />}
      </div >

      <DyadProSuccessDialog
        isOpen={isSuccessDialogOpen}
        onClose={() => setIsSuccessDialogOpen(false)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {
        user && (
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
        )
      }
    </>
  );
};

function WindowsControls() {
  const { isDarkMode } = useTheme();

  const minimizeWindow = () => {
    ipc.system.minimizeWindow();
  };

  const maximizeWindow = () => {
    ipc.system.maximizeWindow();
  };

  const closeWindow = () => {
    ipc.system.closeWindow();
  };

  return (
    <div className="ml-auto flex no-app-region-drag">
      <button
        className="w-10 h-10 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        onClick={minimizeWindow}
        aria-label="Minimize"
      >
        <svg
          width="12"
          height="1"
          viewBox="0 0 12 1"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            width="12"
            height="1"
            fill={isDarkMode ? "#ffffff" : "#000000"}
          />
        </svg>
      </button>
      <button
        className="w-10 h-10 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        onClick={maximizeWindow}
        aria-label="Maximize"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="0.5"
            y="0.5"
            width="11"
            height="11"
            stroke={isDarkMode ? "#ffffff" : "#000000"}
          />
        </svg>
      </button>
      <button
        className="w-10 h-10 flex items-center justify-center hover:bg-red-500 transition-colors"
        onClick={closeWindow}
        aria-label="Close"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 1L11 11M1 11L11 1"
            stroke={isDarkMode ? "#ffffff" : "#000000"}
            strokeWidth="1.5"
          />
        </svg>
      </button>
    </div>
  );
}
