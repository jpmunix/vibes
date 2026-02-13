import { useAtom, useAtomValue } from "jotai";
import { previewModeAtom, selectedAppIdAtom } from "../../atoms/appAtoms";
import { ipc } from "@/ipc/types";

import {
  Eye,
  Code,
  MoreVertical,
  Cog,
  Trash2,
  AlertTriangle,
  Globe,
  Shield,
  History,
  GitBranch,
} from "lucide-react";
import { ChatActivityButton } from "@/components/chat/ChatActivity";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, useCallback } from "react";

import { useRunApp } from "@/hooks/useRunApp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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

export type PreviewMode =
  | "preview"
  | "code"
  | "problems"
  | "configure"
  | "publish"
  | "security"
  | "versions"
  | "git";

interface ActionHeaderProps {
  versions?: any[];
  versionsLoading?: boolean;
}

// Preview Header component with preview mode toggle
export const ActionHeader = ({
  versions = [],
  versionsLoading = false,
}: ActionHeaderProps) => {
  const [previewMode, setPreviewMode] = useAtom(previewModeAtom);
  const [isPreviewOpen, setIsPreviewOpen] = useAtom(isPreviewOpenAtom);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const versionsRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  const codeRef = useRef<HTMLButtonElement>(null);
  const problemsRef = useRef<HTMLButtonElement>(null);
  const configureRef = useRef<HTMLButtonElement>(null);
  const publishRef = useRef<HTMLButtonElement>(null);
  const securityRef = useRef<HTMLButtonElement>(null);
  const gitRef = useRef<HTMLButtonElement>(null);
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

  const selectPanel = (panel: PreviewMode) => {
    if (previewMode === panel) {
      setIsPreviewOpen(!isPreviewOpen);
    } else {
      setPreviewMode(panel);
      setIsPreviewOpen(true);
    }
  };

  const onCleanRestart = useCallback(() => {
    restartApp({ removeNodeModules: true });
  }, [restartApp]);

  const useClearSessionData = () => {
    return useMutation({
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
  };

  const { mutate: clearSessionData } = useClearSessionData();

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

  // Update indicator position when mode changes
  useEffect(() => {
    const updateIndicator = () => {
      let targetRef: React.RefObject<HTMLButtonElement | null>;

      switch (previewMode) {
        case "versions":
          targetRef = versionsRef;
          break;
        case "preview":
          targetRef = previewRef;
          break;
        case "code":
          targetRef = codeRef;
          break;
        case "problems":
          targetRef = problemsRef;
          break;
        case "configure":
          targetRef = configureRef;
          break;
        case "publish":
          targetRef = publishRef;
          break;
        case "security":
          targetRef = securityRef;
          break;
        case "git":
          targetRef = gitRef;
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
  }, [previewMode, displayCount, isPreviewOpen, isCompact]);

  const renderButton = (
    mode: PreviewMode,
    ref: React.RefObject<HTMLButtonElement | null>,
    icon: React.ReactNode,
    text: string,
    testId: string,
    badge?: React.ReactNode,
  ) => {
    const buttonContent = (
      <button
        data-testid={testId}
        ref={ref}
        className="no-app-region-drag cursor-pointer relative flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-medium z-10 hover:bg-[var(--background)] flex-col"
        onClick={() => selectPanel(mode)}
      >
        {icon}
        <span>
          {!isCompact && <span>{text}</span>}
          {badge}
        </span>
      </button>
    );

    if (isCompact) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
          <TooltipContent>
            <p>{text}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return buttonContent;
  };
  const iconSize = 15;

  return (
    <TooltipProvider>
      <div className="flex items-center justify-between px-1 py-2 mt-1 border-b border-border">
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
          <button
            ref={versionsRef}
            data-testid="versions-button"
            className="no-app-region-drag cursor-pointer relative flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-medium z-10 flex-col hover:bg-[var(--background)]"
            onClick={() => selectPanel("versions")}
          >
            <History size={iconSize} />
            <span>
              {versionsLoading ? "..." : `Versión ${versions.length}`}
            </span>
          </button>
          {renderButton(
            "preview",
            previewRef,
            <Eye size={iconSize} />,
            "Vista previa",
            "preview-mode-button",
          )}
          {renderButton(
            "code",
            codeRef,
            <Code size={iconSize} />,
            "Código",
            "code-mode-button",
          )}
          {renderButton(
            "publish",
            publishRef,
            <Globe size={iconSize} />,
            "Publicar",
            "publish-mode-button",
          )}
          {renderButton(
            "problems",
            problemsRef,
            <AlertTriangle size={iconSize} />,
            "Problemas",
            "problems-mode-button",
            displayCount && (
              <span className="ml-0.5 px-1 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full min-w-[16px] text-center">
                {displayCount}
              </span>
            ),
          )}
          {renderButton(
            "security",
            securityRef,
            <Shield size={iconSize} />,
            "Seguridad",
            "security-mode-button",
          )}
          {renderButton(
            "configure",
            configureRef,
            <Cog size={iconSize} />,
            "Configurar",
            "configure-mode-button",
          )}
          {renderButton(
            "git",
            gitRef,
            <GitBranch size={iconSize} />,
            "Git",
            "git-mode-button",
          )}
        </div>
        {/* Chat activity bell */}
        <div className="flex items-center gap-1">
          <ChatActivityButton />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid="preview-more-options-button"
                className="no-app-region-drag flex items-center justify-center p-1.5 rounded-md text-sm hover:bg-[var(--background-darkest)] transition-colors"
                title="Más opciones"
              >
                <MoreVertical size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={onCleanRestart}>
                <Cog size={16} />
                <div className="flex flex-col">
                  <span>Reconstruir</span>
                  <span className="text-xs text-muted-foreground">
                    Reinstala node_modules y reinicia
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onClearSessionData}>
                <Trash2 size={16} />
                <div className="flex flex-col">
                  <span>Borrar caché</span>
                  <span className="text-xs text-muted-foreground">
                    Borra cookies, almacenamiento local y otra caché de la
                    aplicación
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TooltipProvider>
  );
};
