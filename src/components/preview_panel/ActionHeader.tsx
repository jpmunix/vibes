import { useAtom, useAtomValue } from "jotai";
import { previewModeAtom, selectedAppIdAtom, currentAppAtom } from "../../atoms/appAtoms";
import { ipc } from "@/ipc/types";


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
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, useCallback } from "react";

import { useRunApp } from "@/hooks/useRunApp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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

import { useVersions } from "@/hooks/useVersions";

export type PreviewMode =
  | "preview"
  | "code"
  | "problems"
  | "configure"
  | "publish"
  | "security"
  | "versions"
  | "git"
  | "database";

// Which top-level group a mode belongs to
type MenuGroup = "preview" | "code" | "versions" | "configure";

const MODE_TO_GROUP: Record<PreviewMode, MenuGroup> = {
  preview: "preview",
  code: "code",
  problems: "code",
  database: "code",
  versions: "versions",
  git: "versions",
  publish: "versions",
  security: "versions",
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
  const previewGroupRef = useRef<HTMLButtonElement>(null);
  const codeGroupRef = useRef<HTMLButtonElement>(null);
  const versionsGroupRef = useRef<HTMLButtonElement>(null);
  const configureRef = useRef<HTMLButtonElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const { problemReport } = useCheckProblems(selectedAppId);
  const { restartApp, stopApp, refreshAppIframe } = useRunApp();

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
      if (previewMode === panel) {
        setIsPreviewOpen(!isPreviewOpen);
      } else {
        setPreviewMode(panel);
        setIsPreviewOpen(true);
      }
    },
    [previewMode, isPreviewOpen, setPreviewMode, setIsPreviewOpen],
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

  const iconSize = 15;

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
      case "database":
        return { icon: <Database size={iconSize} />, label: "Base de datos" };
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
      case "git":
        return { icon: <GitBranch size={iconSize} />, label: "Git" };
      case "publish":
        return { icon: <Globe size={iconSize} />, label: "Publicar" };
      case "security":
        return { icon: <Shield size={iconSize} />, label: "Seguridad" };
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
  const groupButtonClass =
    "no-app-region-drag cursor-pointer relative flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium z-10 hover:bg-[var(--background-lightest)] transition-colors";

  return (
    <TooltipProvider>
      <div className="no-app-region-drag flex items-center justify-between px-1 py-2 mt-1 border-b border-border">
        <div className="relative flex rounded-md p-0.5 gap-0.5">
          <motion.div
            className="absolute top-0.5 bottom-0.5 bg-[var(--background-lightest)] shadow rounded-md"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                ref={previewGroupRef}
                data-testid="preview-group-button"
                className={groupButtonClass}
              >
                <Eye size={iconSize} />
                {!isCompact && <span>Vista previa</span>}
                <ChevronDown size={10} className="text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem
                onClick={() => selectPanel("preview")}
                className={cn(
                  previewMode === "preview" && "bg-accent",
                )}
              >
                <Eye size={14} />
                <span>Vista previa</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRestart}>
                <RefreshCw size={14} />
                <div className="flex flex-col">
                  <span>Reiniciar</span>
                  <span className="text-[10px] text-muted-foreground">
                    Reinicia el servidor de desarrollo
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onStop}>
                <Square size={14} />
                <div className="flex flex-col">
                  <span>Detener servidor</span>
                  <span className="text-[10px] text-muted-foreground">
                    Detiene el servidor de desarrollo
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCleanRestart}>
                <Hammer size={14} />
                <div className="flex flex-col">
                  <span>Reconstruir</span>
                  <span className="text-[10px] text-muted-foreground">
                    Reinstala node_modules y reinicia
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onClearSessionData}>
                <Trash2 size={14} />
                <div className="flex flex-col">
                  <span>Borrar caché</span>
                  <span className="text-[10px] text-muted-foreground">
                    Borra cookies y almacenamiento local
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ─── Código group ─── */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                ref={codeGroupRef}
                data-testid="code-group-button"
                className={groupButtonClass}
              >
                {codeGroupInfo.icon}
                {!isCompact && <span>{codeGroupInfo.label}</span>}
                {!isCompact && displayCount && (
                  <span className="px-1 py-0.5 text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full min-w-[16px] text-center">
                    {displayCount}
                  </span>
                )}
                <ChevronDown size={10} className="text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem
                onClick={() => selectPanel("code")}
                className={cn(previewMode === "code" && "bg-accent")}
              >
                <Code size={14} />
                <span>Código</span>
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
                    <span className="px-1 py-0.5 text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full min-w-[16px] text-center">
                      {displayCount}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
              {hasDatabase && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => selectPanel("database")}
                    className={cn(previewMode === "database" && "bg-accent")}
                  >
                    <Database size={14} />
                    <span>Base de datos</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ─── Versión group ─── */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                ref={versionsGroupRef}
                data-testid="versions-group-button"
                className={groupButtonClass}
              >
                {versionGroupInfo.icon}
                {!isCompact && <span>{versionGroupInfo.label}</span>}
                <ChevronDown size={10} className="text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
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
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => selectPanel("git")}
                className={cn(previewMode === "git" && "bg-accent")}
              >
                <GitBranch size={14} />
                <span>Git</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => selectPanel("publish")}
                className={cn(
                  previewMode === "publish" && "bg-accent",
                )}
              >
                <Globe size={14} />
                <span>Publicar</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => selectPanel("security")}
                className={cn(
                  previewMode === "security" && "bg-accent",
                )}
              >
                <Shield size={14} />
                <span>Seguridad</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ─── Configurar (direct) ─── */}
          {(() => {
            const buttonContent = (
              <button
                ref={configureRef}
                data-testid="configure-mode-button"
                className={groupButtonClass}
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

      </div>
    </TooltipProvider>
  );
};
