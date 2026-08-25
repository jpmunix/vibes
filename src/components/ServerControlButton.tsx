import { useEffect, useState, useCallback, useRef } from "react";
import {
  ExternalLink,
  Play,
  RotateCcw,
  Square,
  Terminal,
} from "@/components/ui/icons";
import { ipc } from "@/ipc/types";
import { useRunApp } from "@/hooks/useRunApp";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

type ServerStatus = "running" | "stopped" | "error";

interface ServerControlButtonProps {
  appId: number;
}

interface ScriptEntry {
  name: string;
  command: string;
}

/**
 * Icon-only server control buttons for workspace (agent) mode.
 *
 * States:
 * - Stopped:  grey Play icon only
 * - Starting: amber Play icon (pulsing)
 * - Running:  green Play icon + Restart / Stop / Console icons appear
 * - Error:    red Play icon + Restart icon
 *
 * When stopped/error, clicking Play opens a popover to select a package.json script.
 */
export function ServerControlButton({ appId }: ServerControlButtonProps) {
  const [status, setStatus] = useState<ServerStatus>("stopped");
  const [appUrl, setAppUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const { runApp, stopApp, restartApp } = useRunApp();
  const { theme, intensity } = useTheme();

  // Script selector state
  const [scriptPopoverOpen, setScriptPopoverOpen] = useState(false);
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const scriptsLoadedRef = useRef(false);

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
    fetchStatus();
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

  // Fetch scripts from package.json (called once when popover opens)
  const loadScripts = useCallback(async () => {
    if (scriptsLoadedRef.current || scriptsLoading) return;
    setScriptsLoading(true);
    try {
      const content = await ipc.app.readAppFile({
        appId,
        filePath: "package.json",
      });
      const pkg = JSON.parse(content);
      const scriptEntries: ScriptEntry[] = [];
      if (pkg.scripts && typeof pkg.scripts === "object") {
        for (const [name, command] of Object.entries(pkg.scripts)) {
          scriptEntries.push({ name, command: String(command) });
        }
      }
      setScripts(scriptEntries);
      scriptsLoadedRef.current = true;
    } catch {
      setScripts([]);
      scriptsLoadedRef.current = true;
    } finally {
      setScriptsLoading(false);
    }
  }, [appId, scriptsLoading]);

  // Reset scripts cache when appId changes
  useEffect(() => {
    scriptsLoadedRef.current = false;
    setScripts([]);
  }, [appId]);

  const handlePopoverOpenChange = useCallback(
    (open: boolean) => {
      setScriptPopoverOpen(open);
      if (open) {
        loadScripts();
      }
    },
    [loadScripts],
  );

  const handleStartWithScript = useCallback(
    async (scriptName: string) => {
      setScriptPopoverOpen(false);
      setLoading(true);
      try {
        const resolvedCommand = `npm run ${scriptName}`;
        await ipc.app.updateAppCommands({
          appId,
          installCommand: null,
          startCommand: resolvedCommand,
        });
        await runApp(appId);
      } catch {
        // Let poll detect error status
      } finally {
        setLoading(false);
      }
    },
    [appId, runApp],
  );

  const handleStartDefault = useCallback(async () => {
    setScriptPopoverOpen(false);
    setLoading(true);
    try {
      await ipc.app.updateAppCommands({
        appId,
        installCommand: null,
        startCommand: null,
      });
      await runApp(appId);
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

  const playIconClass = cn(
    "h-3.5 w-3.5 transition-colors duration-300",
    isStopped && "text-zinc-400 dark:text-zinc-500",
    isStarting && "text-amber-400",
    isActive && "text-emerald-500",
    isError && "text-red-500",
  );

  const btnBase = cn(
    "p-1.5 rounded-md transition-colors duration-200",
    "text-muted-foreground hover:text-foreground",
    "hover:bg-accent/50",
    "cursor-pointer",
    loading && "opacity-40 pointer-events-none",
  );

  const showScriptSelector = isStopped || isError;

  return (
    <div className="flex items-center gap-0.5">
      {/* Play — only when stopped, starting, or error (disappears once fully active) */}
      {!isActive && (
        <>
          {showScriptSelector ? (
            <Tooltip>
              <Popover
                open={scriptPopoverOpen}
                onOpenChange={handlePopoverOpenChange}
              >
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(btnBase, "relative")}
                      disabled={loading || isStarting}
                    >
                      <Play className={playIconClass} />
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {isStopped
                    ? "Iniciar servidor"
                    : isError
                      ? "Error — clic para reiniciar"
                      : ""}
                </TooltipContent>
                <PopoverContent
                  align="end"
                  side="bottom"
                  className="w-72 p-0"
                  sideOffset={4}
                >
                  <Command>
                    <CommandInput placeholder="Buscar script…" />
                    <CommandList>
                      <CommandEmpty>
                        {scriptsLoading
                          ? "Cargando scripts…"
                          : "No se encontraron scripts"}
                      </CommandEmpty>
                      {scripts.length > 0 && (
                        <CommandGroup heading="Scripts del proyecto">
                          {scripts.map((script) => (
                            <CommandItem
                              key={script.name}
                              value={script.name}
                              keywords={[script.name, script.command]}
                              onSelect={() =>
                                handleStartWithScript(script.name)
                              }
                              className="cursor-pointer"
                            >
                              <div className="flex flex-col gap-0 flex-1 min-w-0">
                                <span className="whitespace-nowrap font-medium">
                                  {script.name}
                                </span>
                                <span className="text-xs text-muted-foreground/70 truncate">
                                  {script.command}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                      <CommandGroup heading="General">
                        <CommandItem
                          value="__default__"
                          keywords={["default", "npm run dev"]}
                          onSelect={handleStartDefault}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-col gap-0 flex-1 min-w-0">
                            <span className="whitespace-nowrap font-medium">
                              Default (npm run dev)
                            </span>
                            <span className="text-xs text-muted-foreground/70 truncate">
                              Arranca con el comando por defecto
                            </span>
                          </div>
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(btnBase, "relative")}
                  disabled={loading || isStarting}
                >
                  <Play className={playIconClass} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {isStarting ? "Iniciando…" : ""}
              </TooltipContent>
            </Tooltip>
          )}
        </>
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
            <TooltipContent side="bottom" className="text-xs">
              Reiniciar servidor
            </TooltipContent>
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
            <TooltipContent side="bottom" className="text-xs">
              Detener servidor
            </TooltipContent>
          </Tooltip>

          {/* Console */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button className={btnBase} onClick={handleOpenConsole}>
                <Terminal className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Ver consola
            </TooltipContent>
          </Tooltip>

          {/* Open in browser */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button className={btnBase} onClick={handleOpenInBrowser}>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Abrir en navegador
            </TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );
}
