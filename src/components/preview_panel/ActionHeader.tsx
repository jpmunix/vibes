import { useAtom, useAtomValue } from "jotai";
import { previewModeAtom, selectedAppIdAtom, currentAppAtom } from "../../atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { ExpandPreviewButton, OpenExternalButton, DeviceModeButton } from "./PreviewIframe";


import {
  Eye,
  Code,
  Cog,
  Trash2,
  AlertTriangle,
  Globe,
  Shield,
  History,
  GitBranch,
  RefreshCw,
  Hammer,
  ChevronDown,
  Database,
  Square,
  Logs,
  FolderOpen,
} from "@/components/ui/icons";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, useCallback } from "react";

import { useRunApp } from "@/hooks/useRunApp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { showError, showSuccess } from "@/lib/toast";
import { useMutation } from "@tanstack/react-query";
import { useCheckProblems } from "@/hooks/useCheckProblems";
import { isPreviewOpenAtom } from "@/atoms/viewAtoms";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

import { useVersions } from "@/hooks/useVersions";
import { useSettings } from "@/hooks/useSettings";

export type PreviewMode =
  | "preview"
  | "code"
  | "problems"
  | "configure"
  | "publish"
  | "versions";

// Which top-level group a mode belongs to
type MenuGroup = "preview" | "code" | "versions" | "configure";

const MODE_TO_GROUP: Record<PreviewMode, MenuGroup> = {
  preview: "preview",
  code: "code",
  problems: "code",
  database: "code",
  versions: "versions",
  publish: "versions",
  configure: "configure",
};

// Preview Header component with preview mode toggle
export const ActionHeader = () => {
  const [previewMode, setPreviewMode] = useAtom(previewModeAtom);
  const [isPreviewOpen, setIsPreviewOpen] = useAtom(isPreviewOpenAtom);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const { versions, loading: versionsLoading } = useVersions(selectedAppId);
  const currentApp = useAtomValue(currentAppAtom);
  const hasDatabase = Boolean(currentApp?.supabaseProjectId || currentApp?.bunnyConfig || currentApp?.pocketbaseConfig);
  const { theme, intensity } = useTheme();
  const { settings } = useSettings();
  const memoriesEnabled = settings?.memoriesEnabled !== false;
  const previewGroupRef = useRef<HTMLButtonElement>(null);
  const codeGroupRef = useRef<HTMLButtonElement>(null);
  const versionsGroupRef = useRef<HTMLButtonElement>(null);
  const configureRef = useRef<HTMLButtonElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const { problemReport } = useCheckProblems(selectedAppId);
  const { restartApp, stopApp, refreshAppIframe } = useRunApp();

  // Hover-to-open dropdown logic
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMenuHoverEnter = useCallback((menuId: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setOpenMenu((prev) => (prev === menuId ? prev : menuId));
  }, []);

  const handleMenuHoverLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setOpenMenu(null), 100);
  }, []);

  const isCompact = windowWidth < 888;


  // Track window width
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const selectPanel = useCallback(
    (panel: PreviewMode) => {
      if (previewMode !== panel) {
        setPreviewMode(panel);
        setIsPreviewOpen(true);
      }
    },
    [previewMode, setPreviewMode, setIsPreviewOpen],
  );

  const onRestart = useCallback(() => {
    restartApp();
  }, [restartApp]);

  const onCleanRestart = useCallback(() => {
    restartApp({ removeNodeModules: true });
  }, [restartApp]);

  const onStop = useCallback(() => {
    if (selectedAppId !== null) {
      stopApp(selectedAppId);
    }
  }, [stopApp, selectedAppId]);

  const { mutate: clearSessionData } = useMutation({
    mutationFn: () => {
      return ipc.system.clearSessionData();
    },
    onSuccess: async () => {
      await refreshAppIframe();
      showSuccess("Datos de vista previa borrados");
    },
    onError: (error) => {
      showError(`Error al borrar los datos de vista previa: ${error}`);
    },
  });

  const onClearSessionData = useCallback(() => {
    clearSessionData();
  }, [clearSessionData]);

  // Get the problem count for the selected app
  const problemCount = problemReport ? problemReport.problems.length : 0;

  // Format the problem count for display
  const formatProblemCount = (count: number): string => {
    if (count === 0) return "";
    if (count > 100) return "100+";
    return count.toString();
  };

  const displayCount = formatProblemCount(problemCount);

  // Determine which group is active
  const activeGroup = MODE_TO_GROUP[previewMode];

  // Update indicator position when mode changes
  useEffect(() => {
    const updateIndicator = () => {
      let targetRef: React.RefObject<HTMLButtonElement | null>;

      switch (activeGroup) {
        case "preview":
          targetRef = previewGroupRef;
          break;
        case "code":
          targetRef = codeGroupRef;
          break;
        case "versions":
          targetRef = versionsGroupRef;
          break;
        case "configure":
          targetRef = configureRef;
          break;
        default:
          return;
      }

      if (targetRef.current) {
        const button = targetRef.current;
        const container = button.parentElement;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const buttonRect = button.getBoundingClientRect();
          const left = buttonRect.left - containerRect.left;
          const width = buttonRect.width;

          setIndicatorStyle({ left, width });
        }
      }
    };

    // Small delay to ensure DOM is updated
    const timeoutId = setTimeout(updateIndicator, 10);

    // Use ResizeObserver to catch any size changes of the buttons (e.g. text changing)
    let resizeObserver: ResizeObserver | null = null;
    const container = previewGroupRef.current?.parentElement;

    if (container) {
      resizeObserver = new ResizeObserver(() => {
        // Use requestAnimationFrame to avoid ResizeObserver loop limit exceeded errors
        requestAnimationFrame(updateIndicator);
      });

      if (previewGroupRef.current) resizeObserver.observe(previewGroupRef.current);
      if (codeGroupRef.current) resizeObserver.observe(codeGroupRef.current);
      if (versionsGroupRef.current) resizeObserver.observe(versionsGroupRef.current);
      if (configureRef.current) resizeObserver.observe(configureRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [activeGroup, displayCount, isPreviewOpen, isCompact, previewMode, versions?.length, versionsLoading]);

  const iconSize = 17;

  // Dynamic label/icon for the "Código" group based on active mode
  const getCodeGroupInfo = () => {
    switch (previewMode) {
      case "code":
        return { icon: <Code size={iconSize} />, label: "Código" };
      case "problems":
        return {
          icon: <AlertTriangle size={iconSize} />,
          label: "Problemas",
        };
      default:
        return { icon: <Code size={iconSize} />, label: "Código" };
    }
  };

  // Dynamic label/icon for the "Versión" group based on active mode
  const getVersionGroupInfo = () => {
    switch (previewMode) {
      case "versions":
        return {
          icon: <History size={iconSize} />,
          label: versionsLoading
            ? "..."
            : `Versión ${versions.length}`,
        };
      case "publish":
        return { icon: <Globe size={iconSize} />, label: "Publicar" };
      default:
        return {
          icon: <History size={iconSize} />,
          label: versionsLoading
            ? "..."
            : `Versión ${versions.length}`,
        };
    }
  };

  const codeGroupInfo = getCodeGroupInfo();
  const versionGroupInfo = getVersionGroupInfo();

  // Button style for the 3 main groups
  const groupButtonBase = "no-app-region-drag cursor-pointer relative flex items-center gap-1.5 px-4 h-8 rounded-lg typo-tab z-10 transition-all duration-150";
  const groupButtonClass = (isActive: boolean) =>
    `${groupButtonBase} ${isActive && isPreviewOpen ? "text-primary" : "hover:bg-sidebar-accent"}`;

  return (
    <TooltipProvider>
      <div className="no-app-region-drag flex items-center justify-between px-3 py-2 border-b border-border bg-sidebar h-[45px]">
        <div className="relative flex rounded-md p-0.5 gap-0.5">
          <motion.div
            className="absolute top-0.5 bottom-0.5 bg-sidebar-accent rounded-lg"
            animate={{
              left: indicatorStyle.left,
              width: indicatorStyle.width,
              opacity: isPreviewOpen ? 1 : 0,
            }}
            transition={{
              type: "spring",
              stiffness: 600,
              damping: 35,
              mass: 0.6,
            }}
          />

          {/* ─── Vista previa group ─── */}
          <DropdownMenu modal={false} open={openMenu === "preview"} onOpenChange={(open) => { if (!open) setOpenMenu(null); }}>
            <DropdownMenuTrigger asChild>
              <button
                ref={previewGroupRef}
                data-testid="preview-group-button"
                className={groupButtonClass(activeGroup === "preview")}
                onMouseEnter={() => handleMenuHoverEnter("preview")}
                onMouseLeave={handleMenuHoverLeave}
                onClick={() => selectPanel("preview")}
              >
                <Eye size={iconSize} />
                {!isCompact && <span>Vista previa</span>}
                <ChevronDown size={10} className={activeGroup === "preview" && isPreviewOpen ? "text-primary/60" : "text-muted-foreground"} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80" onMouseEnter={() => handleMenuHoverEnter("preview")} onMouseLeave={handleMenuHoverLeave}>
              <DropdownMenuItem
                onClick={() => selectPanel("preview")}
                className={cn(
                  previewMode === "preview" && "bg-accent",
                )}
              >
                <Eye size={14} />
                <span>Vista previa</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRestart}>
                <RefreshCw size={14} />
                <div className="flex flex-col">
                  <span>Reiniciar</span>
                  <span className="typo-caption opacity-80">
                    Reinicia el servidor de desarrollo
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onStop}>
                <Square size={14} />
                <div className="flex flex-col">
                  <span>Detener servidor</span>
                  <span className="typo-caption opacity-80">
                    Detiene el servidor de desarrollo
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCleanRestart}>
                <Hammer size={14} />
                <div className="flex flex-col">
                  <span>Reconstruir</span>
                  <span className="typo-caption opacity-80">
                    Reinstala node_modules y reinicia
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onClearSessionData}>
                <Trash2 size={14} />
                <div className="flex flex-col">
                  <span>Borrar caché</span>
                  <span className="typo-caption opacity-80">
                    Borra cookies y almacenamiento local
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ─── Código group ─── */}
          <DropdownMenu modal={false} open={openMenu === "code"} onOpenChange={(open) => { if (!open) setOpenMenu(null); }}>
            <DropdownMenuTrigger asChild>
              <button
                ref={codeGroupRef}
                data-testid="code-group-button"
                className={groupButtonClass(activeGroup === "code")}
                onMouseEnter={() => handleMenuHoverEnter("code")}
                onMouseLeave={handleMenuHoverLeave}
                onClick={() => handleMenuHoverEnter("code")}
              >
                {codeGroupInfo.icon}
                {!isCompact && <span>{codeGroupInfo.label}</span>}
                {!isCompact && displayCount && (
                  <span className="px-1 py-0.5 typo-micro bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full min-w-[16px] text-center">
                    {displayCount}
                  </span>
                )}
                <ChevronDown size={10} className={activeGroup === "code" && isPreviewOpen ? "text-primary/60" : "text-muted-foreground"} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52" onMouseEnter={() => handleMenuHoverEnter("code")} onMouseLeave={handleMenuHoverLeave}>
              <DropdownMenuItem
                onClick={() => {
                  if (selectedAppId != null) {
                    ipc.system.openCodeWindow({
                      appId: selectedAppId,
                      theme,
                      themeIntensity: intensity,
                    });
                  }
                }}
                disabled={selectedAppId == null}
              >
                <FolderOpen size={14} />
                <span>Explorar código</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => selectPanel("problems")}
                className={cn(
                  previewMode === "problems" && "bg-accent",
                )}
              >
                <AlertTriangle size={14} />
                <div className="flex items-center gap-2">
                  <span>Problemas</span>
                  {displayCount && (
                    <span className="px-1 py-0.5 typo-micro bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full min-w-[16px] text-center">
                      {displayCount}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
              {hasDatabase && (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      if (selectedAppId != null) {
                        ipc.system.openDatabaseWindow({
                          appId: selectedAppId,
                        });
                      }
                    }}
                    disabled={selectedAppId == null}
                  >
                    <Database size={14} />
                    <span>Base de datos</span>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                onClick={() => {
                  if (selectedAppId != null) {
                    ipc.system.openConsoleWindow({
                      appId: selectedAppId,
                      theme,
                      themeIntensity: intensity,
                    });
                  }
                }}
                disabled={selectedAppId == null}
              >
                <Logs size={14} />
                <span>Consola</span>
              </DropdownMenuItem>
              {memoriesEnabled && (
                <DropdownMenuItem
                  onClick={() => {
                    if (selectedAppId != null) {
                      ipc.system.openMemoryWindow({
                        appId: selectedAppId,
                        theme,
                        themeIntensity: intensity,
                      });
                    }
                  }}
                  disabled={selectedAppId == null}
                >
                  <Database size={14} />
                  <span>Directrices</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ─── Versión group ─── */}
          <DropdownMenu modal={false} open={openMenu === "versions"} onOpenChange={(open) => { if (!open) setOpenMenu(null); }}>
            <DropdownMenuTrigger asChild>
              <button
                ref={versionsGroupRef}
                data-testid="versions-group-button"
                className={groupButtonClass(activeGroup === "versions")}
                onMouseEnter={() => handleMenuHoverEnter("versions")}
                onMouseLeave={handleMenuHoverLeave}
                onClick={() => selectPanel("versions")}
              >
                {versionGroupInfo.icon}
                {!isCompact && <span>{versionGroupInfo.label}</span>}
                <ChevronDown size={10} className={activeGroup === "versions" && isPreviewOpen ? "text-primary/60" : "text-muted-foreground"} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52" onMouseEnter={() => handleMenuHoverEnter("versions")} onMouseLeave={handleMenuHoverLeave}>
              <DropdownMenuItem
                onClick={() => selectPanel("versions")}
                className={cn(
                  previewMode === "versions" && "bg-accent",
                )}
              >
                <History size={14} />
                <span>
                  {versionsLoading
                    ? "Versiones..."
                    : `Versión ${versions.length}`}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (selectedAppId != null) {
                    ipc.system.openGitWindow({ appId: selectedAppId, theme, themeIntensity: intensity });
                  }
                }}
              >
                <GitBranch size={14} />
                <span>Git</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => selectPanel("publish")}
                className={cn(
                  previewMode === "publish" && "bg-accent",
                )}
              >
                <Globe size={14} />
                <span>Publicar</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ─── Configurar (direct) ─── */}
          {(() => {
            const buttonContent = (
              <button
                ref={configureRef}
                data-testid="configure-mode-button"
                className={groupButtonClass(activeGroup === "configure")}
                onClick={() => selectPanel("configure")}
              >
                <Cog size={iconSize} />
                {!isCompact && <span>Configurar</span>}
              </button>
            );

            if (isCompact) {
              return (
                <Tooltip>
                  <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
                  <TooltipContent>
                    <p>Configurar</p>
                  </TooltipContent>
                </Tooltip>
              );
            }
            return buttonContent;
          })()}
        </div>

        {/* ─── Action buttons (far right) ─── */}
        <div className="flex items-center gap-1">
          <OpenExternalButton />
          <DeviceModeButton />
          <ExpandPreviewButton position="left" />
          <ExpandPreviewButton position="right" />
        </div>
      </div>
    </TooltipProvider>
  );
};
