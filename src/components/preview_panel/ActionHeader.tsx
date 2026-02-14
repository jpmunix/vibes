import { useAtom, useAtomValue } from "jotai";
import { previewModeAtom, selectedAppIdAtom, currentAppAtom } from "../../atoms/appAtoms";
import { ipc } from "@/ipc/types";
import type { User } from "firebase/auth";

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
  LogOut,
  User as UserIcon,
  CloudUpload,
} from "lucide-react";
import { ChatActivityButton } from "@/components/chat/ChatActivity";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, useCallback } from "react";
import { SimpleAvatar } from "@/components/ui/SimpleAvatar";

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
type MenuGroup = "preview" | "code" | "configure";

const MODE_TO_GROUP: Record<PreviewMode, MenuGroup> = {
  preview: "preview",
  code: "code",
  problems: "code",
  publish: "code",
  security: "code",
  versions: "code",
  git: "code",
  database: "code",
  configure: "configure",
};

interface ActionHeaderProps {
  versions?: any[];
  versionsLoading?: boolean;
  user?: User | null;
  isAuthModalOpen?: boolean;
  setIsAuthModalOpen?: (open: boolean) => void;
  isProfileModalOpen?: boolean;
  setIsProfileModalOpen?: (open: boolean) => void;
  isBackupModalOpen?: boolean;
  setIsBackupModalOpen?: (open: boolean) => void;
  handleLogout?: () => void;
  navigate?: any;
}

// Preview Header component with preview mode toggle
export const ActionHeader = ({
  versions = [],
  versionsLoading = false,
  user,
  isAuthModalOpen,
  setIsAuthModalOpen,
  isProfileModalOpen,
  setIsProfileModalOpen,
  isBackupModalOpen,
  setIsBackupModalOpen,
  handleLogout,
  navigate,
}: ActionHeaderProps) => {
  const [previewMode, setPreviewMode] = useAtom(previewModeAtom);
  const [isPreviewOpen, setIsPreviewOpen] = useAtom(isPreviewOpenAtom);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const currentApp = useAtomValue(currentAppAtom);
  const hasSupabase = Boolean(currentApp?.supabaseProjectId);
  const previewGroupRef = useRef<HTMLButtonElement>(null);
  const codeGroupRef = useRef<HTMLButtonElement>(null);
  const configureRef = useRef<HTMLButtonElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const { problemReport } = useCheckProblems(selectedAppId);
  const { restartApp, refreshAppIframe } = useRunApp();

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
    return () => clearTimeout(timeoutId);
  }, [activeGroup, displayCount, isPreviewOpen, isCompact]);

  const iconSize = 15;

  // Dynamic label/icon for the "Código" group based on active mode
  const getCodeGroupInfo = () => {
    switch (previewMode) {
      case "versions":
        return {
          icon: <History size={iconSize} />,
          label: versionsLoading
            ? "..."
            : `Versión ${versions.length}`,
        };
      case "code":
        return { icon: <Code size={iconSize} />, label: "Código" };
      case "publish":
        return { icon: <Globe size={iconSize} />, label: "Publicar" };
      case "problems":
        return {
          icon: <AlertTriangle size={iconSize} />,
          label: "Problemas",
        };
      case "security":
        return { icon: <Shield size={iconSize} />, label: "Seguridad" };
      case "git":
        return { icon: <GitBranch size={iconSize} />, label: "Git" };
      case "database":
        return { icon: <Database size={iconSize} />, label: "Base de datos" };
      default:
        return { icon: <Code size={iconSize} />, label: "Código" };
    }
  };

  const codeGroupInfo = getCodeGroupInfo();

  // Button style for the 3 main groups
  const groupButtonClass =
    "no-app-region-drag cursor-pointer relative flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium z-10 hover:bg-[var(--background)] transition-colors";

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
                onClick={() => selectPanel("code")}
                className={cn(previewMode === "code" && "bg-accent")}
              >
                <Code size={14} />
                <span>Código</span>
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
              <DropdownMenuItem
                onClick={() => selectPanel("security")}
                className={cn(
                  previewMode === "security" && "bg-accent",
                )}
              >
                <Shield size={14} />
                <span>Seguridad</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => selectPanel("git")}
                className={cn(previewMode === "git" && "bg-accent")}
              >
                <GitBranch size={14} />
                <span>Git</span>
              </DropdownMenuItem>
              {hasSupabase && (
                <DropdownMenuItem
                  onClick={() => selectPanel("database")}
                  className={cn(previewMode === "database" && "bg-accent")}
                >
                  <Database size={14} />
                  <span>Base de datos</span>
                </DropdownMenuItem>
              )}
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

        {/* Chat activity bell and user avatar */}
        <div className="flex items-center gap-1">
          <ChatActivityButton />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="cursor-pointer ml-1">
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
              <DropdownMenuContent align="end" className="w-64 p-2 shadow-xl border-border/50">
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
                  onClick={() => setIsProfileModalOpen?.(true)}
                >
                  <UserIcon className="mr-3 h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Editar Perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="py-2 cursor-pointer focus:bg-accent"
                  onClick={() => setIsBackupModalOpen?.(true)}
                >
                  <CloudUpload className="mr-3 h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Copias de seguridad</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="py-2 cursor-pointer focus:bg-accent"
                  onClick={() => navigate?.({ to: "/settings/ai-query-logs" })}
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
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="cursor-pointer ml-1"
                  onClick={() => setIsAuthModalOpen?.(true)}
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
      </div>
    </TooltipProvider>
  );
};
