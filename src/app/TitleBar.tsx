import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { isPreviewExpandedAtom } from "@/atoms/viewAtoms";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useRouter, useLocation } from "@tanstack/react-router";
import { useSettings } from "@/hooks/useSettings";
import { useDeepLink } from "@/contexts/DeepLinkContext";
import { useEffect, useState } from "react";
import { isElectron } from "@/lib/transport";

import { ipc } from "@/ipc/types";
import { ActionHeader } from "@/components/preview_panel/ActionHeader";
import { WindowsControls } from "@/components/WindowsControls";

export const TitleBar = () => {
  // In web mode, no title bar — browser provides its own chrome
  if (!isElectron) return null;
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const { apps } = useLoadApps();
  const { navigate } = useRouter();
  const location = useLocation();
  const { settings, refreshSettings } = useSettings();
  const [showWindowControls, setShowWindowControls] = useState(false);
  const isPreviewExpanded = useAtomValue(isPreviewExpandedAtom);



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



  const { lastDeepLink, clearLastDeepLink } = useDeepLink();
  useEffect(() => {
    const handleDeepLink = async () => {
      if (lastDeepLink?.type === "vibes-pro-return") {
        await refreshSettings();
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

        {/* Logo hidden for now */}


        {
          <div className="flex-1 flex justify-end items-center mr-2">
            {
              location.pathname === "/chat" && !isPreviewExpanded && (
                <ActionHeader />
              )
            }
          </div>
        }

        {showWindowControls && <WindowsControls className="ml-auto h-full pr-1" buttonClassName="h-full" />}
      </div >


    </>
  );
};


