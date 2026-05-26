import React, { useState, useCallback } from "react";
import { FileText, Plus, Minus, ChevronDown, ChevronUp, Sparkles, Loader2, SendHorizontal, GitCommit } from "@/components/ui/icons";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAtomValue, useSetAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom, chatMessagesByIdAtom } from "@/atoms/chatAtoms";
import { useGitPanel } from "@/hooks/useGitPanel";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { ipc } from "@/ipc/types";

interface FilesChangedBarProps {
    files: number;
    insertions: number;
    deletions: number;
    paths: string; // comma-separated basenames
}

/**
 * Compact summary bar rendered at the end of an agent response when files were modified.
 * Shows: file count, +insertions, -deletions.
 * Expandable: click to reveal an inline git commit panel scoped to only these files.
 * Persisted inside the message content as a `<vibes-files-changed>` tag.
 */
export const FilesChangedBar = React.memo(function FilesChangedBar({
    files,
    insertions,
    deletions,
    paths,
}: FilesChangedBarProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Read appId and chatId from atoms — avoids plumbing through renderCustomTag
    const appId = useAtomValue(selectedAppIdAtom);
    const chatId = useAtomValue(selectedChatIdAtom);

    if (files === 0) return null;

    const label = files === 1
        ? "1 archivo modificado"
        : `${files} archivos modificados`;

    const pathList = paths
        .split(",")
        .map(p => p.trim())
        .filter(Boolean);

    return (
        <div className="mt-3 mb-1 rounded-lg border border-border/40 bg-muted/20 text-xs text-muted-foreground select-none overflow-hidden">
            {/* Collapsed header — always visible */}
            <div
                onClick={() => setIsExpanded(prev => !prev)}
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
            >
                <FileText size={14} className="shrink-0 text-muted-foreground/70" />

                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="cursor-default font-medium">{label}</span>
                    </TooltipTrigger>
                    {pathList.length > 0 && (
                        <TooltipContent side="top" className="max-w-xs">
                            <ul className="text-xs space-y-0.5">
                                {pathList.map((p, i) => (
                                    <li key={i} className="font-mono">{p}</li>
                                ))}
                            </ul>
                        </TooltipContent>
                    )}
                </Tooltip>

                {insertions > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-green-500 font-mono font-medium">
                        <Plus size={10} />
                        {insertions}
                    </span>
                )}
                {deletions > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-red-500 font-mono font-medium">
                        <Minus size={10} />
                        {deletions}
                    </span>
                )}

                <div className="ml-auto">
                    {isExpanded ? (
                        <ChevronUp size={14} className="text-muted-foreground/50" />
                    ) : (
                        <ChevronDown size={14} className="text-muted-foreground/50" />
                    )}
                </div>
            </div>

            {/* Expanded commit panel */}
            {isExpanded && appId && chatId && (
                <InlineCommitPanel
                    appId={appId}
                    chatId={chatId}
                    scopedBasenames={pathList}
                />
            )}
        </div>
    );
});

// ─── Inline Commit Panel (expanded state) ────────────────────────────

interface InlineCommitPanelProps {
    appId: number;
    chatId: number;
    scopedBasenames: string[];
}

function InlineCommitPanel({ appId, chatId, scopedBasenames }: InlineCommitPanelProps) {
    const queryClient = useQueryClient();
    const setMessagesById = useSetAtom(chatMessagesByIdAtom);
    const [localMessage, setLocalMessage] = useState("");
    const [isLocalGenerating, setIsLocalGenerating] = useState(false);

    const {
        uncommittedFiles,
        commit,
        push,
        isCommitting,
        isPushing,
    } = useGitPanel(appId);

    // Cross-reference basenames from tag with full relative paths from git status
    const scopedSet = new Set(scopedBasenames);
    const matchedFiles = uncommittedFiles.filter(f => {
        const basename = f.path.split("/").pop() || f.path;
        return scopedSet.has(basename);
    });
    const filesToStage = matchedFiles.map(f => f.path);

    // Files already committed or not in working tree anymore
    const allCommitted = scopedBasenames.length > 0 && matchedFiles.length === 0 && uncommittedFiles.length >= 0;

    // Inject synthetic commit message into chat (same pattern as GitQuickCommit)
    const injectSyntheticCommitMessage = useCallback((action: "commit" | "commit-push", message: string) => {
        const filesList = filesToStage.join(",");
        const tag = `<vibes-git-commit action="${action}" files="${filesList}">${message}</vibes-git-commit>`;

        // Insert into DB
        ipc.chat.addSyntheticMessage({
            chatId,
            content: tag,
            model: "vibes/git-assistant"
        } as any);

        // Inject instantly into UI
        setMessagesById((prev) => {
            const next = new Map(prev);
            const msgs = next.get(chatId) || [];
            next.set(chatId, [...msgs, {
                id: Date.now(),
                chatId,
                role: "assistant",
                content: tag,
                model: "vibes/git-assistant",
                createdAt: new Date().toISOString(),
                aiMessagesJson: null
            } as any]);
            return next;
        });

        queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
        queryClient.invalidateQueries({ queryKey: queryKeys.chats.list({ appId }) });
    }, [chatId, appId, filesToStage, setMessagesById, queryClient]);

    // Generate commit message with AI (scoped to these files only)
    const handleGenerateMessage = useCallback(() => {
        if (!appId) return;
        setIsLocalGenerating(true);
        setLocalMessage("");

        let accumulated = "";
        let displayed = "";
        const renderQueue: string[] = [];
        let renderInterval: NodeJS.Timeout | null = null;
        let isDone = false;

        const cleanupListeners = () => {
            removeTokenListener?.();
            removeDoneListener?.();
            removeErrorListener?.();
        };

        renderInterval = setInterval(() => {
            if (renderQueue.length > 0) {
                const chars = renderQueue.splice(0, Math.max(1, Math.ceil(renderQueue.length / 15)));
                displayed += chars.join("");
                setLocalMessage(displayed);
            } else if (isDone) {
                if (renderInterval) clearInterval(renderInterval);
                setIsLocalGenerating(false);
                cleanupListeners();
            }
        }, 15);

        const removeTokenListener = (window as any).electron.ipcRenderer.on(
            "git:commit-message-token" as any,
            (payload: any) => {
                accumulated += payload.token;
                for (const char of payload.token) {
                    renderQueue.push(char);
                }
            },
        );

        const removeDoneListener = (window as any).electron.ipcRenderer.on(
            "git:commit-message-done" as any,
            () => { isDone = true; },
        );

        const removeErrorListener = (window as any).electron.ipcRenderer.on(
            "git:commit-message-error" as any,
            (payload: any) => {
                setLocalMessage(accumulated);
                isDone = true;
            },
        );

        // Fire with only the scoped files
        const filesToPass = matchedFiles.map(f => ({ path: f.path, status: f.status }));
        (window as any).electron.ipcRenderer
            .invoke("github:generate-commit-message-stream", { appId, files: filesToPass })
            .catch(() => {
                setLocalMessage("");
                isDone = true;
            });
    }, [appId, matchedFiles]);

    const handleCommit = async () => {
        if (!localMessage.trim() || isCommitting || isPushing) return;
        await commit({ message: localMessage, filesToStage });
        injectSyntheticCommitMessage("commit", localMessage);
        setLocalMessage("");
    };

    const handleCommitAndPush = async () => {
        if (!localMessage.trim() || isCommitting || isPushing) return;
        try {
            await commit({ message: localMessage, filesToStage });
            await push({});
            injectSyntheticCommitMessage("commit-push", localMessage);
            setLocalMessage("");
        } catch (e) {
            console.error("Failed to commit & push:", e);
        }
    };

    const busy = isCommitting || isPushing || isLocalGenerating;

    if (allCommitted) {
        return (
            <div className="px-3 pb-2.5 pt-1">
                <div className="flex items-center gap-2 text-[11px] text-green-500/80">
                    <GitCommit size={12} />
                    <span>Estos archivos ya fueron committeados</span>
                </div>
            </div>
        );
    }

    return (
        <div className="px-4 pb-4 pt-2 animate-in slide-in-from-top-1 duration-150">
            {/* Files matched indicator */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground/70 mb-3">
                <GitCommit size={13} />
                <span>
                    {filesToStage.length} de {scopedBasenames.length} archivo{scopedBasenames.length !== 1 ? "s" : ""} pendiente{filesToStage.length !== 1 ? "s" : ""}
                </span>
            </div>

            <div className="flex flex-col border border-border/60 bg-background/40 rounded-lg overflow-hidden focus-within:ring-1 focus-within:border-primary/50 focus-within:ring-primary/20 transition-all shadow-sm">
                <Textarea
                    value={localMessage}
                    onChange={(e) => setLocalMessage(e.target.value)}
                    disabled={busy}
                    placeholder={
                        isLocalGenerating
                            ? "Generando mensaje con IA..."
                            : "Escribe un mensaje de commit detallado..."
                    }
                    className="w-full min-h-[144px] border-0 focus-visible:ring-0 rounded-none bg-transparent resize-none p-4 text-xs placeholder:text-muted-foreground/50"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            handleCommitAndPush();
                        }
                    }}
                />

                <div className="flex items-center justify-between px-3 py-2.5 bg-muted/20 border-t border-border/40">
                    <div className="flex items-center">
                        <button
                            onClick={handleGenerateMessage}
                            disabled={busy}
                            className="flex items-center gap-1.5 px-3 py-2 text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-50 disabled:hover:bg-transparent rounded-md text-xs font-medium transition-colors"
                            title="Generar mensaje con IA (solo estos archivos)"
                        >
                            {isLocalGenerating ? (
                                <>
                                    <Loader2 size={14} className="animate-spin text-primary" />
                                    <span className="text-primary">Analizando...</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles size={14} />
                                    <span>Autogenerar</span>
                                </>
                            )}
                        </button>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCommit}
                            disabled={!localMessage.trim() || busy}
                            className="h-8 text-xs px-4 bg-muted/50 hover:bg-muted font-medium text-muted-foreground hover:text-foreground"
                        >
                            {isCommitting && <Loader2 size={12} className="mr-1.5 animate-spin" />}
                            Commit
                        </Button>

                        <Button
                            size="sm"
                            onClick={handleCommitAndPush}
                            disabled={!localMessage.trim() || busy}
                            className="h-8 text-xs px-4 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm"
                        >
                            {isPushing ? (
                                <Loader2 size={12} className="animate-spin" />
                            ) : (
                                <SendHorizontal size={12} className="opacity-80" />
                            )}
                            {isPushing ? "Enviando..." : "Commit & Push"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
