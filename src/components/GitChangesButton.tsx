import { useCallback } from "react";
import { GitBranch } from "lucide-react";
import { ipc } from "@/ipc/types";
import { useTheme } from "@/contexts/ThemeContext";
import { useUncommittedFiles } from "@/hooks/useUncommittedFiles";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface GitChangesButtonProps {
  appId: number;
}

/**
 * Standalone git button that shows when there are unpushed changes
 * (uncommitted files OR commits ahead of remote).
 * Opens the advanced Git window on click.
 *
 * Extracted from ServerControlButton so it renders independently
 * of the language-gated server controls.
 */
export function GitChangesButton({ appId }: GitChangesButtonProps) {
  const { theme, intensity } = useTheme();

  // Detect unpushed git changes
  const { hasUncommittedFiles, uncommittedFiles } = useUncommittedFiles(appId);
  const { data: gitState } = useQuery({
    queryKey: ["git-state", appId],
    queryFn: async () => {
      try {
        return await ipc.github.getGitState({ appId });
      } catch {
        return null;
      }
    },
    enabled: appId !== null,
    refetchInterval: 5000,
  });

  const hasUnpushedChanges = hasUncommittedFiles || (gitState?.ahead ?? 0) > 0;

  const handleOpenGitWindow = useCallback(() => {
    ipc.system.openGitWindow({
      appId,
      theme,
      themeIntensity: intensity,
    });
  }, [appId, theme, intensity]);

  // Build git button tooltip
  const gitTooltip = (() => {
    const parts: string[] = [];
    if (hasUncommittedFiles) {
      parts.push(`${uncommittedFiles.length} cambio${uncommittedFiles.length !== 1 ? "s" : ""} sin confirmar`);
    }
    if ((gitState?.ahead ?? 0) > 0) {
      parts.push(`${gitState!.ahead} commit${gitState!.ahead !== 1 ? "s" : ""} sin subir`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Abrir Git";
  })();

  if (!hasUnpushedChanges) return null;

  return (
    <button
      id="git-changes-btn"
      onClick={handleOpenGitWindow}
      className={cn(
        "relative p-1.5 rounded-md transition-all duration-200",
        "text-muted-foreground hover:text-foreground",
        "hover:bg-accent/50",
      )}
      title={gitTooltip}
    >
      <GitBranch className="h-3.5 w-3.5" />
      {/* Change indicator dot */}
      <span
        className={cn(
          "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full",
          "bg-orange-500 shadow-[0_0_4px_1px_rgba(249,115,22,0.4)]",
          "animate-pulse",
        )}
      />
    </button>
  );
}
