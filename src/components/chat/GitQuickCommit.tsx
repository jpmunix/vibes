import { useState } from "react";
import { useGitPanel } from "@/hooks/useGitPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ipc } from "@/ipc/types";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useSetAtom } from "jotai";
import { chatMessagesByIdAtom } from "@/atoms/chatAtoms";
import {
  GitCommit,
  Sparkles,
  Loader2,
  SendHorizontal,
  ChevronDown,
  ChevronUp,
} from "@/components/ui/icons";

interface GitQuickCommitProps {
  appId: number;
  chatId: number;
  onDismiss: () => void;
}

export function GitQuickCommit({ appId, chatId, onDismiss }: GitQuickCommitProps) {
  const queryClient = useQueryClient();
  const setMessagesById = useSetAtom(chatMessagesByIdAtom);
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    uncommittedFiles,
    commitMessage,
    setCommitMessage,
    commit,
    push,
    generateCommitMessage,
    isCommitting,
    isPushing,
    isGeneratingMessage,
  } = useGitPanel(appId);

  if (uncommittedFiles.length === 0) {
    return null;
  }

  const formatSyntheticMessage = (title: string) => {
    const filesList = uncommittedFiles.map(f => `- \`${f.path}\``).join('\n');
    return `**${title}**\n\n**Mensaje del commit**\n${commitMessage}\n\n**Archivos modificados**\n${filesList}`;
  };

  const injectSyntheticMessage = (content: string) => {
    // Insert into DB
    ipc.chat.addSyntheticMessage({ 
      chatId, 
      content,
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
        content,
        model: "vibes/git-assistant",
        createdAt: new Date().toISOString(),
        aiMessagesJson: null
      } as any]);
      return next;
    });
    
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(chatId) });
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || isCommitting || isPushing) return;
    await commit({ message: commitMessage });
    injectSyntheticMessage(formatSyntheticMessage("📝 Commit completado"));
    setCommitMessage("");
  };

  const handleCommitAndPush = async () => {
    if (!commitMessage.trim() || isCommitting || isPushing) return;
    try {
      await commit({ message: commitMessage });
      await push({});
      injectSyntheticMessage(formatSyntheticMessage("🚀 Commit & Push completado"));
      setCommitMessage("");
    } catch (e) {
      console.error("Failed to commit & push:", e);
    }
  };

  const fileCount = uncommittedFiles.length;

  return (
    <div className="flex flex-col border-b border-border bg-muted/30 backdrop-blur-md animate-in slide-in-from-top duration-200">
      {/* Header / Collapsed Banner (Clickable to Expand/Collapse) */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between p-2 px-3 cursor-pointer hover:bg-muted-foreground/5 transition-colors select-none"
      >
        <div className="flex items-center gap-2">
          <GitCommit size={15} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Cambios rápidos detectados
          </span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/15 text-primary border border-primary/20">
            {fileCount} {fileCount === 1 ? "archivo" : "archivos"}
          </span>
        </div>
        <div className="p-1 text-muted-foreground/60 hover:text-foreground hover:bg-muted rounded-full transition-colors">
          {isExpanded ? (
            <ChevronUp size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
        </div>
      </div>

      {/* Expanded Actions Panel */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-2 animate-in slide-in-from-top-1 duration-150">
          <div className="flex flex-col border border-border/60 bg-background/40 rounded-lg overflow-hidden focus-within:ring-1 focus-within:border-primary/50 focus-within:ring-primary/20 transition-all shadow-sm">
            <Textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              disabled={isGeneratingMessage || isCommitting || isPushing}
              placeholder={
                isGeneratingMessage
                  ? "Generando mensaje con IA..."
                  : "Escribe un mensaje de commit detallado..."
              }
              className="w-full min-h-[80px] border-0 focus-visible:ring-0 rounded-none bg-transparent resize-none p-3 text-xs placeholder:text-muted-foreground/50"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleCommitAndPush();
                }
              }}
            />
            
            <div className="flex items-center justify-between p-2 bg-muted/20 border-t border-border/40">
              <div className="flex items-center">
                <button
                  onClick={() => generateCommitMessage()}
                  disabled={isGeneratingMessage || isCommitting || isPushing}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-50 disabled:hover:bg-transparent rounded-md text-[11px] font-medium transition-colors"
                  title="Regenerar mensaje con IA"
                >
                  {isGeneratingMessage ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-primary" />
                      <span className="text-primary">Analizando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} />
                      <span>Autogenerar</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCommit}
                  disabled={!commitMessage.trim() || isGeneratingMessage || isCommitting || isPushing}
                  className="h-7 text-xs px-3 bg-muted/50 hover:bg-muted font-medium text-muted-foreground hover:text-foreground"
                >
                  {isCommitting ? (
                    <Loader2 size={12} className="mr-1.5 animate-spin" />
                  ) : null}
                  Commit
                </Button>

                <Button
                  size="sm"
                  onClick={handleCommitAndPush}
                  disabled={!commitMessage.trim() || isGeneratingMessage || isCommitting || isPushing}
                  className="h-7 text-xs px-3.5 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm"
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
      )}
    </div>
  );
}
