import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useGitPanel } from "@/hooks/useGitPanel";
import { cn } from "@/lib/utils";
import { useState, useCallback } from "react";
import {
    GitBranch,
    Plus,
    Minus,
    Check,
    ChevronDown,
    ChevronRight,
    Upload,
    Sparkles,
    Loader2,
    FileText,
    FilePlus,
    FileX,
    FileEdit,
    ArrowRightLeft,
    X,
    History,
    GitCommit,
    AlertTriangle,
    GitMerge,
    Ban,
    ShieldCheck,
    ArrowDownToLine,
    Wrench,
    Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { GitCommitHistory } from "@/components/GitCommitHistory";
import { ipc } from "@/ipc/types";
import { toast } from "sonner";

interface GitPanelProps {
    onClose: () => void;
}

function getStatusIcon(status: string) {
    switch (status) {
        case "added":
            return <FilePlus size={14} className="text-green-500" />;
        case "modified":
            return <FileEdit size={14} className="text-blue-500" />;
        case "deleted":
            return <FileX size={14} className="text-red-500" />;
        case "renamed":
            return <ArrowRightLeft size={14} className="text-yellow-500" />;
        default:
            return <FileText size={14} className="text-gray-500" />;
    }
}

function getStatusLabel(status: string) {
    switch (status) {
        case "added":
            return "Añadido";
        case "modified":
            return "Modificado";
        case "deleted":
            return "Eliminado";
        case "renamed":
            return "Renombrado";
        default:
            return status;
    }
}

function getStatusBadgeColor(status: string) {
    switch (status) {
        case "added":
            return "bg-green-500/15 text-green-600 dark:text-green-400";
        case "modified":
            return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
        case "deleted":
            return "bg-red-500/15 text-red-600 dark:text-red-400";
        case "renamed":
            return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400";
        default:
            return "bg-gray-500/15 text-gray-600 dark:text-gray-400";
    }
}

// Diff viewer for a single file
function DiffViewer({ diff }: { diff: string }) {
    if (!diff) {
        return (
            <div className="p-3 text-xs text-muted-foreground italic">
                No hay diferencias disponibles
            </div>
        );
    }

    const lines = diff.split("\n");

    return (
        <div className="overflow-x-auto max-h-64 border-t border-border">
            <pre className="text-[11px] leading-[18px] font-mono">
                {lines.map((line, i) => {
                    let bgColor = "";
                    let textColor = "text-foreground";

                    if (line.startsWith("+") && !line.startsWith("+++")) {
                        bgColor = "bg-green-500/10";
                        textColor = "text-green-700 dark:text-green-400";
                    } else if (line.startsWith("-") && !line.startsWith("---")) {
                        bgColor = "bg-red-500/10";
                        textColor = "text-red-700 dark:text-red-400";
                    } else if (line.startsWith("@@")) {
                        bgColor = "bg-blue-500/10";
                        textColor = "text-blue-600 dark:text-blue-400";
                    } else if (line.startsWith("diff ") || line.startsWith("index ")) {
                        textColor = "text-muted-foreground";
                    }

                    return (
                        <div
                            key={i}
                            className={cn("px-3 py-0", bgColor, textColor)}
                        >
                            {line || " "}
                        </div>
                    );
                })}
            </pre>
        </div>
    );
}

// File row component
function FileRow({
    file,
    onToggle,
    isToggling,
    onViewDiff,
    isExpanded,
}: {
    file: { path: string; status: string };
    onToggle: () => void;
    isToggling: boolean;
    onViewDiff: () => void;
    isExpanded: boolean;
}) {
    const fileName = file.path.split("/").pop() || file.path;
    const dirPath = file.path.includes("/")
        ? file.path.substring(0, file.path.lastIndexOf("/"))
        : "";

    return (
        <div className="group">
            <div
                className={cn(
                    "flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer transition-colors",
                    isExpanded && "bg-muted/30",
                )}
                onClick={onViewDiff}
            >
                <ChevronRight
                    size={12}
                    className={cn(
                        "text-muted-foreground transition-transform shrink-0",
                        isExpanded && "rotate-90",
                    )}
                />
                {getStatusIcon(file.status)}
                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">{fileName}</span>
                    {dirPath && (
                        <span className="text-[10px] text-muted-foreground truncate">
                            {dirPath}
                        </span>
                    )}
                </div>
                <span
                    className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded",
                        getStatusBadgeColor(file.status),
                    )}
                >
                    {getStatusLabel(file.status).charAt(0)}
                </span>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggle();
                            }}
                            disabled={isToggling}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity"
                        >
                            {isToggling ? (
                                <Loader2 size={12} className="animate-spin" />
                            ) : (
                                <Plus size={12} />
                            )}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>Stage archivo</TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
}

// Staged file row
function StagedFileRow({
    file,
    onUnstage,
    isUnstaging,
}: {
    file: { path: string; status: string };
    onUnstage: () => void;
    isUnstaging: boolean;
}) {
    const fileName = file.path.split("/").pop() || file.path;
    const dirPath = file.path.includes("/")
        ? file.path.substring(0, file.path.lastIndexOf("/"))
        : "";

    return (
        <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 transition-colors">
            <Check size={12} className="text-green-500 shrink-0" />
            {getStatusIcon(file.status)}
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="text-xs font-medium truncate">{fileName}</span>
                {dirPath && (
                    <span className="text-[10px] text-muted-foreground truncate">
                        {dirPath}
                    </span>
                )}
            </div>
            <span
                className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded",
                    getStatusBadgeColor(file.status),
                )}
            >
                {getStatusLabel(file.status).charAt(0)}
            </span>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        onClick={onUnstage}
                        disabled={isUnstaging}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity"
                    >
                        {isUnstaging ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <Minus size={12} />
                        )}
                    </button>
                </TooltipTrigger>
                <TooltipContent>Unstage archivo</TooltipContent>
            </Tooltip>
        </div>
    );
}

export function GitPanel({ onClose }: GitPanelProps) {
    const appId = useAtomValue(selectedAppIdAtom);
    const [activeTab, setActiveTab] = useState<"changes" | "history">("changes");
    const {
        uncommittedFiles,
        currentBranch,
        gitState,
        commitMessage,
        setCommitMessage,
        stageFile,
        unstageFile,
        stageAll,
        unstageAll,
        commit,
        push,
        generateCommitMessage,
        getFileDiff,
        isLoadingFiles,
        isStaging,
        isUnstaging,
        isCommitting,
        isPushing,
        isGeneratingMessage,
        conflictFiles,
        resolveMergeOurs,
        resolveMergeTheirs,
        abortMerge,
        isResolvingMerge,
        isAbortingMerge,
        resolveFileOurs,
        resolveFileTheirs,
        getConflictFileDiff,
        isResolvingFile,
    } = useGitPanel(appId);

    const [stagedFiles, setStagedFiles] = useState<Set<string>>(new Set());
    const [expandedFile, setExpandedFile] = useState<string | null>(null);
    const [fileDiff, setFileDiff] = useState<string>("");
    const [isLoadingDiff, setIsLoadingDiff] = useState(false);
    const [showUnstaged, setShowUnstaged] = useState(true);
    const [showStaged, setShowStaged] = useState(true);

    // Conflict resolution state
    const [expandedConflictFile, setExpandedConflictFile] = useState<string | null>(null);
    const [conflictDiff, setConflictDiff] = useState<string>("");
    const [isLoadingConflictDiff, setIsLoadingConflictDiff] = useState(false);
    const [showConflicts, setShowConflicts] = useState(true);

    // Git Tools section state
    const [showGitTools, setShowGitTools] = useState(false);
    const [isRemovingLock, setIsRemovingLock] = useState(false);

    // Separate files into staged and unstaged
    // Since git status --porcelain gives us both, we track staged state client-side
    // based on user interactions
    const unstagedFiles = uncommittedFiles.filter((f) => !stagedFiles.has(f.path));
    const stagedFilesList = uncommittedFiles.filter((f) => stagedFiles.has(f.path));

    const handleStageFile = useCallback(
        async (filepath: string) => {
            try {
                await stageFile(filepath);
                setStagedFiles((prev) => new Set([...prev, filepath]));
            } catch {
                // Error handled by hook
            }
        },
        [stageFile],
    );

    const handleUnstageFile = useCallback(
        async (filepath: string) => {
            try {
                await unstageFile(filepath);
                setStagedFiles((prev) => {
                    const next = new Set(prev);
                    next.delete(filepath);
                    return next;
                });
            } catch {
                // Error handled by hook
            }
        },
        [unstageFile],
    );

    const handleStageAll = useCallback(async () => {
        try {
            await stageAll();
            setStagedFiles(new Set(uncommittedFiles.map((f) => f.path)));
        } catch {
            // Error handled by hook
        }
    }, [stageAll, uncommittedFiles]);

    const handleUnstageAll = useCallback(async () => {
        try {
            await unstageAll();
            setStagedFiles(new Set());
        } catch {
            // Error handled by hook
        }
    }, [unstageAll]);

    const handleViewDiff = useCallback(
        async (filepath: string) => {
            if (expandedFile === filepath) {
                setExpandedFile(null);
                return;
            }
            setExpandedFile(filepath);
            setIsLoadingDiff(true);
            try {
                const result = await getFileDiff(filepath);
                setFileDiff(result?.diff ?? "");
            } catch {
                setFileDiff("");
            } finally {
                setIsLoadingDiff(false);
            }
        },
        [expandedFile, getFileDiff],
    );

    const handleViewConflictDiff = useCallback(
        async (filepath: string) => {
            if (expandedConflictFile === filepath) {
                setExpandedConflictFile(null);
                return;
            }
            setExpandedConflictFile(filepath);
            setIsLoadingConflictDiff(true);
            try {
                const result = await getConflictFileDiff(filepath);
                setConflictDiff(result?.diff ?? "");
            } catch {
                setConflictDiff("");
            } finally {
                setIsLoadingConflictDiff(false);
            }
        },
        [expandedConflictFile, getConflictFileDiff],
    );

    const handleCommit = useCallback(async () => {
        if (!commitMessage.trim()) return;
        const filesToStage =
            stagedFilesList.length > 0
                ? stagedFilesList.map((f) => f.path)
                : undefined;
        await commit({ message: commitMessage, filesToStage });
        setStagedFiles(new Set());
    }, [commitMessage, commit, stagedFilesList]);

    const handleCommitAndPush = useCallback(async () => {
        if (!commitMessage.trim()) return;
        const filesToStage =
            stagedFilesList.length > 0
                ? stagedFilesList.map((f) => f.path)
                : undefined;
        await commit({ message: commitMessage, filesToStage });
        setStagedFiles(new Set());
        await push({});
    }, [commitMessage, commit, push, stagedFilesList]);

    const handlePush = useCallback(async () => {
        await push({});
    }, [push]);

    const hasChanges = uncommittedFiles.length > 0;
    const hasStagedFiles = stagedFilesList.length > 0;
    const canCommit = commitMessage.trim().length > 0 && hasChanges;

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                    <GitBranch size={16} className="text-primary" />
                    <h2 className="text-sm font-semibold">Control de Git</h2>
                </div>
                <div className="flex items-center gap-2">
                    {/* Current branch badge */}
                    {currentBranch && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
                            <GitBranch size={12} />
                            {currentBranch}
                            {gitState?.ahead !== undefined && gitState.ahead > 0 && (
                                <span className="ml-1 text-[10px] bg-primary/20 px-1 rounded">
                                    ↑{gitState.ahead}
                                </span>
                            )}
                        </div>
                    )}
                    {/* Merge/rebase warnings */}
                    {gitState?.mergeInProgress && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 font-medium">
                            MERGE
                        </span>
                    )}
                    {gitState?.rebaseInProgress && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400 font-medium">
                            REBASE
                        </span>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-muted rounded-md transition-colors"
                        aria-label="Cerrar panel Git"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-border">
                <button
                    onClick={() => setActiveTab("changes")}
                    className={cn(
                        "flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors relative",
                        activeTab === "changes"
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground/80",
                    )}
                >
                    <GitCommit size={13} />
                    Cambios
                    {hasChanges && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                            {uncommittedFiles.length}
                        </span>
                    )}
                    {activeTab === "changes" && (
                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-t-full" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab("history")}
                    className={cn(
                        "flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors relative",
                        activeTab === "history"
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground/80",
                    )}
                >
                    <History size={13} />
                    Historial
                    {activeTab === "history" && (
                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-t-full" />
                    )}
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === "history" ? (
                <div className="flex-1 overflow-hidden">
                    <GitCommitHistory />
                </div>
            ) : (
                <>
                    {/* Changes Content */}

                    {/* Merge Conflict Resolution Section */}
                    {gitState?.mergeInProgress && (
                        <div className="border-b border-amber-500/30 bg-amber-500/5">
                            <div className="px-3 py-3 space-y-3">
                                {/* Header */}
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-md bg-amber-500/15">
                                        <GitMerge size={16} className="text-amber-600 dark:text-amber-400" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                                            Merge en progreso — Conflictos detectados
                                        </p>
                                        <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70">
                                            Resuelve por archivo con diff o aplica una estrategia global
                                        </p>
                                    </div>
                                </div>

                                {/* Per-file conflict resolution with diff */}
                                {conflictFiles.length > 0 && (
                                    <div className="bg-amber-500/8 border border-amber-500/20 rounded-md overflow-hidden">
                                        {/* Conflict files header */}
                                        <div
                                            className="flex items-center justify-between px-2.5 py-1.5 cursor-pointer hover:bg-amber-500/10 transition-colors"
                                            onClick={() => setShowConflicts(!showConflicts)}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <ChevronDown
                                                    size={12}
                                                    className={cn(
                                                        "text-amber-600 dark:text-amber-400 transition-transform",
                                                        !showConflicts && "-rotate-90",
                                                    )}
                                                />
                                                <AlertTriangle size={11} className="text-amber-500" />
                                                <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                                                    Archivos en conflicto ({conflictFiles.length})
                                                </p>
                                            </div>
                                        </div>

                                        {/* Conflict file rows */}
                                        {showConflicts && (
                                            <div className="border-t border-amber-500/15">
                                                {conflictFiles.map((file) => {
                                                    const fileName = file.split("/").pop() || file;
                                                    const dirPath = file.includes("/")
                                                        ? file.substring(0, file.lastIndexOf("/"))
                                                        : "";
                                                    const isExpanded = expandedConflictFile === file;

                                                    return (
                                                        <div key={file}>
                                                            {/* File row */}
                                                            <div
                                                                className={cn(
                                                                    "group flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer hover:bg-amber-500/10 transition-colors",
                                                                    isExpanded && "bg-amber-500/8",
                                                                )}
                                                                onClick={() => handleViewConflictDiff(file)}
                                                            >
                                                                <ChevronRight
                                                                    size={11}
                                                                    className={cn(
                                                                        "text-amber-500/60 transition-transform shrink-0",
                                                                        isExpanded && "rotate-90",
                                                                    )}
                                                                />
                                                                <AlertTriangle size={11} className="text-amber-500 shrink-0" />
                                                                <div className="flex-1 min-w-0 flex items-center gap-1">
                                                                    <span className="text-[11px] font-medium text-amber-800 dark:text-amber-200 truncate">
                                                                        {fileName}
                                                                    </span>
                                                                    {dirPath && (
                                                                        <span className="text-[9px] text-amber-600/50 dark:text-amber-400/50 truncate">
                                                                            {dirPath}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {/* Per-file resolution buttons */}
                                                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    resolveFileOurs(file);
                                                                                }}
                                                                                disabled={isResolvingFile || isResolvingMerge}
                                                                                className="p-1 rounded hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 transition-colors"
                                                                            >
                                                                                <ShieldCheck size={12} />
                                                                            </button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="top">Conservar mi versión (ours)</TooltipContent>
                                                                    </Tooltip>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    resolveFileTheirs(file);
                                                                                }}
                                                                                disabled={isResolvingFile || isResolvingMerge}
                                                                                className="p-1 rounded hover:bg-green-500/20 text-green-600 dark:text-green-400 transition-colors"
                                                                            >
                                                                                <ArrowDownToLine size={12} />
                                                                            </button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="top">Aceptar su versión (theirs)</TooltipContent>
                                                                    </Tooltip>
                                                                </div>
                                                            </div>

                                                            {/* Expanded diff viewer */}
                                                            {isExpanded && (
                                                                <div className="bg-background/50 border-t border-amber-500/10">
                                                                    {isLoadingConflictDiff ? (
                                                                        <div className="flex items-center justify-center py-4">
                                                                            <Loader2
                                                                                size={14}
                                                                                className="animate-spin text-amber-500"
                                                                            />
                                                                        </div>
                                                                    ) : conflictDiff ? (
                                                                        <div className="overflow-x-auto max-h-72">
                                                                            <pre className="text-[11px] leading-[18px] font-mono">
                                                                                {conflictDiff.split("\n").map((line, i) => {
                                                                                    let bgColor = "";
                                                                                    let textColor = "text-foreground";

                                                                                    // Conflict markers get special styling
                                                                                    if (line.startsWith("<<<<<<<")) {
                                                                                        bgColor = "bg-blue-500/15";
                                                                                        textColor = "text-blue-600 dark:text-blue-400 font-semibold";
                                                                                    } else if (line.startsWith("=======")) {
                                                                                        bgColor = "bg-purple-500/15";
                                                                                        textColor = "text-purple-600 dark:text-purple-400 font-semibold";
                                                                                    } else if (line.startsWith(">>>>>>>")) {
                                                                                        bgColor = "bg-orange-500/15";
                                                                                        textColor = "text-orange-600 dark:text-orange-400 font-semibold";
                                                                                    } else if (line.startsWith("+") && !line.startsWith("+++")) {
                                                                                        bgColor = "bg-green-500/10";
                                                                                        textColor = "text-green-700 dark:text-green-400";
                                                                                    } else if (line.startsWith("-") && !line.startsWith("---")) {
                                                                                        bgColor = "bg-red-500/10";
                                                                                        textColor = "text-red-700 dark:text-red-400";
                                                                                    } else if (line.startsWith("@@")) {
                                                                                        bgColor = "bg-blue-500/10";
                                                                                        textColor = "text-blue-600 dark:text-blue-400";
                                                                                    } else if (line.startsWith("diff ") || line.startsWith("index ")) {
                                                                                        textColor = "text-muted-foreground";
                                                                                    }

                                                                                    return (
                                                                                        <div
                                                                                            key={i}
                                                                                            className={cn("px-3 py-0", bgColor, textColor)}
                                                                                        >
                                                                                            {line || " "}
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </pre>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="p-3 text-xs text-muted-foreground italic">
                                                                            No hay diferencias disponibles
                                                                        </div>
                                                                    )}
                                                                    {/* Per-file action bar */}
                                                                    <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-amber-500/10 bg-muted/30">
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="flex-1 h-7 text-[11px] font-medium border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                                                            onClick={() => resolveFileOurs(file)}
                                                                            disabled={isResolvingFile || isResolvingMerge}
                                                                        >
                                                                            {isResolvingFile ? (
                                                                                <Loader2 size={11} className="animate-spin mr-1" />
                                                                            ) : (
                                                                                <ShieldCheck size={11} className="mr-1" />
                                                                            )}
                                                                            Mío (local)
                                                                        </Button>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="flex-1 h-7 text-[11px] font-medium border-green-500/30 bg-green-500/5 hover:bg-green-500/10 text-green-700 dark:text-green-300"
                                                                            onClick={() => resolveFileTheirs(file)}
                                                                            disabled={isResolvingFile || isResolvingMerge}
                                                                        >
                                                                            {isResolvingFile ? (
                                                                                <Loader2 size={11} className="animate-spin mr-1" />
                                                                            ) : (
                                                                                <ArrowDownToLine size={11} className="mr-1" />
                                                                            )}
                                                                            Suyo (remoto)
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Bulk action buttons */}
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex gap-1.5">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1 h-8 text-xs font-medium border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                            onClick={() => resolveMergeOurs()}
                                            disabled={isResolvingMerge || isAbortingMerge}
                                        >
                                            {isResolvingMerge ? (
                                                <Loader2 size={13} className="animate-spin mr-1.5" />
                                            ) : (
                                                <ShieldCheck size={13} className="mr-1.5" />
                                            )}
                                            Conservar todos mis cambios
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1 h-8 text-xs font-medium border-green-500/30 bg-green-500/5 hover:bg-green-500/10 text-green-700 dark:text-green-300"
                                            onClick={() => resolveMergeTheirs()}
                                            disabled={isResolvingMerge || isAbortingMerge}
                                        >
                                            {isResolvingMerge ? (
                                                <Loader2 size={13} className="animate-spin mr-1.5" />
                                            ) : (
                                                <ArrowDownToLine size={13} className="mr-1.5" />
                                            )}
                                            Aceptar todos sus cambios
                                        </Button>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full h-7 text-[11px] text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                                        onClick={() => abortMerge()}
                                        disabled={isResolvingMerge || isAbortingMerge}
                                    >
                                        {isAbortingMerge ? (
                                            <Loader2 size={12} className="animate-spin mr-1.5" />
                                        ) : (
                                            <Ban size={12} className="mr-1.5" />
                                        )}
                                        Cancelar merge
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto">
                        {isLoadingFiles ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="animate-spin text-muted-foreground" size={20} />
                            </div>
                        ) : !hasChanges ? (
                            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                <Check size={32} className="text-green-500 mb-2" />
                                <p className="text-sm text-muted-foreground">
                                    El árbol de trabajo está limpio
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    No hay cambios pendientes
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Unstaged Changes Section */}
                                <div className="border-b border-border">
                                    <div
                                        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
                                        onClick={() => setShowUnstaged(!showUnstaged)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <ChevronDown
                                                size={14}
                                                className={cn(
                                                    "text-muted-foreground transition-transform",
                                                    !showUnstaged && "-rotate-90",
                                                )}
                                            />
                                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                Cambios
                                            </span>
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                                                {unstagedFiles.length}
                                            </span>
                                        </div>
                                        {unstagedFiles.length > 0 && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleStageAll();
                                                        }}
                                                        disabled={isStaging}
                                                        className="p-1 rounded hover:bg-muted transition-colors"
                                                    >
                                                        <Plus size={14} className="text-muted-foreground" />
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent>Stage todos los cambios</TooltipContent>
                                            </Tooltip>
                                        )}
                                    </div>
                                    {showUnstaged && (
                                        <div>
                                            {unstagedFiles.map((file) => (
                                                <div key={file.path}>
                                                    <FileRow
                                                        file={file}
                                                        onToggle={() => handleStageFile(file.path)}
                                                        isToggling={isStaging}
                                                        onViewDiff={() => handleViewDiff(file.path)}
                                                        isExpanded={expandedFile === file.path}
                                                    />
                                                    {expandedFile === file.path && (
                                                        <div className="bg-muted/20">
                                                            {isLoadingDiff ? (
                                                                <div className="flex items-center justify-center py-4">
                                                                    <Loader2
                                                                        size={14}
                                                                        className="animate-spin text-muted-foreground"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <DiffViewer diff={fileDiff} />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {unstagedFiles.length === 0 && (
                                                <div className="px-3 py-2 text-xs text-muted-foreground italic">
                                                    Todos los archivos están staged
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Staged Changes Section */}
                                <div className="border-b border-border">
                                    <div
                                        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
                                        onClick={() => setShowStaged(!showStaged)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <ChevronDown
                                                size={14}
                                                className={cn(
                                                    "text-muted-foreground transition-transform",
                                                    !showStaged && "-rotate-90",
                                                )}
                                            />
                                            <span className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">
                                                Staged
                                            </span>
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 font-medium">
                                                {stagedFilesList.length}
                                            </span>
                                        </div>
                                        {stagedFilesList.length > 0 && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleUnstageAll();
                                                        }}
                                                        disabled={isUnstaging}
                                                        className="p-1 rounded hover:bg-muted transition-colors"
                                                    >
                                                        <Minus size={14} className="text-muted-foreground" />
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent>Unstage todos</TooltipContent>
                                            </Tooltip>
                                        )}
                                    </div>
                                    {showStaged && (
                                        <div>
                                            {stagedFilesList.map((file) => (
                                                <StagedFileRow
                                                    key={file.path}
                                                    file={file}
                                                    onUnstage={() => handleUnstageFile(file.path)}
                                                    isUnstaging={isUnstaging}
                                                />
                                            ))}
                                            {stagedFilesList.length === 0 && (
                                                <div className="px-3 py-2 text-xs text-muted-foreground italic">
                                                    Sin archivos staged — haz commit de todos o selecciona individualmente
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Commit Area (bottom) */}
                    {hasChanges && (
                        <div className="border-t border-border p-3 space-y-2 bg-background">
                            {/* Commit message */}
                            <div className="flex gap-1.5">
                                <Input
                                    value={commitMessage}
                                    onChange={(e) => setCommitMessage(e.target.value)}
                                    placeholder="Mensaje de commit..."
                                    className={cn(
                                        "h-8 text-xs flex-1",
                                        !commitMessage.trim() &&
                                        hasStagedFiles &&
                                        "border-amber-500/50 focus-visible:ring-amber-500/50",
                                    )}
                                    disabled={isCommitting || isGeneratingMessage}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && canCommit) {
                                            handleCommit();
                                        }
                                    }}
                                />
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8 shrink-0"
                                            onClick={generateCommitMessage}
                                            disabled={isGeneratingMessage || !hasChanges}
                                        >
                                            {isGeneratingMessage ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <Sparkles size={14} />
                                            )}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Generar mensaje con IA</TooltipContent>
                                </Tooltip>
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-1.5">
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="flex-1 h-8 text-xs font-medium"
                                    onClick={handleCommit}
                                    disabled={!canCommit || isCommitting}
                                >
                                    {isCommitting ? (
                                        <Loader2 size={14} className="animate-spin mr-1.5" />
                                    ) : (
                                        <Check size={14} className="mr-1.5" />
                                    )}
                                    Commit{hasStagedFiles ? ` (${stagedFilesList.length})` : ""}
                                </Button>
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="flex-1 h-8 text-xs font-medium bg-green-600 hover:bg-green-700 text-white"
                                    onClick={handleCommitAndPush}
                                    disabled={!canCommit || isCommitting || isPushing}
                                >
                                    {isCommitting || isPushing ? (
                                        <Loader2 size={14} className="animate-spin mr-1.5" />
                                    ) : (
                                        <Upload size={14} className="mr-1.5" />
                                    )}
                                    Commit & Push
                                </Button>
                            </div>

                            {/* Push only button */}
                            {gitState?.ahead !== undefined && gitState.ahead > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-7 text-xs"
                                    onClick={handlePush}
                                    disabled={isPushing}
                                >
                                    {isPushing ? (
                                        <Loader2 size={12} className="animate-spin mr-1.5" />
                                    ) : (
                                        <Upload size={12} className="mr-1.5" />
                                    )}
                                    Push ({gitState.ahead} commit{gitState.ahead > 1 ? "s" : ""})
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Push button when no changes but ahead of remote */}
                    {!hasChanges &&
                        gitState?.ahead !== undefined &&
                        gitState.ahead > 0 && (
                            <div className="border-t border-border p-3 bg-background">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-8 text-xs"
                                    onClick={handlePush}
                                    disabled={isPushing}
                                >
                                    {isPushing ? (
                                        <Loader2 size={12} className="animate-spin mr-1.5" />
                                    ) : (
                                        <Upload size={12} className="mr-1.5" />
                                    )}
                                    Push ({gitState.ahead} commit{gitState.ahead > 1 ? "s" : ""} pendiente{gitState.ahead > 1 ? "s" : ""})
                                </Button>
                            </div>
                        )}

                    {/* Git Tools Section */}
                    <div className="border-t border-border">
                        <div
                            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => setShowGitTools(!showGitTools)}
                        >
                            <ChevronDown
                                size={14}
                                className={cn(
                                    "text-muted-foreground transition-transform",
                                    !showGitTools && "-rotate-90",
                                )}
                            />
                            <Wrench size={13} className="text-muted-foreground" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Herramientas Git
                            </span>
                        </div>
                        {showGitTools && (
                            <div className="px-3 pb-3 space-y-1.5">
                                <p className="text-[10px] text-muted-foreground mb-2">
                                    Herramientas de reparación para problemas comunes de Git.
                                </p>

                                {/* Remove index.lock */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-8 text-xs justify-start"
                                    disabled={isRemovingLock}
                                    onClick={async () => {
                                        if (!appId) return;
                                        setIsRemovingLock(true);
                                        try {
                                            const result = await ipc.git.removeIndexLock({ appId });
                                            if (result.removed) {
                                                toast.success("Lock eliminado correctamente");
                                            } else {
                                                toast.info("No hay ningún lock file activo");
                                            }
                                        } catch (err: any) {
                                            toast.error(err.message || "Error al eliminar el lock");
                                        } finally {
                                            setIsRemovingLock(false);
                                        }
                                    }}
                                >
                                    {isRemovingLock ? (
                                        <Loader2 size={13} className="animate-spin mr-2" />
                                    ) : (
                                        <Wrench size={13} className="mr-2" />
                                    )}
                                    Eliminar lock file (.git/index.lock)
                                </Button>

                                {/* Abort merge */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                        "w-full h-8 text-xs justify-start",
                                        gitState?.mergeInProgress && "border-amber-500/40 text-amber-700 dark:text-amber-300",
                                    )}
                                    disabled={isAbortingMerge}
                                    onClick={async () => {
                                        try {
                                            await abortMerge();
                                            toast.success("Merge abortado correctamente");
                                        } catch (err: any) {
                                            toast.error(err.message || "Error al abortar el merge");
                                        }
                                    }}
                                >
                                    {isAbortingMerge ? (
                                        <Loader2 size={13} className="animate-spin mr-2" />
                                    ) : (
                                        <Ban size={13} className="mr-2" />
                                    )}
                                    Abortar merge
                                    {gitState?.mergeInProgress && (
                                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium">
                                            activo
                                        </span>
                                    )}
                                </Button>

                                {/* Abort rebase */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                        "w-full h-8 text-xs justify-start",
                                        gitState?.rebaseInProgress && "border-orange-500/40 text-orange-700 dark:text-orange-300",
                                    )}
                                    disabled={false}
                                    onClick={async () => {
                                        if (!appId) return;
                                        try {
                                            await ipc.github.rebaseAbort({ appId });
                                            toast.success("Rebase abortado correctamente");
                                        } catch (err: any) {
                                            toast.error(err.message || "Error al abortar el rebase");
                                        }
                                    }}
                                >
                                    <Ban size={13} className="mr-2" />
                                    Abortar rebase
                                    {gitState?.rebaseInProgress && (
                                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400 font-medium">
                                            activo
                                        </span>
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
