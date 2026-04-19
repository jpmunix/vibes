import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useGitPanel } from "@/hooks/useGitPanel";
import { useLoadApp } from "@/hooks/useLoadApp";
import { useSettings } from "@/hooks/useSettings";
import { GitRemoteSetup } from "@/components/git_window/GitRemoteSetup";
import CommitMessageDialog from "@/components/CommitMessageDialog";
import { useHighlighter, getLanguageFromPath } from "@/components/chat/CodeHighlight";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
    GitBranch,
    Plus,
    Minus,
    Check,
    ChevronDown,
    ChevronRight,
    Upload,
    Download,
    RefreshCw,
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
    Diff,
    Eye,
    FolderOpen,
    Folder,
    GripVertical,
    List,
    FolderTree,
    GripHorizontal,
    MoreVertical,
    Undo2,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
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
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GitCommitHistory } from "@/components/GitCommitHistory";
import { BranchSwitcher } from "@/components/BranchSwitcher";
import ConfirmationDialog from "@/components/ConfirmationDialog";
import { ipc } from "@/ipc/types";
import { toast } from "sonner";
import { WindowsControls } from "@/components/WindowsControls";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";

interface GitPanelProps {
    onClose: () => void;
    initialTab?: "changes" | "history";
    initialCommitHash?: string;
    isWindow?: boolean;
}



// ─── Status helpers ────────────────────────────────────────────────────────────

function getStatusIcon(status: string, size = 14) {
    switch (status) {
        case "added":    return <FilePlus size={size} className="text-green-500 shrink-0" />;
        case "modified": return <FileEdit size={size} className="text-blue-400 shrink-0" />;
        case "deleted":  return <FileX size={size} className="text-red-500 shrink-0" />;
        case "renamed":  return <ArrowRightLeft size={size} className="text-yellow-400 shrink-0" />;
        default:         return <FileText size={size} className="text-muted-foreground shrink-0" />;
    }
}

function getStatusLetter(status: string) {
    return { added: "A", modified: "M", deleted: "D", renamed: "R" }[status] ?? "?";
}

function getStatusLetterClass(status: string) {
    return {
        added:    "text-green-500",
        modified: "text-blue-400",
        deleted:  "text-red-500",
        renamed:  "text-yellow-400",
    }[status] ?? "text-muted-foreground";
}

// ─── Build directory tree ──────────────────────────────────────────────────────

type FileEntry = { path: string; status: string };

interface TreeNode {
    name: string;
    fullPath: string;
    file?: FileEntry;
    children: Record<string, TreeNode>;
}

function buildTree(files: FileEntry[]): TreeNode {
    const root: TreeNode = { name: "", fullPath: "", children: {} };
    for (const file of files) {
        const parts = file.path.split("/");
        let cur = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;
            if (!cur.children[part]) {
                cur.children[part] = {
                    name: part,
                    fullPath: parts.slice(0, i + 1).join("/"),
                    children: {},
                };
            }
            if (isLast) {
                cur.children[part].file = file;
            }
            cur = cur.children[part];
        }
    }
    return root;
}

// ─── Checkbox Helpers ────────────────────────────────────────────────────────
function getFilesInDir(node: TreeNode): string[] {
    const files: string[] = [];
    if (node.file) files.push(node.file.path);
    for (const child of Object.values(node.children)) {
        files.push(...getFilesInDir(child));
    }
    return files;
}

function getDirCheckState(node: TreeNode, checkedFiles: Set<string>): "checked" | "unchecked" | "indeterminate" {
    const files = getFilesInDir(node);
    if (files.length === 0) return "unchecked";
    let checkedCount = 0;
    for (const f of files) {
        if (checkedFiles.has(f)) checkedCount++;
    }
    if (checkedCount === 0) return "unchecked";
    if (checkedCount === files.length) return "checked";
    return "indeterminate";
}

function TreeCheckbox({ state, onChange }: { state: "checked" | "unchecked" | "indeterminate", onChange: (checked: boolean) => void }) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (ref.current) {
            ref.current.indeterminate = state === "indeterminate";
        }
    }, [state]);
    return (
        <input
            ref={ref}
            type="checkbox"
            checked={state === "checked"}
            onChange={(e) => onChange(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="accent-primary w-3.5 h-3.5 shrink-0 ml-1 mr-0.5 cursor-pointer"
        />
    );
}

// ─── Flat file row (PHPStorm style) ───────────────────────────────────────────

function FlatFileRow({
    file,
    selectedFile,
    isChecked,
    onToggleCheck,
    onSelectFile,
    onDiscard,
}: {
    file: FileEntry;
    selectedFile: string | null;
    isChecked: boolean;
    onToggleCheck: (path: string, checked: boolean) => void;
    onSelectFile: (path: string) => void;
    onDiscard: (path: string) => void;
}) {
    const parts = file.path.split("/");
    const filename = parts.pop()!;
    const dir = parts.join("/");
    const isSelected = selectedFile === file.path;
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current?.contains(e.target as Node)) return;
            if (btnRef.current?.contains(e.target as Node)) return;
            setMenuOpen(false);
        };
        document.addEventListener("pointerdown", handler);
        return () => document.removeEventListener("pointerdown", handler);
    }, [menuOpen]);

    return (
        <div
            className={cn(
                "group flex items-center gap-2 py-1 px-2.5 cursor-pointer select-none transition-colors typo-body",
                isSelected
                    ? "bg-primary/10 border-l-[2px] border-primary"
                    : "hover:bg-muted/40 border-l-[2px] border-transparent",
            )}
            onClick={() => onSelectFile(file.path)}
        >
            <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => onToggleCheck(file.path, e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                className="accent-primary w-3.5 h-3.5 shrink-0 cursor-pointer"
            />
            {getStatusIcon(file.status)}
            <span className={cn("truncate", isSelected && "font-semibold")}>{filename}</span>
            {dir && (
                <span className="typo-caption text-muted-foreground/50 shrink-0">{dir}</span>
            )}
            <span className={cn("typo-micro font-bold shrink-0 ml-auto pl-1", getStatusLetterClass(file.status))}>
                {getStatusLetter(file.status)}
            </span>
            <div className="relative">
                <button
                    ref={btnRef}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
                    className="opacity-0 group-hover:opacity-100 ml-0.5 p-1 rounded hover:bg-muted transition-opacity shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                    <MoreVertical size={13} />
                </button>
                {menuOpen && (
                    <div
                        ref={menuRef}
                        className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-lg"
                        style={{ fontFamily: "var(--font-sans, inherit)" }}
                    >
                        <button
                            className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDiscard(file.path); }}
                        >
                            <Undo2 size={13} className="opacity-80" />
                            Revertir
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Tree file menu (custom, no Radix) ─────────────────────────────────────────

function TreeFileMenu({ filePath, onDiscard }: { filePath: string; onDiscard: (p: string) => void }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current?.contains(e.target as Node)) return;
            if (btnRef.current?.contains(e.target as Node)) return;
            setMenuOpen(false);
        };
        document.addEventListener("pointerdown", handler);
        return () => document.removeEventListener("pointerdown", handler);
    }, [menuOpen]);

    return (
        <div className="relative">
            <button
                ref={btnRef}
                onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
            >
                <MoreVertical size={13} />
            </button>
            {menuOpen && (
                <div
                    ref={menuRef}
                    className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-lg"
                    style={{ fontFamily: "var(--font-sans, inherit)" }}
                >
                    <button
                        className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap text-destructive hover:bg-destructive/10"
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDiscard(filePath); }}
                    >
                        <Undo2 size={13} className="opacity-80" />
                        Revertir
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Tree node renderer ────────────────────────────────────────────────────────

function TreeNodeRow({
    node,
    depth,
    selectedFile,
    checkedFiles,
    onToggleCheck,
    onToggleDirCheck,
    onSelectFile,
    expandedDirs,
    toggleDir,
    onDiscard,
}: {
    node: TreeNode;
    depth: number;
    selectedFile: string | null;
    checkedFiles: Set<string>;
    onToggleCheck: (path: string, checked: boolean) => void;
    onToggleDirCheck: (node: TreeNode, checked: boolean) => void;
    onSelectFile: (path: string) => void;
    expandedDirs: Set<string>;
    toggleDir: (path: string) => void;
    onDiscard: (path: string) => void;
}) {
    const isDir = !node.file;
    const isExpanded = expandedDirs.has(node.fullPath);
    const isSelected = !isDir && selectedFile === node.file!.path;
    const sortedChildren = Object.values(node.children).sort((a, b) => {
        const aIsDir = !a.file;
        const bIsDir = !b.file;
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    return (
        <>
            <div
                className={cn(
                    "group flex items-center gap-1.5 py-1 pr-2.5 cursor-pointer select-none transition-colors typo-body",
                    isDir ? "hover:bg-muted/40" : isSelected
                        ? "bg-primary/10 border-l-[2px] border-primary"
                        : "hover:bg-muted/40 border-l-[2px] border-transparent",
                )}
                style={{ paddingLeft: `${4 + depth * 16}px` }}
                onClick={() => {
                    if (isDir) toggleDir(node.fullPath);
                    else onSelectFile(node.file!.path);
                }}
            >
                {isDir ? (
                    <>
                        <ChevronRight
                            size={14}
                            className={cn("text-muted-foreground/60 shrink-0 transition-transform", isExpanded && "rotate-90")}
                            onClick={(e) => { e.stopPropagation(); toggleDir(node.fullPath); }}
                        />
                        <TreeCheckbox 
                            state={getDirCheckState(node, checkedFiles)} 
                            onChange={(checked) => onToggleDirCheck(node, checked)} 
                        />
                        <Folder size={14} className="text-muted-foreground/60 shrink-0" />
                        <span className="truncate typo-caption font-medium">{node.name}</span>
                    </>
                ) : (
                    <>
                        <input
                            type="checkbox"
                            checked={checkedFiles.has(node.file!.path)}
                            onChange={(e) => onToggleCheck(node.file!.path, e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                            className="accent-primary w-3.5 h-3.5 shrink-0 ml-5 mr-0.5 cursor-pointer"
                        />
                        {getStatusIcon(node.file!.status)}
                        <span className={cn("truncate flex-1", isSelected && "font-semibold")}>{node.name}</span>
                        <span className={cn("typo-micro font-bold shrink-0 ml-auto pl-1", getStatusLetterClass(node.file!.status))}>
                            {getStatusLetter(node.file!.status)}
                        </span>
                        <TreeFileMenu
                            filePath={node.file!.path}
                            onDiscard={onDiscard}
                        />
                    </>
                )}
            </div>
            {isDir && isExpanded && sortedChildren.map(child => (
                <TreeNodeRow
                    key={child.fullPath}
                    node={child}
                    depth={depth + 1}
                    selectedFile={selectedFile}
                    checkedFiles={checkedFiles}
                    onToggleCheck={onToggleCheck}
                    onToggleDirCheck={onToggleDirCheck}
                    onSelectFile={onSelectFile}
                    expandedDirs={expandedDirs}
                    toggleDir={toggleDir}
                    onDiscard={onDiscard}
                />
            ))}
        </>
    );
}

// ─── Diff / Full file viewer ───────────────────────────────────────────────────

function FileContentViewer({
    diff,
    fullContent,
    filepath,
    isLoading,
}: {
    diff: string;
    fullContent: string;
    filepath: string | null;
    isLoading: boolean;
}) {
    const { isDarkMode } = useTheme();
    const lang = filepath ? getLanguageFromPath(filepath) : undefined;
    const highlighter = useHighlighter(lang);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo(0, 0);
    }, [filepath]);

    if (!filepath) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Diff size={36} className="opacity-15" />
                <p className="text-sm">Selecciona un archivo para ver diferencias</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
        );
    }

    const parts = filepath.split("/");
    const fileName = parts.pop() || filepath;
    const dirPath = parts.join("/");

    const renderFull = () => {
        if (!fullContent && !diff) return (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm italic">Archivo vacío o binario</div>
        );

        // ── Parse diff to get added lines & deleted lines positions ──
        const addedLines = new Set<number>();
        const deletedBefore = new Map<number, string[]>();

        if (diff) {
            const diffLines = diff.split("\n");
            let newLineNum = 0;
            let pendingDeleted: string[] = [];

            for (const dl of diffLines) {
                const hunkMatch = dl.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
                if (hunkMatch) {
                    if (pendingDeleted.length > 0 && newLineNum > 0) {
                        deletedBefore.set(newLineNum, [...(deletedBefore.get(newLineNum) || []), ...pendingDeleted]);
                        pendingDeleted = [];
                    }
                    newLineNum = parseInt(hunkMatch[1], 10);
                    continue;
                }
                if (newLineNum === 0) continue;

                if (dl.startsWith("+") && !dl.startsWith("+++")) {
                    if (pendingDeleted.length > 0) {
                        deletedBefore.set(newLineNum, [...(deletedBefore.get(newLineNum) || []), ...pendingDeleted]);
                        pendingDeleted = [];
                    }
                    addedLines.add(newLineNum);
                    newLineNum++;
                } else if (dl.startsWith("-") && !dl.startsWith("---")) {
                    pendingDeleted.push(dl.substring(1));
                } else if (!dl.startsWith("\\")) {
                    if (pendingDeleted.length > 0) {
                        deletedBefore.set(newLineNum, [...(deletedBefore.get(newLineNum) || []), ...pendingDeleted]);
                        pendingDeleted = [];
                    }
                    newLineNum++;
                }
            }
            // Flush remaining deleted at end
            if (pendingDeleted.length > 0) {
                deletedBefore.set(newLineNum, [...(deletedBefore.get(newLineNum) || []), ...pendingDeleted]);
            }
        }

        // ── Get syntax tokens from shiki ──
        let tokenLines: { content: string; color?: string }[][] | null = null;
        if (highlighter && lang) {
            try {
                const theme = isDarkMode ? "github-dark-default" : "github-light-default";
                const result = highlighter.codeToTokens(fullContent, { lang, theme });
                tokenLines = result.tokens;
            } catch { /* fallback to plain */ }
        }

        const lines = fullContent.split("\n");
        const elements: React.ReactNode[] = [];

        for (let i = 0; i < lines.length; i++) {
            const lineNum = i + 1;
            const isAdded = addedLines.has(lineNum);

            // Insert deleted lines (ghost lines) before this line
            const deleted = deletedBefore.get(lineNum);
            if (deleted) {
                for (let d = 0; d < deleted.length; d++) {
                    elements.push(
                        <div key={`del-${lineNum}-${d}`} className="flex min-h-[20px] bg-red-950/40">
                            <span className="w-11 shrink-0 text-right pr-2.5 border-r border-red-900/30 select-none text-xs leading-5 text-red-800">
                                −
                            </span>
                            <span className="px-3 flex-1 whitespace-pre text-red-400/60 italic">{deleted[d] || " "}</span>
                        </div>
                    );
                }
            }

            // Render the actual line with syntax highlighting + diff background
            const bg = isAdded ? "bg-green-950/40" : "";
            const lineNumColor = isAdded ? "text-green-700" : "text-muted-foreground/25";
            const borderColor = isAdded ? "border-green-900/30" : "border-white/5";

            elements.push(
                <div key={i} className={cn("flex min-h-[20px]", bg)}>
                    <span className={cn("w-11 shrink-0 text-right pr-2.5 border-r select-none text-xs leading-5", lineNumColor, borderColor)}>
                        {lineNum}
                    </span>
                    <span className="px-3 flex-1 whitespace-pre">
                        {tokenLines && tokenLines[i] ? (
                            tokenLines[i].map((token, j) => (
                                <span key={j} style={{ color: token.color }}>{token.content}</span>
                            ))
                        ) : (
                            <span className="text-foreground/75">{lines[i] || " "}</span>
                        )}
                    </span>
                </div>
            );
        }

        // Flush deleted lines at end of file
        const deletedAtEnd = deletedBefore.get(lines.length + 1);
        if (deletedAtEnd) {
            for (let d = 0; d < deletedAtEnd.length; d++) {
                elements.push(
                    <div key={`del-end-${d}`} className="flex min-h-[20px] bg-red-950/40">
                        <span className="w-11 shrink-0 text-right pr-2.5 border-r border-red-900/30 select-none text-xs leading-5 text-red-800">
                            −
                        </span>
                        <span className="px-3 flex-1 whitespace-pre text-red-400/60 italic">{deletedAtEnd[d] || " "}</span>
                    </div>
                );
            }
        }

        return (
            <pre className="typo-mono-xs leading-5 min-w-max">
                {elements}
            </pre>
        );
    };

    return (
        <div className="h-full flex flex-col min-h-0">
            {/* Toolbar: breadcrumb + view mode toggle */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0">
                <FolderOpen size={12} className="text-muted-foreground/50 shrink-0" />
                <span className="text-xs text-muted-foreground truncate min-w-0">
                    {dirPath && <span className="text-muted-foreground/60">{dirPath}/</span>}
                    <span className="text-white">{fileName}</span>
                </span>
            </div>

            {/* Content */}
            <div ref={scrollRef} className="flex-1 overflow-auto">
                {renderFull()}
            </div>
        </div>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────
console.log('[DEBUG] GitPanel MODULE LOADED at', new Date().toISOString());

export function GitPanel({ onClose, initialTab, initialCommitHash, isWindow }: GitPanelProps) {
    const [discardTarget, setDiscardTarget] = useState<string | null>(null);
    const appId = useAtomValue(selectedAppIdAtom);
    const { app, refreshApp } = useLoadApp(appId);
    const { settings } = useSettings();
    const hasGithubToken = !!settings?.githubAccessToken;
    const [activeTab, setActiveTab] = useState<"changes" | "history">(initialTab ?? "changes");

    const {
        uncommittedFiles,
        currentBranch,
        branches,
        gitState,
        commitMessage,
        setCommitMessage,
        stageFile,
        unstageFile,
        stageAll,
        unstageAll,
        commit,
        push,
        pull,
        fetch,
        generateCommitMessage,
        getFileDiff,
        isLoadingFiles,
        isStaging,
        isUnstaging,
        isCommitting,
        isPushing,
        isPulling,
        isFetching,
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
        switchBranch,
        isSwitchingBranch,
        discardFileChanges,
        isDiscarding,
    } = useGitPanel(appId);

    const hasRemote = !!(app?.githubOrg && app?.githubRepo) || gitState?.hasRemote === true;


    // ── file selection & diff ──
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [fileDiff, setFileDiff] = useState<string>("");
    const [fullContent, setFullContent] = useState<string>("");
    const [isLoadingDiff, setIsLoadingDiff] = useState(false);

    // ── checked files state (PHPStorm style) ──
    const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set());
    const prevUncommittedRef = useRef<string[]>([]);

    useEffect(() => {
        const currentPaths = uncommittedFiles.map(f => f.path);
        const prevPaths = prevUncommittedRef.current;
        if (currentPaths.join(',') !== prevPaths.join(',')) {
            const added = currentPaths.filter(p => !prevPaths.includes(p));
            if (added.length > 0) {
                setCheckedFiles(prev => {
                    const next = new Set(prev);
                    added.forEach(p => next.add(p));
                    return next;
                });
            }
            setCheckedFiles(prev => {
                const next = new Set<string>();
                currentPaths.forEach(p => { if (prev.has(p) || added.includes(p)) next.add(p); });
                return next;
            });
            prevUncommittedRef.current = currentPaths;
        }
    }, [uncommittedFiles]);

    const handleToggleCheck = useCallback((path: string, checked: boolean) => {
        setCheckedFiles(prev => {
            const next = new Set(prev);
            if (checked) next.add(path);
            else next.delete(path);
            return next;
        });
    }, []);

    const handleToggleDirCheck = useCallback((node: TreeNode, checked: boolean) => {
        const files = getFilesInDir(node);
        setCheckedFiles(prev => {
            const next = new Set(prev);
            files.forEach(f => checked ? next.add(f) : next.delete(f));
            return next;
        });
    }, []);

    const toggleAllChecks = useCallback((checked: boolean) => {
        setCheckedFiles(checked ? new Set(uncommittedFiles.map(f => f.path)) : new Set());
    }, [uncommittedFiles]);

    // ── DEBUG: track state changes ──
    useEffect(() => {
        console.log('[DEBUG] useEffect: discardTarget changed to:', discardTarget);
    }, [discardTarget]);

    // ── tree state ──
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
    const toggleDir = useCallback((p: string) => {
        setExpandedDirs(prev => {
            const next = new Set(prev);
            next.has(p) ? next.delete(p) : next.add(p);
            return next;
        });
    }, []);

    // ── conflict state ──
    const [expandedConflictFile, setExpandedConflictFile] = useState<string | null>(null);
    const [conflictDiff, setConflictDiff] = useState<string>("");
    const [isLoadingConflictDiff, setIsLoadingConflictDiff] = useState(false);
    const [showConflicts, setShowConflicts] = useState(true);

    // ── git tools ──
    const [isRemovingLock, setIsRemovingLock] = useState(false);

    // ── view type: flat list (default) or tree ──
    const [viewType, setViewType] = useState<"flat" | "tree">("flat");

    const hasChanges = uncommittedFiles.length > 0;
    const canCommit = commitMessage.trim().length > 0 && checkedFiles.size > 0;

    // ── trees built from file arrays ──
    const unstagedTree = useMemo(() => buildTree(uncommittedFiles), [uncommittedFiles]);

    // Auto-expand all directories when switching to tree view
    useEffect(() => {
        if (viewType !== "tree") return;
        const allDirs = new Set<string>();
        for (const f of uncommittedFiles) {
            const segments = f.path.split("/");
            for (let i = 1; i < segments.length; i++) {
                allDirs.add(segments.slice(0, i).join("/"));
            }
        }
        setExpandedDirs(allDirs);
    }, [viewType, uncommittedFiles.length]);

    // ── select file → load diff + full content ──
    const handleSelectFile = useCallback(async (filepath: string) => {
        setSelectedFile(filepath);
        setIsLoadingDiff(true);
        setFileDiff("");
        setFullContent("");
        try {
            const [diffResult, contentResult] = await Promise.all([
                getFileDiff(filepath),
                appId ? ipc.git.getFileContent({ appId, filepath }) : Promise.resolve({ content: "" }),
            ]);
            setFileDiff(diffResult?.diff ?? "");
            setFullContent(contentResult?.content ?? "");
        } catch {
            setFileDiff("");
            setFullContent("");
        } finally {
            setIsLoadingDiff(false);
        }
    }, [getFileDiff, appId]);

    const handleViewConflictDiff = useCallback(async (filepath: string) => {
        if (expandedConflictFile === filepath) { setExpandedConflictFile(null); return; }
        setExpandedConflictFile(filepath);
        setIsLoadingConflictDiff(true);
        try { const r = await getConflictFileDiff(filepath); setConflictDiff(r?.diff ?? ""); }
        catch { setConflictDiff(""); }
        finally { setIsLoadingConflictDiff(false); }
    }, [expandedConflictFile, getConflictFileDiff]);

    const handleCommit = useCallback(async () => {
        if (!commitMessage.trim() || checkedFiles.size === 0) return;
        const filesToStage = Array.from(checkedFiles);
        await commit({ message: commitMessage, filesToStage });
        setSelectedFile(null);
        setFileDiff("");
        setFullContent("");
    }, [commitMessage, commit, checkedFiles]);

    const handleCommitAndPush = useCallback(async () => {
        await handleCommit();
        await push({});
    }, [handleCommit, push]);

    const handleDiscard = useCallback((filepath: string) => {
        console.log('[DEBUG] handleDiscard called:', filepath);
        setDiscardTarget(filepath);
    }, []);

    return (
        <div className="h-full flex flex-col bg-background relative" style={{ fontFamily: "var(--font-sans, inherit)", fontSize: "inherit" }}>

            {/* ── Window title bar (drag region) ── */}
            {isWindow && (
                <div className="app-region-drag flex items-center justify-between px-3 h-9 bg-(--sidebar) border-b border-border shrink-0">
                    <div className="flex items-center gap-2 no-app-region-drag">
                        <GitBranch size={14} className="text-primary" />
                        <span className="typo-button">Commit</span>
                    </div>
                    <WindowsControls className="no-app-region-drag pr-0 pointer-events-auto" buttonClassName="h-9" />
                </div>
            )}

            {/* ── Sub-header: tabs + branch switcher ── */}
            <div className="flex items-center border-b border-border shrink-0 bg-sidebar">
                {/* Tabs */}
                <div className="flex">
                    {(["changes", "history"] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                "relative flex items-center gap-1.5 px-4 py-2.5 typo-tab transition-colors cursor-pointer",
                                activeTab === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground/80",
                            )}
                        >
                            {tab === "changes" ? <GitCommit size={15} /> : <History size={15} />}
                            {tab === "changes" ? "Cambios" : "Historial"}
                            {tab === "changes" && hasChanges && (
                                <span className="typo-caption px-1.5 py-0 rounded-full bg-primary/15 text-primary font-semibold">
                                    {uncommittedFiles.length}
                                </span>
                            )}
                            {activeTab === tab && (
                                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t-full bg-primary" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Branch + merge/rebase badges + Pull icon + close */}
                <div className="ml-auto flex items-center gap-1 pr-2">
                    {gitState?.mergeInProgress && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-500 font-semibold">MERGE</span>
                    )}
                    {gitState?.rebaseInProgress && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-500 font-semibold">REBASE</span>
                    )}
                    {/* Pull icon button - PHPStorm style */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer"
                                onClick={() => pull()} disabled={isPulling || isPushing}>
                                {isPulling ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Pull</TooltipContent>
                    </Tooltip>
                    {/* Push icon button - only visible when commits ahead */}
                    {(gitState?.ahead ?? 0) > 0 && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer text-primary"
                                    onClick={() => push({})} disabled={isPushing || isPulling}>
                                    {isPushing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Push ({gitState?.ahead} commit{gitState?.ahead !== 1 ? "s" : ""})</TooltipContent>
                        </Tooltip>
                    )}
                    {currentBranch && appId && (
                        <BranchSwitcher
                            appId={appId}
                            currentBranch={currentBranch}
                            branches={branches}
                            switchBranch={switchBranch}
                            isSwitchingBranch={isSwitchingBranch}
                            aheadCount={gitState?.ahead}
                            align="end"
                        />
                    )}
                    
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer hover:bg-muted ml-1">
                                <MoreVertical size={13} className="text-muted-foreground" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56" style={{ fontFamily: "var(--font-sans, inherit)" }}>
                            <DropdownMenuLabel className="typo-micro">Herramientas Git</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                                className="text-xs flex items-center gap-2 cursor-pointer"
                                disabled={isRemovingLock || !appId}
                                onClick={async (e) => {
                                    e.preventDefault();
                                    if (!appId) return;
                                    setIsRemovingLock(true);
                                    try {
                                        const r = await ipc.git.removeIndexLock({ appId });
                                        toast[r.removed ? "success" : "info"](r.removed ? "Lock eliminado" : "No hay lock activo");
                                    } catch (err: any) { toast.error(err.message); }
                                    finally { setIsRemovingLock(false); }
                                }}
                            >
                                {isRemovingLock ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}
                                Eliminar lock file
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                                className={cn("text-xs flex items-center gap-2 cursor-pointer", gitState?.mergeInProgress && "text-amber-500 focus:text-amber-400")}
                                disabled={isAbortingMerge}
                                onClick={async (e) => {
                                    e.preventDefault();
                                    try { await abortMerge(); toast.success("Merge abortado"); }
                                    catch (err: any) { toast.error(err.message); }
                                }}
                            >
                                <Ban size={13} />
                                Abortar merge
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                                className={cn("text-xs flex items-center gap-2 cursor-pointer", gitState?.rebaseInProgress && "text-orange-500 focus:text-orange-400")}
                                onClick={async (e) => {
                                    e.preventDefault();
                                    if (!appId) return;
                                    try { await ipc.github.rebaseAbort({ appId }); toast.success("Rebase abortado"); }
                                    catch (err: any) { toast.error(err.message); }
                                }}
                            >
                                <Ban size={13} />
                                Abortar rebase
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {!isWindow && (
                        <button onClick={onClose} className="p-1 hover:bg-muted rounded transition-colors ml-0.5">
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Tab content ── */}
            {activeTab === "history" ? (
                <div className="flex-1 overflow-hidden">
                    <GitCommitHistory initialCommitHash={initialCommitHash} />
                </div>
            ) : (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {/* Merge conflict banner */}
                    {gitState?.mergeInProgress && (
                        <MergeConflictSection
                            conflictFiles={conflictFiles}
                            showConflicts={showConflicts}
                            setShowConflicts={setShowConflicts}
                            expandedConflictFile={expandedConflictFile}
                            handleViewConflictDiff={handleViewConflictDiff}
                            conflictDiff={conflictDiff}
                            isLoadingConflictDiff={isLoadingConflictDiff}
                            resolveFileOurs={resolveFileOurs}
                            resolveFileTheirs={resolveFileTheirs}
                            resolveMergeOurs={resolveMergeOurs}
                            resolveMergeTheirs={resolveMergeTheirs}
                            abortMerge={abortMerge}
                            isResolvingFile={isResolvingFile}
                            isResolvingMerge={isResolvingMerge}
                            isAbortingMerge={isAbortingMerge}
                        />
                    )}

                    {/* Split panels */}
                    <PanelGroup direction="horizontal" className="flex-1 min-h-0">

                        {/* ── Left: file tree + commit area ── */}
                        <Panel defaultSize={32} minSize={22} maxSize={55}>
                            <PanelGroup direction="vertical" className="h-full">

                                {/* ── Top: file list ── */}
                                <Panel defaultSize={65} minSize={30}>
                                    <div className="h-full flex flex-col overflow-hidden">

                                    {/* File list */}
                                    <div className="flex-1 overflow-y-auto overflow-x-hidden">
                                    {isLoadingFiles ? (
                                        <div className="flex items-center justify-center py-10">
                                            <Loader2 size={18} className="animate-spin text-muted-foreground" />
                                        </div>
                                    ) : !hasChanges ? (
                                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-2">
                                            <Check size={28} className="text-green-500 opacity-60" />
                                            <p className="text-xs text-muted-foreground">Árbol de trabajo limpio</p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* ── File list toolbar: count + view toggle ── */}
                                            <div className="flex items-center px-2.5 py-1.5 gap-2 border-b border-border/40 shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={checkedFiles.size === uncommittedFiles.length && uncommittedFiles.length > 0}
                                                    ref={(el) => { if (el) el.indeterminate = checkedFiles.size > 0 && checkedFiles.size < uncommittedFiles.length; }}
                                                    onChange={(e) => toggleAllChecks(e.target.checked)}
                                                    className="accent-primary w-3.5 h-3.5 shrink-0 cursor-pointer"
                                                />
                                                <span className="text-xs text-muted-foreground/60 leading-none mt-[1px]">
                                                    {checkedFiles.size}/{uncommittedFiles.length} archivo{uncommittedFiles.length !== 1 ? "s" : ""}
                                                </span>
                                                <div className="ml-auto flex items-center gap-1">
                                                    {/* Flat / Tree toggle */}
                                                    <div className="flex items-center bg-muted rounded overflow-hidden ml-0.5">
                                                        {viewType === "flat" ? (
                                                            <button className="p-1.5 bg-background text-foreground cursor-default">
                                                                <List size={14} />
                                                            </button>
                                                        ) : (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <button onClick={() => setViewType("flat")}
                                                                        className="p-1.5 transition-colors cursor-pointer text-muted-foreground hover:text-foreground">
                                                                        <List size={14} />
                                                                    </button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Vista plana</TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                        {viewType === "tree" ? (
                                                            <button className="p-1.5 bg-background text-foreground cursor-default">
                                                                <FolderTree size={14} />
                                                            </button>
                                                        ) : (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <button onClick={() => setViewType("tree")}
                                                                        className="p-1.5 transition-colors cursor-pointer text-muted-foreground hover:text-foreground">
                                                                        <FolderTree size={14} />
                                                                    </button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Vista árbol</TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ── File list ── */}
                                            <div className="pb-1">
                                                {viewType === "flat" ? (
                                                    uncommittedFiles
                                                        .slice()
                                                        .sort((a, b) => a.path.localeCompare(b.path))
                                                        .map(file => (
                                                            <FlatFileRow
                                                                key={file.path}
                                                                file={file}
                                                                selectedFile={selectedFile}
                                                                isChecked={checkedFiles.has(file.path)}
                                                                onToggleCheck={handleToggleCheck}
                                                                onSelectFile={handleSelectFile}
                                                                onDiscard={handleDiscard}
                                                            />
                                                        ))
                                                ) : (
                                                    Object.values(unstagedTree.children)
                                                        .sort((a, b) => (!a.file ? -1 : !b.file ? 1 : 0) || a.name.localeCompare(b.name))
                                                        .map(child => (
                                                            <TreeNodeRow
                                                                key={child.fullPath}
                                                                node={child}
                                                                depth={0}
                                                                selectedFile={selectedFile}
                                                                checkedFiles={checkedFiles}
                                                                onToggleCheck={handleToggleCheck}
                                                                onToggleDirCheck={handleToggleDirCheck}
                                                                onSelectFile={handleSelectFile}
                                                                expandedDirs={expandedDirs}
                                                                toggleDir={toggleDir}
                                                                onDiscard={handleDiscard}
                                                            />
                                                        ))
                                                )}
                                            </div>
                                        </>
                                    )}
                                    </div>
                                    </div>
                                </Panel>

                                {/* ── Horizontal resize handle ── */}
                                <PanelResizeHandle className="relative flex h-px w-full items-center justify-center bg-border after:absolute after:inset-x-0 after:top-1/2 after:h-1 after:-translate-y-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-row-resize">
                                    <div className="z-10 flex h-3 w-4 items-center justify-center rounded-sm border bg-border">
                                        <GripHorizontal className="h-2.5 w-2.5 text-muted-foreground" />
                                    </div>
                                </PanelResizeHandle>

                                {/* ── Bottom: commit area ── */}
                                <Panel defaultSize={35} minSize={20} maxSize={65}>
                                    <div className="flex flex-col h-full overflow-hidden">

                                    {/* Commit area */}
                                    <div className="border-t border-border p-2.5 flex flex-col h-full overflow-hidden">
                                    {/* Commit message - fills available height, still manually resizable */}
                                    <textarea
                                        value={commitMessage}
                                        onChange={(e) => setCommitMessage(e.target.value)}
                                        placeholder="Mensaje de commit..."
                                        className={cn(
                                            "w-full flex-1 resize-none rounded border border-border bg-muted/20 px-2.5 py-2",
                                            "typo-body leading-relaxed min-h-[60px]",
                                            "focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40",
                                            "placeholder:text-muted-foreground/40",
                                        )}
                                        disabled={isCommitting || isGeneratingMessage}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canCommit) handleCommit();
                                        }}
                                    />

                                    {/* Action row: Commit + Commit & Push + AI icon (right) */}
                                    <div className="flex gap-2 items-center py-2.5 shrink-0">
                                        <Button
                                            size="sm"
                                            variant="default"
                                            className="h-8 text-sm gap-1.5 px-4 cursor-pointer"
                                            onClick={handleCommit}
                                            disabled={!canCommit || isCommitting}
                                        >
                                            {isCommitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                            Commit
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 text-sm gap-1.5 px-4 cursor-pointer"
                                            onClick={handleCommitAndPush}
                                            disabled={!canCommit || isCommitting || isPushing}
                                        >
                                            {(isCommitting || isPushing) ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                            Commit & Push
                                        </Button>
                                        <div className="flex-1" />
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-purple-400 hover:text-purple-300 cursor-pointer"
                                                    onClick={() => generateCommitMessage(uncommittedFiles.filter(f => checkedFiles.has(f.path)))}
                                                    disabled={isGeneratingMessage || checkedFiles.size === 0}>
                                                    {isGeneratingMessage ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Generar con IA</TooltipContent>
                                        </Tooltip>
                                    </div>

                                    {/* Remote setup if needed */}
                                    {hasGithubToken && !hasRemote && appId && (
                                        <GitRemoteSetup appId={appId} appName={app?.name || "app"} onLinked={() => refreshApp()} />
                                    )}
                                    </div>
                                    </div>
                                </Panel>

                            </PanelGroup>
                        </Panel>

                        <PanelResizeHandle className="relative flex w-px h-full items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 cursor-col-resize">
                            <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
                                <GripVertical className="h-2.5 w-2.5 text-muted-foreground" />
                            </div>
                        </PanelResizeHandle>

                        {/* ── Right: diff viewer ── */}
                        <Panel defaultSize={68} minSize={30}>
                            <FileContentViewer
                                diff={fileDiff}
                                fullContent={fullContent}
                                filepath={selectedFile}
                                isLoading={isLoadingDiff}
                            />
                        </Panel>
                    </PanelGroup>
                </div>
            )}

            {/* Single Commit Dialog */}
            
            <ConfirmationDialog
                isOpen={!!discardTarget}
                title="Revertir cambios"
                message={`¿Estás seguro de querer revertir los cambios en ${discardTarget}? Esta acción es irreversible.`}
                confirmText="Revertir"
                cancelText="Cancelar"
                onConfirm={async () => {
                    if (discardTarget) {
                        await discardFileChanges(discardTarget);
                        setDiscardTarget(null);
                    }
                }}
                onCancel={() => setDiscardTarget(null)}
            />
        </div>
    );
}

// ─── Shared small components ───────────────────────────────────────────────────

function SectionHeader({
    label,
    count,
    expanded,
    onToggle,
    alwaysExpanded,
    action,
    icon,
    labelClass,
}: {
    label: string;
    count: number;
    expanded: boolean;
    onToggle: () => void;
    alwaysExpanded?: boolean;
    action?: React.ReactNode;
    icon?: React.ReactNode;
    labelClass?: string;
}) {
    return (
        <div
            className="flex items-center gap-2 px-2.5 py-2 cursor-pointer hover:bg-muted/30 transition-colors select-none"
            onClick={alwaysExpanded ? undefined : onToggle}
        >
            {!alwaysExpanded && (
                <ChevronDown
                    size={14}
                    className={cn("text-muted-foreground/60 transition-transform", !expanded && "-rotate-90")}
                />
            )}
            {icon}
            <span className={cn("typo-body font-medium text-muted-foreground/70", labelClass)}>
                {label}
            </span>
            {count > 0 && (
                <span className="typo-micro px-1.5 rounded-full bg-muted font-semibold text-muted-foreground/60">
                    {count}
                </span>
            )}
            {action && <span className="ml-auto">{action}</span>}
        </div>
    );
}

function ToolButton({
    icon,
    label,
    loading,
    highlight,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    loading?: boolean;
    highlight?: "amber" | "orange";
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            disabled={loading}
            className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground text-left cursor-pointer",
                highlight === "amber" && "text-amber-500 hover:text-amber-400",
                highlight === "orange" && "text-orange-500 hover:text-orange-400",
            )}
        >
            {loading ? <Loader2 size={14} className="animate-spin shrink-0" /> : <span className="shrink-0">{icon}</span>}
            {label}
        </button>
    );
}

// ─── Merge conflict section ────────────────────────────────────────────────────

function MergeConflictSection({
    conflictFiles, showConflicts, setShowConflicts, expandedConflictFile,
    handleViewConflictDiff, conflictDiff, isLoadingConflictDiff,
    resolveFileOurs, resolveFileTheirs, resolveMergeOurs, resolveMergeTheirs,
    abortMerge, isResolvingFile, isResolvingMerge, isAbortingMerge,
}: {
    conflictFiles: string[];
    showConflicts: boolean;
    setShowConflicts: (v: boolean) => void;
    expandedConflictFile: string | null;
    handleViewConflictDiff: (f: string) => void;
    conflictDiff: string;
    isLoadingConflictDiff: boolean;
    resolveFileOurs: (f: string) => void;
    resolveFileTheirs: (f: string) => void;
    resolveMergeOurs: () => void;
    resolveMergeTheirs: () => void;
    abortMerge: () => void;
    isResolvingFile: boolean;
    isResolvingMerge: boolean;
    isAbortingMerge: boolean;
}) {
    return (
        <div className="border-b border-amber-500/25 bg-amber-950/20 shrink-0">
            <div className="px-3 py-2 space-y-2">
                <div className="flex items-center gap-2">
                    <GitMerge size={13} className="text-amber-500" />
                    <span className="text-xs font-semibold text-amber-400">Merge en progreso</span>
                </div>
                {conflictFiles.length > 0 && (
                    <div className="border border-amber-500/15 rounded overflow-hidden">
                        <div className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-amber-500/10 transition-colors"
                            onClick={() => setShowConflicts(!showConflicts)}>
                            <ChevronDown size={11} className={cn("text-amber-500/60 transition-transform", !showConflicts && "-rotate-90")} />
                            <AlertTriangle size={10} className="text-amber-500" />
                            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                                Conflictos ({conflictFiles.length})
                            </span>
                        </div>
                        {showConflicts && conflictFiles.map(file => {
                            const isExpanded = expandedConflictFile === file;
                            return (
                                <div key={file}>
                                    <div className={cn("group flex items-center gap-1.5 px-2.5 py-1 cursor-pointer hover:bg-amber-500/10 transition-colors", isExpanded && "bg-amber-500/8")}
                                        onClick={() => handleViewConflictDiff(file)}>
                                        <ChevronRight size={10} className={cn("text-amber-500/50 transition-transform shrink-0", isExpanded && "rotate-90")} />
                                        <AlertTriangle size={10} className="text-amber-500 shrink-0" />
                                        <span className="text-xs text-amber-200/80 truncate flex-1">{file.split("/").pop()}</span>
                                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Tooltip><TooltipTrigger asChild>
                                                <button onClick={e => { e.stopPropagation(); resolveFileOurs(file); }} disabled={isResolvingFile}
                                                    className="p-0.5 rounded hover:bg-blue-500/20 text-blue-400">
                                                    <ShieldCheck size={11} />
                                                </button>
                                            </TooltipTrigger><TooltipContent>Mío</TooltipContent></Tooltip>
                                            <Tooltip><TooltipTrigger asChild>
                                                <button onClick={e => { e.stopPropagation(); resolveFileTheirs(file); }} disabled={isResolvingFile}
                                                    className="p-0.5 rounded hover:bg-green-500/20 text-green-400">
                                                    <ArrowDownToLine size={11} />
                                                </button>
                                            </TooltipTrigger><TooltipContent>Suyo</TooltipContent></Tooltip>
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div className="border-t border-amber-500/10 overflow-x-auto max-h-48">
                                            {isLoadingConflictDiff ? (
                                                <div className="flex items-center justify-center py-4"><Loader2 size={14} className="animate-spin text-amber-500" /></div>
                                            ) : (
                                                <pre className="typo-mono-xs leading-[18px]">
                                                    {conflictDiff.split("\n").map((line, i) => {
                                                        let bg = "", fg = "text-foreground";
                                                        if (line.startsWith("<<<<<<<")) { bg = "bg-blue-500/15"; fg = "text-blue-400 font-semibold"; }
                                                        else if (line.startsWith("=======")) { bg = "bg-purple-500/15"; fg = "text-purple-400 font-semibold"; }
                                                        else if (line.startsWith(">>>>>>>")) { bg = "bg-orange-500/15"; fg = "text-orange-400 font-semibold"; }
                                                        else if (line.startsWith("+") && !line.startsWith("+++")) { bg = "bg-green-500/10"; fg = "text-green-400"; }
                                                        else if (line.startsWith("-") && !line.startsWith("---")) { bg = "bg-red-500/10"; fg = "text-red-400"; }
                                                        return <div key={i} className={cn("px-3", bg, fg)}>{line || " "}</div>;
                                                    })}
                                                </pre>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="flex-1 h-7 typo-caption border-blue-500/25 bg-blue-500/5 hover:bg-blue-500/10 text-blue-400"
                        onClick={() => resolveMergeOurs()} disabled={isResolvingMerge || isAbortingMerge}>
                        {isResolvingMerge ? <Loader2 size={11} className="animate-spin mr-1" /> : <ShieldCheck size={11} className="mr-1" />}
                        Conservar mío
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 h-7 typo-caption border-green-500/25 bg-green-500/5 hover:bg-green-500/10 text-green-400"
                        onClick={() => resolveMergeTheirs()} disabled={isResolvingMerge || isAbortingMerge}>
                        {isResolvingMerge ? <Loader2 size={11} className="animate-spin mr-1" /> : <ArrowDownToLine size={11} className="mr-1" />}
                        Aceptar suyo
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 typo-caption px-2 text-muted-foreground hover:text-red-400"
                        onClick={() => abortMerge()} disabled={isResolvingMerge || isAbortingMerge}>
                        {isAbortingMerge ? <Loader2 size={11} className="animate-spin mr-1" /> : <Ban size={11} className="mr-1" />}
                        Cancelar
                    </Button>
                </div>
            </div>
        </div>
    );
}
