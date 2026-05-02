import { useEffect, useState, useCallback, useRef } from "react";
import { ExternalLink, Play, RotateCcw, Square, Terminal } from "@/components/ui/icons";
import { ipc } from "@/ipc/types";
import { useRunApp } from "@/hooks/useRunApp";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ServerStatus = "running" | "stopped" | "error";

interface ServerControlButtonProps {
  appId: number;
}

/**
 * Icon-only server control buttons for workspace (agent) mode.
 *
 * States:
 * - Stopped:  grey Play icon only
 * - Starting: amber Play icon (pulsing)
 * - Running:  green Play icon + Restart / Stop / Console icons appear
 * - Error:    red Play icon + Restart icon
 */
export function ServerControlButton({ appId }: ServerControlButtonProps) {
  const [status, setStatus] = useState<ServerStatus>("stopped");
  const [appUrl, setAppUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const { runApp, stopApp, restartApp } = useRunApp();
  const { theme, intensity } = useTheme();

  // Poll server status every 2 seconds
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const result = await ipc.app.getAppRunningStatus({ appId });
      setStatus(result.status);
      setAppUrl(result.url);
    } catch {
      setStatus("stopped");
      setAppUrl(undefined);
    }
  }, [appId]);

  useEffect(() => {
    // Initial fetch
    fetchStatus();

    // Start polling
    pollRef.current = setInterval(fetchStatus, 2000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [fetchStatus]);

  // When appId changes, reset state and fetch fresh
  useEffect(() => {
    setStatus("stopped");
    setAppUrl(undefined);
    fetchStatus();
  }, [appId, fetchStatus]);

  const handleStart = useCallback(async () => {
    setLoading(true);
    try {
      await runApp(appId);
      // Don't optimistically set status — let poll detect the real state
    } catch {
      // Let poll detect error status
    } finally {
      setLoading(false);
    }
  }, [appId, runApp]);

  const handleStop = useCallback(async () => {
    setLoading(true);
    try {
      await stopApp(appId);
      setStatus("stopped");
      setAppUrl(undefined);
    } catch {
      // Let poll detect state
    } finally {
      setLoading(false);
    }
  }, [appId, stopApp]);

  const handleRestart = useCallback(async () => {
    setLoading(true);
    setAppUrl(undefined);
    try {
      await restartApp();
      // Don't optimistically set status — let poll detect the real state
    } catch {
      // Let poll detect error status
    } finally {
      setLoading(false);
    }
  }, [restartApp]);

  const handleOpenConsole = useCallback(() => {
    ipc.system.openConsoleWindow({
      appId,
      theme,
      themeIntensity: intensity,
    });
  }, [appId, theme, intensity]);

  const handleOpenInBrowser = useCallback(() => {
    if (appUrl) {
      ipc.system.openExternalUrl(appUrl);
    }
  }, [appUrl]);

  const isRunning = status === "running";
  const isStarting = isRunning && !appUrl;
  const isActive = isRunning && !!appUrl;
  const isStopped = status === "stopped";
  const isError = status === "error";

  // Determine play icon color + style
  const playIconClass = cn(
    "h-3.5 w-3.5 transition-colors duration-300",
    isStopped && "text-zinc-400 dark:text-zinc-500",
    isStarting && "text-amber-400 animate-pulse",
    isActive && "text-emerald-500",
    isError && "text-red-500",
  );

  // Shared icon-button style
  const btnBase = cn(
    "p-1.5 rounded-md transition-all duration-200",
    "text-muted-foreground hover:text-foreground",
    "hover:bg-accent/50",
    "cursor-pointer",
    loading && "opacity-40 pointer-events-none",
  );

  return (
    <div className="flex items-center gap-0.5">
      {/* Play — only when stopped, starting, or error (disappears once fully active) */}
      {!isActive && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(btnBase, "relative")}
              onClick={isStopped || isError ? handleStart : undefined}
              disabled={loading || isStarting}
              style={{ cursor: isStopped || isError ? "pointer" : "default" }}
            >
              <Play
                className={playIconClass}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {isStopped ? "Iniciar servidor" :
             isStarting ? "Iniciando…" :
             isError ? "Error — clic para reiniciar" : ""}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Restart / Stop / Console / Browser — only once server is 100% active */}
      {isActive && (
        <>
          {/* Restart */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={btnBase}
                onClick={handleRestart}
                disabled={loading}
              >
                <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Reiniciar servidor</TooltipContent>
          </Tooltip>

          {/* Stop */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={btnBase}
                onClick={handleStop}
                disabled={loading}
              >
                <Square className="h-3.5 w-3.5 text-red-500" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Detener servidor</TooltipContent>
          </Tooltip>

          {/* Console */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={btnBase}
                onClick={handleOpenConsole}
              >
                <Terminal className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Ver consola</TooltipContent>
          </Tooltip>

          {/* Open in browser */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={btnBase}
                onClick={handleOpenInBrowser}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Abrir en navegador</TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );
}
