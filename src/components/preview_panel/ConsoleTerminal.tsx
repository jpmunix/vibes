import React, { useRef, useState, useEffect, useCallback } from "react";
import { useAtomValue } from "jotai";
import { selectedAppIdAtom, currentAppAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import {
    Terminal as TerminalIcon,
    Send,
    Square,
    Loader2,
    GitBranch,
    FileText,
    PackageCheck,
    FolderTree,
    TestTube,
    Trash2,
} from "@/components/ui/icons";
import { showError } from "@/lib/toast";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

// Terminal entry types
interface TerminalEntry {
    id: string;
    type: "input" | "stdout" | "stderr" | "system" | "error";
    content: string;
    timestamp: number;
}

// Quick action definition
interface QuickAction {
    label: string;
    command: string;
    icon: React.ReactNode;
    tooltip: string;
}

const QUICK_ACTIONS: QuickAction[] = [
    {
        label: "ls",
        command: "ls -la",
        icon: <FolderTree size={13} />,
        tooltip: "Listar archivos",
    },
    {
        label: "git",
        command: "git status",
        icon: <GitBranch size={13} />,
        tooltip: "Estado de Git",
    },
    {
        label: "pkg",
        command: "cat package.json",
        icon: <FileText size={13} />,
        tooltip: "Ver package.json",
    },
    {
        label: "deps",
        command: "npm ls --depth=0 2>/dev/null || true",
        icon: <PackageCheck size={13} />,
        tooltip: "Listar dependencias",
    },
    {
        label: "test",
        command: "npm test 2>&1 || true",
        icon: <TestTube size={13} />,
        tooltip: "Ejecutar tests",
    },
];

const MAX_HISTORY = 50;

/** Find longest common prefix of an array of strings */
function findCommonPrefix(strs: string[]): string {
    if (strs.length === 0) return "";
    let prefix = strs[0];
    for (let i = 1; i < strs.length; i++) {
        while (!strs[i].startsWith(prefix)) {
            prefix = prefix.slice(0, -1);
            if (prefix === "") return "";
        }
    }
    return prefix;
}

export const ConsoleTerminal = () => {
    const selectedAppId = useAtomValue(selectedAppIdAtom);
    const app = useAtomValue(currentAppAtom);
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [inputValue, setInputValue] = useState("");
    const [entries, setEntries] = useState<TerminalEntry[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [currentCwd, setCurrentCwd] = useState<string | null>(null);

    // Load command history from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem("console-command-history");
            if (saved) {
                setCommandHistory(JSON.parse(saved));
            }
        } catch {
            // ignore
        }
    }, []);

    // Save command history to localStorage
    const saveHistory = useCallback((history: string[]) => {
        try {
            localStorage.setItem(
                "console-command-history",
                JSON.stringify(history.slice(-MAX_HISTORY))
            );
        } catch {
            // ignore
        }
    }, []);

    // Show welcome message on mount or app change, reset CWD
    useEffect(() => {
        if (app) {
            setCurrentCwd(null);
            setEntries([
                {
                    id: `system-${Date.now()}`,
                    type: "system",
                    content: `Consola interactiva — ${app.name}\nDirectorio: ${app.resolvedPath || app.path}\nEscribe un comando o usa las acciones rápidas. Tab para autocompletar.\n`,
                    timestamp: Date.now(),
                },
            ]);
        }
    }, [app?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-scroll — always scroll to bottom on new entries
    useEffect(() => {
        if (virtuosoRef.current && entries.length > 0) {
            // Small delay to let Virtuoso render the new item
            const t = setTimeout(() => {
                virtuosoRef.current?.scrollToIndex({
                    index: entries.length - 1,
                    behavior: "smooth",
                });
            }, 50);
            return () => clearTimeout(t);
        }
    }, [entries.length]);

    // Refocus input when command finishes
    useEffect(() => {
        if (!isRunning) {
            // Small delay so the input is re-enabled before we focus
            const t = setTimeout(() => inputRef.current?.focus(), 30);
            return () => clearTimeout(t);
        }
    }, [isRunning]);

    const addEntry = useCallback(
        (type: TerminalEntry["type"], content: string) => {
            setEntries((prev) => [
                ...prev,
                {
                    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    type,
                    content,
                    timestamp: Date.now(),
                },
            ]);
        },
        []
    );

    const executeCommand = useCallback(
        async (command: string) => {
            if (!selectedAppId || !command.trim()) return;

            const trimmed = command.trim();

            // Add to history
            setCommandHistory((prev) => {
                const filtered = prev.filter((c) => c !== trimmed);
                const newHistory = [...filtered, trimmed].slice(-MAX_HISTORY);
                saveHistory(newHistory);
                return newHistory;
            });
            setHistoryIndex(-1);

            // Handle built-in commands
            if (trimmed === "clear") {
                setEntries([]);
                return;
            }

            // Show input with CWD
            const cwdLabel = getShortCwd();
            addEntry("input", `${cwdLabel} $ ${trimmed}`);
            setIsRunning(true);

            try {
                const result = await ipc.app.executeShellCommand({
                    appId: selectedAppId,
                    command: trimmed,
                    timeoutMs: 30000,
                });

                // Track CWD from backend
                if (result.cwd) {
                    setCurrentCwd(result.cwd);
                }

                if (result.stdout) {
                    addEntry("stdout", result.stdout);
                }
                if (result.stderr) {
                    addEntry("stderr", result.stderr);
                }
                if (result.error) {
                    addEntry("error", `Error: ${result.error}`);
                }
                if (result.exitCode !== null && result.exitCode !== 0) {
                    addEntry(
                        "system",
                        `Proceso terminado con código ${result.exitCode}`
                    );
                }
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : "Error desconocido";
                addEntry("error", msg);
                showError(msg);
            } finally {
                setIsRunning(false);
            }
        },
        [selectedAppId, addEntry, saveHistory, currentCwd] // eslint-disable-line react-hooks/exhaustive-deps
    );

    const handleCancel = useCallback(async () => {
        if (!selectedAppId) return;
        try {
            await ipc.app.cancelShellCommand({ appId: selectedAppId });
            addEntry("system", "⚠ Comando cancelado");
        } catch (error) {
            // ignore — command may have already finished
        }
    }, [selectedAppId, addEntry]);

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            if (isRunning) return;
            const cmd = inputValue;
            setInputValue("");
            executeCommand(cmd);
            // Keep focus on the input after submit
            requestAnimationFrame(() => inputRef.current?.focus());
        },
        [inputValue, isRunning, executeCommand]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Tab") {
                e.preventDefault();
                if (!selectedAppId || isRunning) return;
                // Get the last "word" for completion
                const parts = inputValue.split(/\s+/);
                const lastWord = parts[parts.length - 1] || "";
                ipc.app.getShellCompletions({
                    appId: selectedAppId,
                    partial: lastWord,
                }).then((result) => {
                    if (result.completions.length === 1) {
                        // Single match: auto-complete
                        const completed = result.completions[0];
                        parts[parts.length - 1] = completed;
                        setInputValue(parts.join(" "));
                    } else if (result.completions.length > 1) {
                        // Multiple matches: show them
                        addEntry("system", result.completions.join("  "));
                        // Find common prefix and auto-complete to it
                        const common = findCommonPrefix(result.completions);
                        if (common.length > lastWord.length) {
                            parts[parts.length - 1] = common;
                            setInputValue(parts.join(" "));
                        }
                    }
                }).catch(() => { /* ignore */ });
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (commandHistory.length === 0) return;
                const newIndex =
                    historyIndex === -1
                        ? commandHistory.length - 1
                        : Math.max(0, historyIndex - 1);
                setHistoryIndex(newIndex);
                setInputValue(commandHistory[newIndex]);
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                if (historyIndex === -1) return;
                const newIndex = historyIndex + 1;
                if (newIndex >= commandHistory.length) {
                    setHistoryIndex(-1);
                    setInputValue("");
                } else {
                    setHistoryIndex(newIndex);
                    setInputValue(commandHistory[newIndex]);
                }
            } else if (e.key === "c" && e.ctrlKey && isRunning) {
                e.preventDefault();
                handleCancel();
            }
        },
        [commandHistory, historyIndex, isRunning, handleCancel, selectedAppId, inputValue, addEntry]
    );

    const handleClear = useCallback(() => {
        setEntries([]);
    }, []);

    const focusInput = useCallback(() => {
        inputRef.current?.focus();
    }, []);

    const getEntryClassName = (type: TerminalEntry["type"]) => {
        switch (type) {
            case "input":
                return "text-blue-400 font-bold";
            case "stdout":
                return "text-green-400";
            case "stderr":
                return "text-yellow-500";
            case "error":
                return "text-red-500";
            case "system":
                return "text-muted-foreground italic";
            default:
                return "";
        }
    };

    // Shortened CWD for prompt display
    const getShortCwd = useCallback(() => {
        const cwd = currentCwd || app?.resolvedPath || app?.path || "";
        if (!cwd) return "";
        // Replace home dir with ~ (detect /home/user pattern)
        const homeMatch = cwd.match(/^(\/home\/[^/]+)/);
        const short = homeMatch ? "~" + cwd.slice(homeMatch[1].length) : cwd;
        // Only show last 2 path segments if long
        const parts = short.split("/");
        if (parts.length > 3) {
            return "..." + "/" + parts.slice(-2).join("/");
        }
        return short;
    }, [currentCwd, app?.resolvedPath, app?.path]);

    return (
        <div
            className="flex flex-col flex-1 bg-gray-950 text-green-400 font-mono text-xs overflow-hidden"
            onClick={focusInput}
        >
            {/* Terminal Output */}
            <div className="flex-1 overflow-hidden relative">
                {entries.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-xs select-none">
                        <div className="text-center">
                            <TerminalIcon
                                size={28}
                                className="mx-auto mb-2 opacity-30"
                            />
                            <p>Consola lista</p>
                            <p className="text-xs mt-1 text-foreground">
                                Escribe un comando o usa las acciones rápidas
                            </p>
                        </div>
                    </div>
                ) : (
                    <Virtuoso
                        ref={virtuosoRef}
                        data={entries}
                        initialTopMostItemIndex={Math.max(0, entries.length - 1)}
                        followOutput="smooth"
                        itemContent={(_index, entry) => (
                            <div
                                className={`px-4 py-0.5 break-all whitespace-pre-wrap ${getEntryClassName(entry.type)}`}
                            >
                                {entry.content}
                            </div>
                        )}
                        style={{ height: "100%" }}
                    />
                )}
            </div>

            {/* Quick Actions + Clear (inline above the input) */}
            <div className="flex items-center gap-1 px-4 pt-1.5 pb-0.5 bg-gray-950 flex-shrink-0">
                <TooltipProvider delayDuration={300}>
                    {QUICK_ACTIONS.map((action) => (
                        <Tooltip key={action.label}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isRunning) executeCommand(action.command);
                                    }}
                                    disabled={isRunning || !selectedAppId}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs
                                        text-muted-foreground hover:text-muted-foreground/50 hover:bg-gray-800
                                        disabled:opacity-30 disabled:cursor-not-allowed
                                        transition-all duration-150"
                                >
                                    {action.icon}
                                    {action.label}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                                <code>{action.command}</code>
                                <br />
                                {action.tooltip}
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </TooltipProvider>

                <div className="ml-auto">
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleClear();
                                    }}
                                    className="p-0.5 rounded text-muted-foreground hover:text-muted-foreground/50 hover:bg-gray-800 transition-colors"
                                >
                                    <Trash2 size={11} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                                Limpiar consola
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>

            {/* Command Input */}
            <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 px-4 py-1.5 border-t border-gray-800 bg-gray-950 flex-shrink-0"
            >
                {isRunning ? (
                    <Loader2 size={14} className="text-yellow-500 animate-spin shrink-0" />
                ) : (
                    <span className="text-muted-foreground shrink-0 truncate max-w-[200px]">
                        <span className="text-cyan-600">{getShortCwd()}</span>
                        <span className="text-blue-400 font-bold ml-1">$</span>
                    </span>
                )}
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isRunning}
                    className="flex-1 bg-transparent border-none outline-none text-green-400 placeholder:text-foreground disabled:opacity-50"
                    placeholder={
                        isRunning
                            ? "Ejecutando..."
                            : "Escribe un comando (↑↓ historial, Ctrl+C cancelar)..."
                    }
                    autoFocus
                />
                {isRunning ? (
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="text-red-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-gray-800"
                        title="Cancelar comando"
                    >
                        <Square size={14} />
                    </button>
                ) : (
                    <button
                        type="submit"
                        disabled={!inputValue.trim() || !selectedAppId}
                        className="text-muted-foreground hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <Send size={14} />
                    </button>
                )}
            </form>
        </div>
    );
};
