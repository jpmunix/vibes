import { useEffect, useState, useCallback, useRef } from "react";
import { ChevronDown, ExternalLink, Play, RotateCcw, Square, Terminal } from "lucide-react";
import { ipc } from "@/ipc/types";
import { useRunApp } from "@/hooks/useRunApp";
import { useTheme } from "@/contexts/ThemeContext";


import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ServerStatus = "running" | "stopped" | "error";

interface ServerControlButtonProps {
  appId: number;
}

/**
 * Split dropdown button with status indicator for controlling the dev server
 * in workspace (agent) mode.
 *
 * Shows a colored dot (green=running, gray=stopped, red=error) and provides
 * two dropdown actions: start/restart/stop (depending on state) and open console.
 *
 * Also renders an "open in browser" icon when the server is actively serving,
 * and a Git button when there are unpushed changes.
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



  // Status indicator colors
  const statusColor = {
    running: appUrl
      ? "bg-emerald-500 shadow-[0_0_6px_1px_rgba(16,185,129,0.4)]"
      : "bg-amber-400 shadow-[0_0_6px_1px_rgba(251,191,36,0.3)] animate-pulse",
    stopped: "bg-zinc-400 dark:bg-zinc-500",
    error: "bg-red-500 shadow-[0_0_6px_1px_rgba(239,68,68,0.4)]",
  }[status];

  const statusLabel = {
    running: appUrl ? "Servidor activo" : "Iniciando…",
    stopped: "Servidor detenido",
    error: "Error en servidor",
  }[status];

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id="server-control-btn"
            disabled={loading}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium",
              "transition-all duration-200 ease-out",
              "border border-border/50 hover:border-border",
              "bg-background/60 hover:bg-accent/50",
              "text-muted-foreground hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:opacity-50 disabled:pointer-events-none",
            )}
          >
            {/* Status dot */}
            <span
              className={cn(
                "w-2 h-2 rounded-full shrink-0 transition-colors duration-300",
                statusColor,
              )}
            />
            <span className="hidden sm:inline">{statusLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={6} className="min-w-[180px]">
          {/* Primary action based on status */}
          {status === "stopped" && (
            <DropdownMenuItem onClick={handleStart} disabled={loading}>
              <Play className="h-4 w-4 text-emerald-500" />
              Iniciar servidor
            </DropdownMenuItem>
          )}

          {status === "running" && (
            <>
              <DropdownMenuItem onClick={handleRestart} disabled={loading}>
                <RotateCcw className="h-4 w-4 text-amber-500" />
                Reiniciar servidor
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleStop} disabled={loading}>
                <Square className="h-4 w-4 text-red-500" />
                Detener servidor
              </DropdownMenuItem>
            </>
          )}

          {status === "error" && (
            <>
              <DropdownMenuItem onClick={handleRestart} disabled={loading}>
                <RotateCcw className="h-4 w-4 text-amber-500" />
                Reiniciar servidor
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleStart} disabled={loading}>
                <Play className="h-4 w-4 text-emerald-500" />
                Iniciar servidor
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          {/* Console action */}
          <DropdownMenuItem onClick={handleOpenConsole}>
            <Terminal className="h-4 w-4" />
            Ver consola
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Open in browser — only visible when server is actively serving */}
      {appUrl && (
        <button
          onClick={handleOpenInBrowser}
          className={cn(
            "p-1.5 rounded-md transition-all duration-200",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-accent/50",
          )}
          title="Abrir en navegador"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
