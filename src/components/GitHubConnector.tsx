import { useState, useEffect, useCallback, useRef } from "react";
import { ipc, type GithubSyncOptions, type GitPreview } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import {
  Github,
  Clipboard,
  Check,
  AlertTriangle,
  ChevronRight,
  GitMerge,
  FileWarning,
  Trash2,
  Upload,
  Download,
  Loader2,
  Ban,
  ShieldCheck,
  ArrowDownToLine,
  Wrench,
} from "@/components/ui/icons";
import { useSettings } from "@/hooks/useSettings";
import { useLoadApp } from "@/hooks/useLoadApp";
import { useUncommittedFiles } from "@/hooks/useUncommittedFiles";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { GithubBranchManager } from "@/components/GithubBranchManager";

type SyncResult =
  | { error: Error; handled?: boolean }
  | { error?: undefined; handled?: boolean };

interface GitHubConnectorProps {
  appId: number | null;
  folderName: string;
  expanded?: boolean;
}

interface GitHubRepo {
  name: string;
  full_name: string;
  private: boolean;
}

interface GitHubBranch {
  name: string;
  commit: { sha: string };
}

interface ConnectedGitHubConnectorProps {
  appId: number;
  app: any;
  refreshApp: () => void;
  triggerAutoSync?: boolean;
  onAutoSyncComplete?: () => void;
}

export interface UnconnectedGitHubConnectorProps {
  appId: number | null;
  folderName: string;
  settings: any;
  refreshSettings: () => void;
  handleRepoSetupComplete: () => void;
  expanded?: boolean;
}

function ConnectedGitHubConnector({
  appId,
  app,
  refreshApp,
  triggerAutoSync,
  onAutoSyncComplete,
}: ConnectedGitHubConnectorProps) {
  const { uncommittedFiles, hasUncommittedFiles } = useUncommittedFiles(appId);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<"push" | "pull" | false>(false);
  const [showForceDialog, setShowForceDialog] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [rebaseStatusMessage, setRebaseStatusMessage] = useState<string | null>(
    null,
  );
  const [rebaseAction, setRebaseAction] = useState<
    "abort" | "continue" | "safe-push" | null
  >(null);
  const [rebaseInProgress, setRebaseInProgress] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitMessageEdited, setIsCommitMessageEdited] = useState(false);
  const [aheadCount, setAheadCount] = useState<number>(0);
  const lastAutoSyncedAppIdRef = useRef<number | null>(null);
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  const [isFixingError, setIsFixingError] = useState(false);
  const lastAutoGenAheadRef = useRef<number | null>(null);

  // Smart error type detection
  const errorType = syncError
    ? syncError.includes("merge is in progress")
      ? "merge-in-progress"
      : syncError.includes("index.lock") || syncError.includes("index'.lock")
        ? "index-lock"
        : syncError.includes("Merge conflict") || syncError.includes("GitConflictError")
          ? "merge-conflict"
          : syncError.includes("ENOENT") || syncError.includes("Git failed to execute")
            ? "git-not-found"
            : null
    : null;

  // Handler: abort merge and retry
  const handleAbortMergeAndRetry = useCallback(async () => {
    setIsFixingError(true);
    try {
      await ipc.git.abortMerge({ appId });
      setSyncError(null);
      setSyncSuccess(false);
    } catch (err: any) {
      setSyncError(err.message || "Error al abortar el merge.");
    } finally {
      setIsFixingError(false);
    }
  }, [appId]);

  // Handler: remove stale lock file
  const handleRemoveLockFile = useCallback(async () => {
    setIsFixingError(true);
    try {
      await ipc.git.removeIndexLock({ appId });
      setSyncError(null);
      setSyncSuccess(false);
    } catch (err: any) {
      setSyncError(err.message || "Error al eliminar el lock file.");
    } finally {
      setIsFixingError(false);
    }
  }, [appId]);

  // Handler: resolve all conflicts with ours (keep local)
  const handleResolveAllOurs = useCallback(async () => {
    setIsFixingError(true);
    try {
      await ipc.git.resolveMergeOurs({ appId });
      setSyncError(null);
      setSyncSuccess(false);
    } catch (err: any) {
      setSyncError(err.message || "Error al resolver conflictos.");
    } finally {
      setIsFixingError(false);
    }
  }, [appId]);

  // Handler: resolve all conflicts with theirs (accept remote)
  const handleResolveAllTheirs = useCallback(async () => {
    setIsFixingError(true);
    try {
      await ipc.git.resolveMergeTheirs({ appId });
      setSyncError(null);
      setSyncSuccess(false);
    } catch (err: any) {
      setSyncError(err.message || "Error al resolver conflictos.");
    } finally {
      setIsFixingError(false);
    }
  }, [appId]);

  // Open GitPanel in a dedicated window
  const handleOpenGitPanel = useCallback(() => {
    ipc.system.openGitWindow({
      appId,
      theme: (localStorage.getItem("theme") as "light" | "dark" | "system") ?? undefined,
      themeIntensity: parseFloat(localStorage.getItem("theme-intensity") ?? "") || undefined,
    });
  }, [appId]);

  useEffect(() => {
    // Fetch git state (ahead/behind) to decide UI visibility
    (async () => {
      try {
        const state = await ipc.github.getGitState({ appId });
        if (typeof state.ahead === "number") setAheadCount(state.ahead);
        else setAheadCount(0);
      } catch {
        setAheadCount(0);
      }
    })();

    // Only auto-generate commit message if user hasn't edited it
    if (hasUncommittedFiles && !commitMessage && !isCommitMessageEdited) {
      const added = uncommittedFiles.filter((f) => f.status === "added").length;
      const modified = uncommittedFiles.filter(
        (f) => f.status === "modified",
      ).length;
      const deleted = uncommittedFiles.filter(
        (f) => f.status === "deleted",
      ).length;
      const renamed = uncommittedFiles.filter(
        (f) => f.status === "renamed",
      ).length;

      const parts: string[] = [];
      if (added > 0)
        parts.push(`añadir ${added} archivo${added > 1 ? "s" : ""}`);
      if (modified > 0)
        parts.push(`actualizar ${modified} archivo${modified > 1 ? "s" : ""}`);
      if (deleted > 0)
        parts.push(`eliminar ${deleted} archivo${deleted > 1 ? "s" : ""}`);
      if (renamed > 0)
        parts.push(`renombrar ${renamed} archivo${renamed > 1 ? "s" : ""}`);

      if (parts.length > 0) {
        const message = parts.join(", ");
        setCommitMessage(message.charAt(0).toUpperCase() + message.slice(1));
      } else {
        setCommitMessage("Actualizar archivos");
      }
    } else if (!hasUncommittedFiles && commitMessage) {
      setCommitMessage("");
      setIsCommitMessageEdited(false);
    }
  }, [
    appId,
    hasUncommittedFiles,
    uncommittedFiles,
    commitMessage,
    isCommitMessageEdited,
  ]);

  // Auto-generate AI commit message when ≥2 local commits ahead (squash scenario)
  useEffect(() => {
    if (
      aheadCount < 2 ||
      isCommitMessageEdited ||
      lastAutoGenAheadRef.current === aheadCount
    ) {
      return;
    }
    lastAutoGenAheadRef.current = aheadCount;
    let cancelled = false;
    (async () => {
      setIsGeneratingMessage(true);
      try {
        const result = await ipc.github.generateSquashMessage({ appId, aheadCount });
        if (!cancelled && !isCommitMessageEdited) {
          setCommitMessage(result.message);
        }
      } catch {
        // Silently fail — the simple file-count message is already set
      } finally {
        if (!cancelled) setIsGeneratingMessage(false);
      }
    })();
    return () => { cancelled = true; };
  }, [appId, aheadCount, isCommitMessageEdited]);

  const handleDisconnectRepo = async () => {
    setIsDisconnecting(true);
    setDisconnectError(null);
    try {
      await ipc.github.disconnect({ appId });
      refreshApp();
    } catch (err: any) {
      setDisconnectError(err.message || "Error al desconectar el repositorio.");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleGenerateCommitMessage = async () => {
    setIsGeneratingMessage(true);
    try {
      const result = await ipc.github.generateCommitMessage({ appId });
      setCommitMessage(result.message);
      setIsCommitMessageEdited(true);
    } catch (err: any) {
      console.error("Failed to generate commit message:", err);
      setSyncError(err.message || "Error al generar el mensaje de commit.");
    } finally {
      setIsGeneratingMessage(false);
    }
  };

  const handleSyncToGithub = useCallback(
    async ({
      force = false,
      forceWithLease = false,
    }: GithubSyncOptions = {}): Promise<SyncResult> => {
      setIsSyncing(true);
      setSyncError(null);
      setSyncSuccess(false);
      setShowForceDialog(false);
      setRebaseInProgress(false);
      setConflicts([]); // Clear conflicts when starting a new sync

      try {
        await ipc.github.push({
          appId,
          force,
          forceWithLease,
          commitMessage: hasUncommittedFiles ? commitMessage : undefined,
        });
        setSyncSuccess("push");
        setRebaseInProgress(false);
        setConflicts([]); // Clear conflicts on successful sync
        setRebaseStatusMessage(null);
        // Reset commit message state after successful sync
        setCommitMessage("");
        setIsCommitMessageEdited(false);
        return {};
      } catch (err: any) {
        if (err?.name === "GitConflictError") {
          try {
            const mergeConflicts = await ipc.github.getConflicts({ appId });
            if (mergeConflicts.length > 0) {
              setConflicts(mergeConflicts);
              setSyncError(
                "Se han detectado conflictos de fusión. Por favor, resuélvelos en el editor.",
              );
              (err as Error & { handled?: boolean }).handled = true;
              return { error: err, handled: true };
            }
          } catch {
            // If getGithubMergeConflicts fails, fall through to handle the original GitConflictError
            // The error from getGithubMergeConflicts is intentionally not handled here
            // so the original GitConflictError can be displayed to the user
          }
        }

        // Check for structured error codes instead of parsing error messages
        const errorCode = err?.code as
          | "REBASE_IN_PROGRESS"
          | "MERGE_IN_PROGRESS"
          | undefined;

        // Fallback: query backend git state if structured error code is missing
        let inferredRebaseInProgress = false;
        if (!errorCode) {
          try {
            const state = await ipc.github.getGitState({ appId });
            inferredRebaseInProgress = state.rebaseInProgress;
          } catch {
            // ignore state inference errors
          }
        }

        // Final fallback: inspect error message for known rebase markers when state fetch fails
        const messageIndicatesRebase =
          typeof err?.message === "string" &&
          err.message.toLowerCase().includes("rebase-merge");

        const rebaseInProgressState =
          errorCode === "REBASE_IN_PROGRESS" ||
          inferredRebaseInProgress ||
          messageIndicatesRebase;

        const errorMessage = err.message || "Error al sincronizar con GitHub.";
        setSyncError(errorMessage);
        setRebaseInProgress(rebaseInProgressState);
        setRebaseStatusMessage(null);
        return { error: err };
      } finally {
        setIsSyncing(false);
      }
    },
    [appId],
  );

  const handleAbortRebase = useCallback(async () => {
    setRebaseAction("abort");
    setSyncError(null);
    setRebaseStatusMessage(null);
    setSyncSuccess(false);
    try {
      await ipc.github.rebaseAbort({ appId });
      setRebaseInProgress(false);
      setRebaseStatusMessage(
        "Rebase abortado. Puedes intentar sincronizar de nuevo.",
      );
    } catch (err: any) {
      setSyncError(err.message || "Failed to abort rebase.");
      setRebaseInProgress(true);
    } finally {
      setRebaseAction(null);
    }
  }, [appId]);

  const handleContinueRebase = useCallback(async () => {
    setRebaseAction("continue");
    setSyncError(null);
    setRebaseStatusMessage(null);
    setSyncSuccess(false);
    try {
      await ipc.github.rebaseContinue({ appId });
      setRebaseInProgress(false);
      setRebaseStatusMessage(
        "Rebase continuado. Puedes sincronizar cuando estés listo.",
      );
    } catch (err: any) {
      setSyncError(err.message || "Failed to continue rebase.");
      setRebaseInProgress(true);
    } finally {
      setRebaseAction(null);
    }
  }, [appId]);

  const handleSafeForcePush = useCallback(async () => {
    setRebaseAction("safe-push");
    try {
      await handleSyncToGithub({
        force: false,
        forceWithLease: true,
      });
    } finally {
      setRebaseAction(null);
    }
  }, [handleSyncToGithub]);

  const handleRebaseAndSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      // First, perform the rebase
      await ipc.github.rebase({ appId });
      setRebaseStatusMessage(null);
      const syncResult = await handleSyncToGithub();
      if (syncResult?.error) {
        if (!syncResult.handled) {
          throw syncResult.error;
        }
        return;
      }
      setRebaseStatusMessage("Rebase y subida completados con éxito.");
    } catch (err: any) {
      if (err?.handled) {
        return;
      }
      const errorMessage =
        err?.message || "Error al hacer rebase y sincronizar con GitHub.";
      setSyncError(errorMessage);
      setRebaseInProgress(errorMessage.includes("rebase-merge"));
      // If rebase failed, show appropriate message
      if (errorMessage.includes("rebase")) {
        setRebaseStatusMessage(
          "El rebase ha fallado. Puede que necesites resolver conflictos o abortar el rebase.",
        );
      }
      // Clear any stale rebase success message if sync failed after rebase
      if (errorMessage.includes("sync") || errorMessage.includes("push")) {
        setRebaseStatusMessage(null);
      }
    } finally {
      // Ensure syncing state is reset whether rebase or sync fails before handleSyncToGithub runs its own cleanup
      setIsSyncing(false);
    }
  }, [appId, handleSyncToGithub]);

  // Auto-sync when triggerAutoSync prop is true
  useEffect(() => {
    if (!appId) return;

    // Only auto-sync once per appId
    const alreadySyncedForThisApp = lastAutoSyncedAppIdRef.current === appId;

    if (triggerAutoSync && !alreadySyncedForThisApp && !isSyncing) {
      lastAutoSyncedAppIdRef.current = appId;
      handleSyncToGithub()
        .catch(() => {
          // Error is already handled in handleSyncToGithub via state updates
        })
        .finally(() => {
          onAutoSyncComplete?.();
        });
    }

    // allow re-sync if triggerAutoSync is explicitly turned off
    if (
      !triggerAutoSync &&
      !isSyncing &&
      lastAutoSyncedAppIdRef.current === appId
    ) {
      lastAutoSyncedAppIdRef.current = null;
    }
  }, [
    appId,
    triggerAutoSync,
    isSyncing,
    handleSyncToGithub,
    onAutoSyncComplete,
  ]);

  const isForcePushError =
    syncError?.includes("rejected") || syncError?.includes("non-fast-forward");
  const showRebaseAndSync = syncError?.includes("divergent branches");
  const showRebaseRecoveryOptions =
    rebaseInProgress || (syncError?.includes("rebase-merge") ?? false);
  const isRebaseActionPending = isSyncing || !!rebaseAction;

  return (
    <div className="w-full space-y-3" data-testid="github-connected-repo">
      <p className="typo-caption">
        Conectado al repositorio:{" "}
        <a
          onClick={(e) => {
            e.preventDefault();
            ipc.system.openExternalUrl(
              `https://github.com/${app.githubOrg}/${app.githubRepo}`,
            );
          }}
          className="cursor-pointer text-foreground hover:underline typo-label"
        >
          {app.githubOrg}/{app.githubRepo}
        </a>
      </p>
      {app.githubBranch && (
        <GithubBranchManager appId={appId} onBranchChange={refreshApp} />
      )}
      {hasUncommittedFiles && (
        <div className="p-4 rounded-md border border-border bg-muted/50">
          <div className="flex items-center gap-2 typo-body text-foreground mb-3">
            <FileWarning size={16} />
            <span className="typo-label">
              Tienes {uncommittedFiles.length}{" "}
              {uncommittedFiles.length === 1 ? "cambio" : "cambios"} sin
              confirmar
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="commit-message" className="typo-label">
                Mensaje de commit
              </Label>
              {!commitMessage.trim() && (
                <span className="text-xs text-destructive font-medium">
                  Obligatorio
                </span>
              )}
            </div>
            <Input
              id="commit-message"
              placeholder="Describe tus cambios..."
              value={commitMessage}
              onChange={(e) => {
                setCommitMessage(e.target.value);
                setIsCommitMessageEdited(true);
              }}
              className={cn(
                "bg-card",
                !commitMessage.trim() &&
                "border-destructive focus-visible:ring-destructive",
              )}
            />
            <p className="text-xs text-muted-foreground">
              Estos cambios se confirmarán automáticamente antes de sincronizar.
            </p>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          onClick={() => handleSyncToGithub()}
          variant="outline"
          disabled={
            isSyncing ||
            isRebaseActionPending ||
            (hasUncommittedFiles && !commitMessage.trim())
          }
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-1.5" />
          )}
          Subir al repositorio
        </Button>
        <Button
          onClick={async () => {
            setIsPulling(true);
            try {
              await ipc.github.pull({ appId });
              setSyncSuccess("pull");
              refreshApp();
            } catch (err: any) {
              setSyncError(err.message || "Error al descargar del repositorio.");
            } finally {
              setIsPulling(false);
            }
          }}
          variant="outline"
          disabled={isPulling || isRebaseActionPending}
        >
          {isPulling ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-1.5" />
          )}
          Descargar del repositorio
        </Button>
      </div>
      <div className="pt-2 border-t flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnectRepo}
          disabled={isDisconnecting}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          {isDisconnecting ? "Desconectando..." : "Desconectar repositorio"}
        </Button>
      </div>

      {syncError && (
        <div className="mt-2 space-y-2">
          {/* Smart error recovery UI */}
          {errorType === "merge-in-progress" ? (
            <div className="rounded-md border border-border bg-accent p-3 space-y-2">
              <div className="flex items-start gap-2">
                <GitMerge className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Hay un merge en progreso que bloquea esta operación
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Puedes abortar el merge para desbloquear la operación.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleAbortMergeAndRetry}
                variant="outline"
                size="sm"
                disabled={isFixingError}
                className="w-full"
              >
                {isFixingError ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4 mr-2" />
                )}
                Abortar merge y desbloquear
              </Button>
            </div>
          ) : errorType === "index-lock" ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Wrench className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Git está bloqueado por un proceso anterior
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Un proceso de git previo dejó un archivo lock. Se puede eliminar de forma segura.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleRemoveLockFile}
                variant="outline"
                size="sm"
                disabled={isFixingError}
                className="w-full"
              >
                {isFixingError ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wrench className="h-4 w-4 mr-2" />
                )}
                Eliminar lock y desbloquear
              </Button>
            </div>
          ) : errorType === "merge-conflict" ? (
            <div className="rounded-md border border-border bg-accent p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Conflictos de merge detectados
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Hay archivos con cambios incompatibles entre tu versión local y la remota. Elige cómo resolverlos:
                  </p>
                </div>
              </div>
              {/* Quick resolution buttons */}
              <div className="flex gap-1.5">
                <Button
                  onClick={handleResolveAllOurs}
                  variant="outline"
                  size="sm"
                  disabled={isFixingError}
                  className="flex-1"
                >
                  {isFixingError ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Conservar lo mío
                </Button>
                <Button
                  onClick={handleResolveAllTheirs}
                  variant="outline"
                  size="sm"
                  disabled={isFixingError}
                  className="flex-1"
                >
                  {isFixingError ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <ArrowDownToLine className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Aceptar lo suyo
                </Button>
              </div>
              {/* Manual resolution & abort */}
              <div className="flex gap-1.5">
                <Button
                  onClick={handleOpenGitPanel}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <GitMerge className="h-3.5 w-3.5 mr-1.5" />
                  Resolver manualmente
                </Button>
                <Button
                  onClick={handleAbortMergeAndRetry}
                  variant="outline"
                  size="sm"
                  disabled={isFixingError}
                >
                  {isFixingError ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Ban className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Abortar
                </Button>
              </div>
            </div>
          ) : errorType === "git-not-found" ? (
            <div className="rounded-md border border-border bg-accent p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Git no encontrado en el sistema
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Asegúrate de que Git esté instalado en tu sistema. Puedes descargarlo desde git-scm.com.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => ipc.system.openExternalUrl("https://git-scm.com/downloads")}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Descargar Git
              </Button>
            </div>
          ) : (
            /* Fallback: original error display for unrecognized errors */
            <p className="text-destructive">
              {syncError}{" "}
              <a
                onClick={(e) => {
                  e.preventDefault();
                  ipc.system.openExternalUrl("https://github.com/jpmunix/vibes/");
                }}
                className="cursor-pointer text-muted-foreground hover:underline hover:text-foreground"
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver guía de solución de problemas
              </a>
            </p>
          )}
          {showRebaseRecoveryOptions && (
            <div className="space-y-2 rounded-md border border-border p-3 bg-accent">
              <p className="text-sm text-foreground">
                Ya hay un rebase en curso. Elige cómo proceder.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleAbortRebase}
                  variant="outline"
                  size="sm"
                  disabled={isRebaseActionPending}
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  {rebaseAction === "abort" ? "Abortando..." : "Abortar rebase"}
                </Button>
                <Button
                  onClick={handleContinueRebase}
                  variant="outline"
                  size="sm"
                  disabled={isRebaseActionPending}
                >
                  <GitMerge className="h-4 w-4 mr-2" />
                  {rebaseAction === "continue"
                    ? "Continuando..."
                    : "Continuar rebase"}
                </Button>
                <Button
                  onClick={handleSafeForcePush}
                  variant="outline"
                  size="sm"
                  disabled={isRebaseActionPending}
                  className=""
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  {rebaseAction === "safe-push"
                    ? "Forzando subida segura..."
                    : "Forzar subida segura"}
                </Button>
              </div>
            </div>
          )}
          {isForcePushError && (
            <Button
              onClick={() => setShowForceDialog(true)}
              variant="outline"
              size="sm"
              disabled={isRebaseActionPending}
              className=""
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Forzar subida (Peligroso)
            </Button>
          )}
          {showRebaseAndSync && (
            <Button
              onClick={handleRebaseAndSync}
              variant="outline"
              size="sm"
              disabled={isRebaseActionPending}
              className="mt-2 ml-2"
            >
              <GitMerge className="h-4 w-4 mr-2" />
              Rebase y Sincronización
            </Button>
          )}
        </div>
      )}
      {/* Conflict Resolver */}
      {conflicts.length > 0 && !errorType && (
        <p className="text-sm text-destructive">
          Hay conflictos en el repositorio. Por favor, resuélvelos en el editor.
        </p>
      )}
      {rebaseStatusMessage && (
        <p className="typo-caption mt-2">
          {rebaseStatusMessage}
        </p>
      )}
      {syncSuccess && (
        <p className="typo-caption mt-2">
          {syncSuccess === "pull" ? "¡Descargado de GitHub con éxito!" : "¡Subido a GitHub con éxito!"}
        </p>
      )}
      {disconnectError && (
        <p className="text-destructive mt-2">{disconnectError}</p>
      )}

      {/* Force Push Warning Dialog */}
      <Dialog open={showForceDialog} onOpenChange={setShowForceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              Advertencia de forzar subida
            </DialogTitle>
            <DialogDescription>
              <div className="space-y-3">
                <p>
                  Estás a punto de realizar un{" "}
                  <strong>forzado de subida</strong> a tu repositorio de GitHub.
                </p>
                <div className="bg-accent p-3 rounded-md border border-border">
                  <p className="text-sm text-foreground">
                    <strong>
                      Esto es peligroso e irreversible y hará lo siguiente:
                    </strong>
                  </p>
                  <ul className="typo-caption list-disc list-inside mt-2 space-y-1">
                    <li>Sobrescribir el historial del repositorio remoto</li>
                    <li>
                      Eliminar permanentemente los commits que existen en el
                      remoto pero no localmente
                    </li>
                  </ul>
                </div>
                <p className="text-sm">
                  Solo procede si estás seguro de que esto es lo que quieres
                  hacer.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForceDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleSyncToGithub({ force: true })}
              disabled={isSyncing}
            >
              {isSyncing ? "Forzando subida..." : "Forzar subida"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function UnconnectedGitHubConnector({
  appId,
  folderName,
  settings,
  refreshSettings,
  handleRepoSetupComplete,
  expanded,
}: UnconnectedGitHubConnectorProps) {
  // --- Collapsible State ---
  const [isExpanded, setIsExpanded] = useState(expanded || false);

  // --- GitHub Device Flow State ---
  const [githubUserCode, setGithubUserCode] = useState<string | null>(null);
  const [githubVerificationUri, setGithubVerificationUri] = useState<
    string | null
  >(null);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [isConnectingToGithub, setIsConnectingToGithub] = useState(false);
  const [githubStatusMessage, setGithubStatusMessage] = useState<string | null>(
    null,
  );
  const [codeCopied, setCodeCopied] = useState(false);

  // --- Repo Setup State ---
  const [repoSetupMode, setRepoSetupMode] = useState<"create" | "existing">(
    "create",
  );
  const [availableRepos, setAvailableRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [availableBranches, setAvailableBranches] = useState<GitHubBranch[]>(
    [],
  );
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string>("main");
  const [branchInputMode, setBranchInputMode] = useState<"select" | "custom">(
    "select",
  );
  const [customBranchName, setCustomBranchName] = useState<string>("");

  // Create new repo state
  const [repoName, setRepoName] = useState(folderName);
  const [repoAvailable, setRepoAvailable] = useState<boolean | null>(null);
  const [repoCheckError, setRepoCheckError] = useState<string | null>(null);
  const [isCheckingRepo, setIsCheckingRepo] = useState(false);
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);
  const [createRepoError, setCreateRepoError] = useState<string | null>(null);
  const [createRepoSuccess, setCreateRepoSuccess] = useState<boolean>(false);
  const [isFixingSetupError, setIsFixingSetupError] = useState(false);

  // Smart error type detection for setup errors
  const setupErrorType = createRepoError
    ? createRepoError.includes("merge is in progress")
      ? "merge-in-progress"
      : createRepoError.includes("index.lock") || createRepoError.includes("index'.lock")
        ? "index-lock"
        : createRepoError.includes("ENOENT") || createRepoError.includes("Git failed to execute")
          ? "git-not-found"
          : null
    : null;

  // Handler: abort merge (for setup flow)
  const handleFixMergeForSetup = useCallback(async () => {
    if (!appId) return;
    setIsFixingSetupError(true);
    try {
      await ipc.git.abortMerge({ appId });
      setCreateRepoError(null);
    } catch (err: any) {
      setCreateRepoError(err.message || "Error al abortar el merge.");
    } finally {
      setIsFixingSetupError(false);
    }
  }, [appId]);

  // Handler: remove lock file (for setup flow)
  const handleFixLockForSetup = useCallback(async () => {
    if (!appId) return;
    setIsFixingSetupError(true);
    try {
      await ipc.git.removeIndexLock({ appId });
      setCreateRepoError(null);
    } catch (err: any) {
      setCreateRepoError(err.message || "Error al eliminar el lock file.");
    } finally {
      setIsFixingSetupError(false);
    }
  }, [appId]);

  // Assume org is the authenticated user for now (could add org input later)
  const githubOrg = ""; // Use empty string for now (GitHub API will default to the authenticated user)

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleConnectToGithub = async () => {
    setIsConnectingToGithub(true);
    setGithubError(null);
    setGithubUserCode(null);
    setGithubVerificationUri(null);
    setGithubStatusMessage("Solicitando código de dispositivo a GitHub...");

    // Send IPC message to main process to start the flow
    ipc.github.startFlow({ appId });
  };

  useEffect(() => {
    const cleanupFunctions: (() => void)[] = [];

    // Listener for updates (user code, verification uri, status messages)
    const removeUpdateListener = ipc.events.github.onFlowUpdate((data) => {
      console.log("Received github:flow-update", data);
      if (data.userCode) {
        setGithubUserCode(data.userCode);
      }
      if (data.verificationUri) {
        setGithubVerificationUri(data.verificationUri);
      }
      if (data.message) {
        setGithubStatusMessage(data.message);
      }

      setGithubError(null); // Clear previous errors on new update
      if (!data.userCode && !data.verificationUri && data.message) {
        // Likely just a status message, keep connecting state
        setIsConnectingToGithub(true);
      }
      if (data.userCode && data.verificationUri) {
        setIsConnectingToGithub(true); // Still connecting until success/error
      }
    });
    cleanupFunctions.push(removeUpdateListener);

    // Listener for success
    const removeSuccessListener = ipc.events.github.onFlowSuccess((data) => {
      console.log("Received github:flow-success", data);
      setGithubStatusMessage("¡Conectado a GitHub con éxito!");
      setGithubUserCode(null); // Clear user-facing info
      setGithubVerificationUri(null);
      setGithubError(null);
      setIsConnectingToGithub(false);
      refreshSettings();
      setIsExpanded(true);
    });
    cleanupFunctions.push(removeSuccessListener);

    // Listener for errors
    const removeErrorListener = ipc.events.github.onFlowError((data) => {
      console.log("Received github:flow-error", data);
      setGithubError(data.error || "Ocurrió un error desconocido.");
      setGithubStatusMessage(null);
      setGithubUserCode(null);
      setGithubVerificationUri(null);
      setIsConnectingToGithub(false);
    });
    cleanupFunctions.push(removeErrorListener);

    // Cleanup function to remove all listeners when component unmounts or appId changes
    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup());
      // Reset state when appId changes or component unmounts
      setGithubUserCode(null);
      setGithubVerificationUri(null);
      setGithubError(null);
      setIsConnectingToGithub(false);
      setGithubStatusMessage(null);
    };
  }, []); // Re-run effect if appId changes

  // Load available repos when GitHub is connected
  useEffect(() => {
    if (settings?.githubAccessToken && repoSetupMode === "existing") {
      loadAvailableRepos();
    }
  }, [settings?.githubAccessToken, repoSetupMode]);

  const loadAvailableRepos = async () => {
    setIsLoadingRepos(true);
    try {
      const repos = await ipc.github.listRepos();
      setAvailableRepos(repos);
    } catch (error) {
      console.error("Failed to load GitHub repos:", error);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  // Load branches when a repo is selected
  useEffect(() => {
    if (selectedRepo && repoSetupMode === "existing") {
      loadRepoBranches();
    }
  }, [selectedRepo, repoSetupMode]);

  const loadRepoBranches = async () => {
    if (!selectedRepo) return;

    setIsLoadingBranches(true);
    setBranchInputMode("select"); // Reset to select mode when loading new repo
    setCustomBranchName(""); // Clear custom branch name
    try {
      const [owner, repo] = selectedRepo.split("/");
      const branches = await ipc.github.getRepoBranches({ owner, repo });
      setAvailableBranches(branches);
      // Default to main if available, otherwise first branch
      const defaultBranch =
        branches.find((b) => b.name === "main" || b.name === "master") ||
        branches[0];
      if (defaultBranch) {
        setSelectedBranch(defaultBranch.name);
      }
    } catch (error) {
      console.error("Failed to load repo branches:", error);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const checkRepoAvailability = useCallback(
    async (name: string) => {
      setRepoCheckError(null);
      setRepoAvailable(null);
      if (!name) return;
      setIsCheckingRepo(true);
      try {
        const result = await ipc.github.isRepoAvailable({
          org: githubOrg,
          repo: name,
        });
        setRepoAvailable(result.available);
        if (!result.available) {
          setRepoCheckError(
            result.error || "El nombre del repositorio no está disponible.",
          );
        }
      } catch (err: any) {
        setRepoCheckError(
          err.message ||
          "Error al comprobar la disponibilidad del repositorio.",
        );
      } finally {
        setIsCheckingRepo(false);
      }
    },
    [githubOrg],
  );

  const debouncedCheckRepoAvailability = useCallback(
    (name: string) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        checkRepoAvailability(name);
      }, 500);
    },
    [checkRepoAvailability],
  );

  const handleSetupRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appId) return;

    setCreateRepoError(null);
    setIsCreatingRepo(true);
    setCreateRepoSuccess(false);

    try {
      if (repoSetupMode === "create") {
        await ipc.github.createRepo({
          org: githubOrg,
          repo: repoName,
          appId,
          branch: selectedBranch,
        });
      } else {
        const [owner, repo] = selectedRepo.split("/");
        const branchToUse =
          branchInputMode === "custom" ? customBranchName : selectedBranch;
        await ipc.github.connectExistingRepo({
          owner,
          repo,
          branch: branchToUse,
          appId,
        });
      }

      setCreateRepoSuccess(true);
      setRepoCheckError(null);
      handleRepoSetupComplete();
    } catch (err: any) {
      setCreateRepoError(
        err.message ||
        `Error al ${repoSetupMode === "create" ? "crear" : "conectar con el"} repositorio.`,
      );
    } finally {
      setIsCreatingRepo(false);
    }
  };

  if (!settings?.githubAccessToken) {
    return (
      <div className="mt-1 w-full" data-testid="github-unconnected-repo">
        <Button
          onClick={handleConnectToGithub}
          className="cursor-pointer w-full py-5 flex justify-center items-center gap-2"
          size="lg"
          variant="outline"
          disabled={isConnectingToGithub} // Also disable if appId is null
        >
          Conectar a GitHub
          <Github className="h-5 w-5" />
          {isConnectingToGithub && (
            <Loader2 className="animate-spin h-5 w-5 ml-2" />
          )}
        </Button>

        {/* GitHub Connection Status/Instructions */}
        {(githubUserCode || githubStatusMessage || githubError) && (
          <div className="mt-6 p-4 border rounded-md bg-muted/50 border-border">
            <h4 className="font-medium mb-2">Conexión con GitHub</h4>
            {githubError && (
              <p className="text-destructive mb-2">
                Error: {githubError}
              </p>
            )}
            {githubUserCode && githubVerificationUri && (
              <div className="mb-2">
                <p>
                  1. Ve a:
                  <a
                    href={githubVerificationUri} // Make it a direct link
                    onClick={(e) => {
                      e.preventDefault();
                      ipc.system.openExternalUrl(githubVerificationUri);
                    }}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-muted-foreground hover:underline hover:text-foreground"
                  >
                    {githubVerificationUri}
                  </a>
                </p>
                <p>
                  2. Introduce el código:
                  <strong className="ml-1 font-mono text-lg tracking-wider bg-muted px-2 py-0.5 rounded">
                    {githubUserCode}
                  </strong>
                  <button
                    className="ml-2 p-1 rounded-md hover:bg-accent focus:outline-none"
                    onClick={() => {
                      if (githubUserCode) {
                        navigator.clipboard
                          .writeText(githubUserCode)
                          .then(() => {
                            setCodeCopied(true);
                            setTimeout(() => setCodeCopied(false), 2000);
                          })
                          .catch((err) =>
                            console.error("Failed to copy code:", err),
                          );
                      }
                    }}
                    title="Copiar al portapapeles"
                  >
                    {codeCopied ? (
                      <Check className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Clipboard className="h-4 w-4" />
                    )}
                  </button>
                </p>
              </div>
            )}
            {githubStatusMessage && (
              <p className="typo-caption">
                {githubStatusMessage}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="github-setup-repo">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={!isExpanded ? () => setIsExpanded(true) : undefined}
        className={`w-full p-4 text-left transition-colors rounded-md flex items-center justify-between ${!isExpanded
          ? "cursor-pointer hover:bg-muted"
          : ""
          }`}
      >
        <span className="typo-label">Configura tu repositorio de GitHub</span>
        {isExpanded ? undefined : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Collapsible Content */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${isExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
          }`}
      >
        <div className="p-4 pt-0 space-y-4">
          {/* Mode Selection */}
          <div>
            <div className="flex rounded-md border border-border">
              <Button
                type="button"
                variant={repoSetupMode === "create" ? "default" : "ghost"}
                className={`flex-1 rounded-none rounded-l-md border-0 ${repoSetupMode === "create"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
                  }`}
                onClick={() => {
                  setRepoSetupMode("create");
                  setCreateRepoError(null);
                  setCreateRepoSuccess(false);
                }}
              >
                Crear nuevo repositorio
              </Button>
              <Button
                type="button"
                variant={repoSetupMode === "existing" ? "default" : "ghost"}
                className={`flex-1 rounded-none rounded-r-md border-0 border-l border-border ${repoSetupMode === "existing"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
                  }`}
                onClick={() => {
                  setRepoSetupMode("existing");
                  setCreateRepoError(null);
                  setCreateRepoSuccess(false);
                }}
              >
                Conectar a repositorio existente
              </Button>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSetupRepo}>
            {repoSetupMode === "create" ? (
              <>
                <div>
                  <Label className="block text-sm font-medium">
                    Nombre del repositorio
                  </Label>
                  <Input
                    data-testid="github-create-repo-name-input"
                    className="w-full mt-1"
                    value={repoName}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setRepoName(newValue);
                      setRepoAvailable(null);
                      setRepoCheckError(null);
                      debouncedCheckRepoAvailability(newValue);
                    }}
                    disabled={isCreatingRepo}
                  />
                  {isCheckingRepo && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Comprobando disponibilidad...
                    </p>
                  )}
                  {repoAvailable === true && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ¡El nombre del repositorio está disponible!
                    </p>
                  )}
                  {repoAvailable === false && (
                    <p className="text-xs text-destructive mt-1">
                      {repoCheckError}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="block text-sm font-medium">
                    Seleccionar repositorio
                  </Label>
                  <UnifiedSelector
                    value={selectedRepo}
                    onChange={(val) => setSelectedRepo(String(val))}
                    disabled={isLoadingRepos}
                    options={availableRepos.map((repo) => ({
                      value: repo.full_name,
                      label: `${repo.full_name} ${repo.private ? "(privado)" : ""}`,
                    }))}
                    triggerVariant="outline"
                    triggerSize="md"
                    triggerClassName="w-full mt-1"
                    placeholder={
                      isLoadingRepos
                        ? "Cargando repositorios..."
                        : "Selecciona un repositorio"
                    }
                    data-testid="github-repo-select"
                  />
                </div>
              </>
            )}

            {/* Branch Selection */}
            <div>
              <Label className="block text-sm font-medium">Rama</Label>
              {repoSetupMode === "existing" && selectedRepo ? (
                <div className="space-y-2">
                  <UnifiedSelector
                    value={
                      branchInputMode === "select" ? selectedBranch : "custom"
                    }
                    onChange={(value) => {
                      if (value === "custom") {
                        setBranchInputMode("custom");
                        setCustomBranchName("");
                      } else {
                        setBranchInputMode("select");
                        setSelectedBranch(String(value));
                      }
                    }}
                    disabled={isLoadingBranches}
                    options={[
                      ...availableBranches.map((branch) => ({
                        value: branch.name,
                        label: branch.name,
                      })),
                      {
                        value: "custom",
                        label: "Escribir nombre de rama personalizado",
                      },
                    ]}
                    triggerVariant="outline"
                    triggerSize="md"
                    triggerClassName="w-full mt-1"
                    placeholder={
                      isLoadingBranches
                        ? "Cargando ramas..."
                        : "Selecciona una rama"
                    }
                    data-testid="github-branch-select"
                  />
                  {branchInputMode === "custom" && (
                    <Input
                      data-testid="github-custom-branch-input"
                      className="w-full"
                      value={customBranchName}
                      onChange={(e) => setCustomBranchName(e.target.value)}
                      placeholder="Introduce el nombre de la rama (ej., feature/nueva-rama)"
                      disabled={isCreatingRepo}
                    />
                  )}
                </div>
              ) : (
                <Input
                  className="w-full mt-1"
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  placeholder="main"
                  disabled={isCreatingRepo}
                  data-testid="github-new-repo-branch-input"
                />
              )}
            </div>

            <Button
              type="submit"
              disabled={
                isCreatingRepo ||
                (repoSetupMode === "create" &&
                  (repoAvailable === false || !repoName)) ||
                (repoSetupMode === "existing" &&
                  (!selectedRepo ||
                    !selectedBranch ||
                    (branchInputMode === "custom" && !customBranchName.trim())))
              }
            >
              {isCreatingRepo
                ? repoSetupMode === "create"
                  ? "Creando..."
                  : "Conectando..."
                : repoSetupMode === "create"
                  ? "Crear repositorio"
                  : "Conectar al repositorio"}
            </Button>
          </form>

          {createRepoError && (
            <div className="mt-2">
              {setupErrorType === "merge-in-progress" ? (
                <div className="rounded-md border border-border bg-accent p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <GitMerge className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Hay un merge en progreso que bloquea esta operación
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Abórtalo para poder conectar el repositorio.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={handleFixMergeForSetup}
                    variant="outline"
                    size="sm"
                    disabled={isFixingSetupError}
                    className="w-full"
                  >
                    {isFixingSetupError ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Ban className="h-4 w-4 mr-2" />
                    )}
                    Abortar merge y reintentar
                  </Button>
                </div>
              ) : setupErrorType === "index-lock" ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <Wrench className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Git está bloqueado por un proceso anterior
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Se puede eliminar el lock de forma segura.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={handleFixLockForSetup}
                    variant="outline"
                    size="sm"
                    disabled={isFixingSetupError}
                    className="w-full"
                  >
                    {isFixingSetupError ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Wrench className="h-4 w-4 mr-2" />
                    )}
                    Eliminar lock y reintentar
                  </Button>
                </div>
              ) : setupErrorType === "git-not-found" ? (
                <div className="rounded-md border border-border bg-accent p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Git no encontrado en el sistema
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Necesitas Git instalado para conectar repositorios.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={() => ipc.system.openExternalUrl("https://git-scm.com/downloads")}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Descargar Git
                  </Button>
                </div>
              ) : (
                <p className="text-destructive">{createRepoError}</p>
              )}
            </div>
          )}
          {createRepoSuccess && (
            <p className="typo-caption mt-2">
              {repoSetupMode === "create"
                ? "¡Repositorio creado y vinculado!"
                : "¡Conectado al repositorio!"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function GitHubConnector({
  appId,
  folderName,
  expanded,
}: GitHubConnectorProps) {
  const { app, refreshApp } = useLoadApp(appId);
  const { settings, refreshSettings } = useSettings();
  const [pendingAutoSync, setPendingAutoSync] = useState(false);

  const handleRepoSetupComplete = useCallback(() => {
    setPendingAutoSync(true);
    refreshApp();
  }, [refreshApp]);

  const handleAutoSyncComplete = useCallback(() => {
    setPendingAutoSync(false);
  }, []);

  if (app?.githubOrg && app?.githubRepo && appId) {
    return (
      <ConnectedGitHubConnector
        appId={appId}
        app={app}
        refreshApp={refreshApp}
        triggerAutoSync={pendingAutoSync}
        onAutoSyncComplete={handleAutoSyncComplete}
      />
    );
  } else {
    return (
      <UnconnectedGitHubConnector
        appId={appId}
        folderName={folderName}
        settings={settings}
        refreshSettings={refreshSettings}
        handleRepoSetupComplete={handleRepoSetupComplete}
        expanded={expanded}
      />
    );
  }
}
