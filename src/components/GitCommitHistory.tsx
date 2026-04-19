import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useCommitHistory } from "@/hooks/useCommitHistory";
import { cn } from "@/lib/utils";
import { useState, useMemo, useRef, useEffect } from "react";
import {
    GitCommit as GitCommitIcon,
    ChevronRight,
    ChevronLeft,
    Loader2,
    FileText,
    FilePlus,
    FileX,
    FileEdit,
    ArrowRightLeft,
    Clock,
    User,
    Hash,
    Plus,
    Minus,
    X,
    Search,
    ChevronDown,
    Eye,
    FolderTree,
    Undo2,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ipc } from "@/ipc/types";
import { toast } from "sonner";

function getFileStatusIcon(status: string) {
    switch (status) {
        case "added":
            return <FilePlus size={13} className="text-green-500 shrink-0" />;
        case "modified":
            return <FileEdit size={13} className="text-blue-500 shrink-0" />;
        case "deleted":
            return <FileX size={13} className="text-red-500 shrink-0" />;
        case "renamed":
            return <ArrowRightLeft size={13} className="text-yellow-500 shrink-0" />;
        default:
            return <FileText size={13} className="text-muted-foreground shrink-0" />;
    }
}

function getFileStatusColor(status: string) {
    switch (status) {
        case "added": return "text-green-500";
        case "modified": return "text-blue-500";
        case "deleted": return "text-red-500";
        case "renamed": return "text-yellow-500";
        default: return "text-muted-foreground";
    }
}

function formatRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMinutes < 1) return "justo ahora";
    if (diffMinutes < 60) return `hace ${diffMinutes}m`;
    if (diffHours < 24) return `hace ${diffHours}h`;
    if (diffDays === 1) return "ayer";
    if (diffDays < 7) return `hace ${diffDays}d`;
    if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)}sem`;

    return date.toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
}

function formatFullDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getDateGroup(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const commitDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (commitDay.getTime() === today.getTime()) return "Hoy";
    if (commitDay.getTime() === yesterday.getTime()) return "Ayer";

    const diffDays = Math.floor((today.getTime() - commitDay.getTime()) / 86400000);
    if (diffDays < 7) return "Esta semana";
    if (diffDays < 30) return "Este mes";

    return date.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

// Diff viewer (reusable)
function CommitDiffViewer({ diff }: { diff: string }) {
    if (!diff) return (
        <div className="p-4 text-sm text-muted-foreground italic text-center">
            No hay diferencias disponibles
        </div>
    );

    const lines = diff.split("\n").slice(0, 500); // Limit lines for performance
    const truncated = diff.split("\n").length > 500;

    return (
        <div className="overflow-x-auto overflow-y-auto border-t border-border/50">
            <pre className="typo-mono-xs leading-5 min-w-max">
                {lines.map((line, i) => {
                    let bg = "";
                    let fg = "text-foreground/80";
                    let lineNumFg = "text-muted-foreground/30";

                    if (line.startsWith("+") && !line.startsWith("+++")) {
                        bg = "bg-[#0d4a1f]"; fg = "text-green-300"; lineNumFg = "text-green-700";
                    } else if (line.startsWith("-") && !line.startsWith("---")) {
                        bg = "bg-[#4a0d0d]"; fg = "text-red-300"; lineNumFg = "text-red-700";
                    } else if (line.startsWith("@@")) {
                        bg = "bg-blue-900/20"; fg = "text-blue-400"; lineNumFg = "text-blue-700";
                    } else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
                        fg = "text-muted-foreground/50"; lineNumFg = "text-muted-foreground/15";
                    }

                    return (
                        <div key={i} className={cn("flex min-h-[20px]", bg)}>
                            <span className={cn("w-11 shrink-0 text-right pr-2.5 border-r border-white/5 select-none", lineNumFg, "text-xs leading-5")}>
                                {i + 1}
                            </span>
                            <span className={cn("px-3 flex-1 whitespace-pre", fg)}>{line || " "}</span>
                        </div>
                    );
                })}
                {truncated && (
                    <div className="px-3 py-2 text-sm text-muted-foreground italic text-center border-t border-border/30">
                        ... ({diff.split("\n").length - 500} líneas más)
                    </div>
                )}
            </pre>
        </div>
    );
}

export function GitCommitHistory({ initialCommitHash }: { initialCommitHash?: string }) {
    const appId = useAtomValue(selectedAppIdAtom);
    const {
        commits,
        total,
        hasMore,
        commitDetail,
        selectedCommit,
        currentPage,
        pageSize,
        isLoadingHistory,
        isLoadingDetail,
        nextPage,
        prevPage,
        selectCommit,
        refreshHistory,
    } = useCommitHistory(appId);

    const [searchQuery, setSearchQuery] = useState("");
    const [expandedFiles, setExpandedFiles] = useState(false);
    const [isRevertDialogOpen, setIsRevertDialogOpen] = useState(false);
    const [isReverting, setIsReverting] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    // Filter commits by search
    const filteredCommits = useMemo(() => {
        if (!searchQuery.trim()) return commits;
        const q = searchQuery.toLowerCase();
        return commits.filter(
            (c) =>
                c.message.toLowerCase().includes(q) ||
                c.author.toLowerCase().includes(q) ||
                c.shortHash.toLowerCase().includes(q),
        );
    }, [commits, searchQuery]);

    // Group commits by date
    const groupedCommits = useMemo(() => {
        const groups: { label: string; commits: typeof filteredCommits }[] = [];
        let currentGroup = "";

        for (const commit of filteredCommits) {
            const group = getDateGroup(commit.date);
            if (group !== currentGroup) {
                currentGroup = group;
                groups.push({ label: group, commits: [commit] });
            } else {
                groups[groups.length - 1].commits.push(commit);
            }
        }

        return groups;
    }, [filteredCommits]);

    // Reset selection on page change
    useEffect(() => {
        selectCommit(null);
    }, [currentPage, selectCommit]);

    // Auto-select initial commit when provided and data is loaded
    useEffect(() => {
        if (initialCommitHash && commits.length > 0 && !selectedCommit) {
            // Try to find the commit in current page
            const found = commits.find(c =>
                c.hash.startsWith(initialCommitHash) ||
                initialCommitHash.startsWith(c.hash.slice(0, 7))
            );
            if (found) {
                selectCommit(found.hash);
            } else {
                // Commit not on this page — select by hash directly (will trigger detail fetch)
                selectCommit(initialCommitHash);
            }
        }
    }, [initialCommitHash, commits, selectedCommit, selectCommit]);

    if (isLoadingHistory && commits.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <Loader2 className="animate-spin text-muted-foreground mb-3" size={24} />
                <p className="typo-caption">Cargando historial...</p>
            </div>
        );
    }

    if (total === 0 && !isLoadingHistory) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <GitCommitIcon size={36} className="text-muted-foreground/40 mb-3" />
                <p className="typo-caption">No hay commits todavía</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Los commits aparecerán aquí una vez que hagas cambios</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Search & Stats bar */}
            <div className="px-3 py-2 border-b border-border/50 space-y-2">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Buscar commits..."
                            className="h-7 text-xs pl-7 bg-muted/30 border-border/50 focus-visible:ring-1"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {total.toLocaleString()} commits
                    </span>
                </div>
            </div>

            {/* Split layout: commit list + detail */}
            <div className="flex-1 flex min-h-0">
                {/* Commit list */}
                <div
                    ref={listRef}
                    className={cn(
                        "overflow-y-auto transition-[max-height] duration-200",
                        selectedCommit ? "w-[45%] border-r border-border/50" : "w-full",
                    )}
                >
                    {groupedCommits.map((group) => (
                        <div key={group.label}>
                            {/* Date group header */}
                            <div className="sticky top-0 z-10 px-3 py-1.5 bg-muted border-b border-border/30">
                                <span className="typo-menu-header text-muted-foreground">
                                    {group.label}
                                </span>
                            </div>

                            {/* Commits */}
                            {group.commits.map((commit) => (
                                <div
                                    key={commit.hash}
                                    onClick={() => selectCommit(selectedCommit === commit.hash ? null : commit.hash)}
                                    className={cn(
                                        "group px-3 py-2 cursor-pointer transition-colors duration-150 border-b border-border/20",
                                        "hover:bg-muted/40",
                                        selectedCommit === commit.hash && "bg-primary/8 border-l-2 border-l-primary",
                                    )}
                                >
                                    {/* Top row: message + time */}
                                    <div className="flex items-start gap-2">
                                        <div className="mt-0.5 shrink-0">
                                            <div
                                                className={cn(
                                                    "w-2 h-2 rounded-full",
                                                    selectedCommit === commit.hash
                                                        ? "bg-primary ring-2 ring-primary/20"
                                                        : "bg-muted-foreground/40",
                                                )}
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="typo-dropdown leading-snug truncate">
                                                {commit.message}
                                            </p>
                                        </div>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 ml-2">
                                                    {formatRelativeDate(commit.date)}
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="left" className="text-xs">
                                                {formatFullDate(commit.date)}
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>

                                    {/* Bottom row: author + stats */}
                                    <div className="flex items-center gap-2.5 mt-1 ml-4">
                                        <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                            <User size={11} className="shrink-0" />
                                            {commit.author}
                                        </span>
                                        <span className="text-xs text-muted-foreground/60 font-mono">
                                            {commit.shortHash}
                                        </span>
                                        {commit.filesChanged > 0 && (
                                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                                <FileText size={11} />
                                                {commit.filesChanged}
                                            </span>
                                        )}
                                        {commit.insertions > 0 && (
                                            <span className="text-xs text-green-600 dark:text-green-400">
                                                +{commit.insertions}
                                            </span>
                                        )}
                                        {commit.deletions > 0 && (
                                            <span className="text-xs text-red-600 dark:text-red-400">
                                                -{commit.deletions}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}

                    {/* Pagination */}
                    {(currentPage > 0 || hasMore) && (
                        <div className="flex items-center justify-between px-3 py-2 border-t border-border/50 bg-muted/20">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={prevPage}
                                disabled={currentPage === 0}
                                className="h-7 text-xs gap-1"
                            >
                                <ChevronLeft size={12} />
                                Anterior
                            </Button>
                            <span className="text-xs text-muted-foreground">
                                {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, total)} de {total}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={nextPage}
                                disabled={!hasMore}
                                className="h-7 text-xs gap-1"
                            >
                                Siguiente
                                <ChevronRight size={12} />
                            </Button>
                        </div>
                    )}
                </div>

                {/* Commit detail panel */}
                {selectedCommit && (
                    <div className="flex-1 overflow-y-auto min-w-0">
                        {isLoadingDetail ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 size={20} className="animate-spin text-muted-foreground" />
                            </div>
                        ) : commitDetail ? (
                            <div className="flex flex-col min-h-full">
                                {/* Detail header */}
                                <div className="px-4 py-3 border-b border-border/50 space-y-2">
                                    {/* Commit message */}
                                    <p className="text-sm font-semibold leading-snug">
                                        {commitDetail.message}
                                    </p>

                                    {/* Author info */}
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                            <User size={12} className="text-primary" />
                                            <span className="font-medium text-foreground">{commitDetail.author}</span>
                                            <span className="text-muted-foreground/60">&lt;{commitDetail.email}&gt;</span>
                                        </span>
                                    </div>

                                    {/* Meta row */}
                                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="flex items-center gap-1 text-muted-foreground">
                                                    <Clock size={12} />
                                                    {formatRelativeDate(commitDetail.date)}
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent>{formatFullDate(commitDetail.date)}</TooltipContent>
                                        </Tooltip>

                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="flex items-center gap-1 font-mono text-muted-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded cursor-pointer select-all">
                                                    <Hash size={12} />
                                                    {commitDetail.shortHash}
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent className="font-mono text-xs">{commitDetail.hash}</TooltipContent>
                                        </Tooltip>

                                        <span className="flex items-center gap-1 text-muted-foreground">
                                            <FileText size={12} />
                                            {commitDetail.filesChanged} archivo{commitDetail.filesChanged !== 1 ? "s" : ""}
                                        </span>
                                        <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5">
                                            <Plus size={12} />{commitDetail.insertions}
                                        </span>
                                        <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5">
                                            <Minus size={12} />{commitDetail.deletions}
                                        </span>
                                    </div>

                                    {/* Revert button */}
                                    <div className="pt-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs gap-1.5 text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/10"
                                            onClick={() => setIsRevertDialogOpen(true)}
                                            data-testid="revert-commit-button"
                                        >
                                            <Undo2 size={12} />
                                            Revertir commit
                                        </Button>
                                    </div>
                                </div>

                                {/* Changed files */}
                                <div className="border-b border-border/50">
                                    <button
                                        className="flex items-center justify-between w-full px-4 py-2 hover:bg-muted/30 transition-colors"
                                        onClick={() => setExpandedFiles(!expandedFiles)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <ChevronDown
                                                size={14}
                                                className={cn(
                                                    "text-muted-foreground transition-transform",
                                                    !expandedFiles && "-rotate-90",
                                                )}
                                            />
                                            <FolderTree size={14} className="text-muted-foreground" />
                                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                Archivos cambiados
                                            </span>
                                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                                                {commitDetail.files.length}
                                            </span>
                                        </div>
                                    </button>

                                    {expandedFiles && (
                                        <div className="pb-1">
                                            {commitDetail.files.map((file, i) => {
                                                const fileName = file.path.split("/").pop() || file.path;
                                                const dirPath = file.path.includes("/")
                                                    ? file.path.substring(0, file.path.lastIndexOf("/"))
                                                    : "";

                                                return (
                                                    <div
                                                        key={i}
                                                        className="flex items-center gap-2 px-4 py-1 hover:bg-muted/30 transition-colors"
                                                    >
                                                        {getFileStatusIcon(file.status)}
                                                        <span className="text-xs truncate font-medium">{fileName}</span>
                                                        {dirPath && (
                                                            <span className="text-xs text-muted-foreground truncate">
                                                                {dirPath}
                                                            </span>
                                                        )}
                                                        <span
                                                            className={cn(
                                                                "ml-auto text-xs font-medium shrink-0",
                                                                getFileStatusColor(file.status),
                                                            )}
                                                        >
                                                            {file.status === "added" ? "A" :
                                                                file.status === "modified" ? "M" :
                                                                    file.status === "deleted" ? "D" :
                                                                        file.status === "renamed" ? "R" : "?"}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Diff */}
                                <div className="flex-1 flex flex-col min-h-0">
                                    <div className="px-4 py-2 flex items-center gap-2">
                                        <Eye size={14} className="text-muted-foreground" />
                                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            Diferencias
                                        </span>
                                    </div>
                                    <CommitDiffViewer diff={commitDetail.diff} />
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                                Error cargando detalle
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Revert confirmation dialog */}
            <Dialog
                open={isRevertDialogOpen}
                onOpenChange={(open) => {
                    if (!open && isReverting) return;
                    setIsRevertDialogOpen(open);
                }}
            >
                <DialogContent className="sm:max-w-md" data-testid="revert-commit-dialog">
                    <DialogHeader>
                        <DialogTitle>Revertir commit</DialogTitle>
                        <DialogDescription>
                            Se creará un nuevo commit que deshace los cambios de{" "}
                            <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">
                                {commitDetail?.shortHash}
                            </code>
                            .{" "}
                            El historial se mantiene intacto.
                        </DialogDescription>
                    </DialogHeader>

                    {commitDetail && (
                        <div className="bg-muted/30 rounded-md p-3 space-y-1">
                            <p className="text-xs font-medium truncate">{commitDetail.message}</p>
                            <p className="text-xs text-muted-foreground">
                                {commitDetail.author} · {formatRelativeDate(commitDetail.date)} · {commitDetail.filesChanged} archivo{commitDetail.filesChanged !== 1 ? "s" : ""}
                            </p>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsRevertDialogOpen(false)}
                            disabled={isReverting}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="default"
                            className="bg-orange-600 hover:bg-orange-700 text-white"
                            onClick={async () => {
                                if (!appId || !commitDetail) return;
                                setIsReverting(true);
                                try {
                                    const result = await ipc.git.revertCommit({
                                        appId,
                                        commitHash: commitDetail.hash,
                                    });
                                    if (result.success) {
                                        toast.success(result.message);
                                        setIsRevertDialogOpen(false);
                                        selectCommit(null);
                                        refreshHistory();
                                    } else {
                                        toast.error(result.message);
                                    }
                                } catch (err: any) {
                                    toast.error(err.message || "Error al revertir commit");
                                } finally {
                                    setIsReverting(false);
                                }
                            }}
                            disabled={isReverting}
                            data-testid="confirm-revert-button"
                        >
                            {isReverting ? (
                                <>
                                    <Loader2 size={14} className="animate-spin mr-1.5" />
                                    Revirtiendo...
                                </>
                            ) : (
                                <>
                                    <Undo2 size={14} className="mr-1.5" />
                                    Revertir
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
