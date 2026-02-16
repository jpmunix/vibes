import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ipc } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Send,
  Trash2,
  Edit3,
  X,
  Sparkles,
  Hash,
  User,
  Bot,
  MessageSquare,
  FileText,
  StopCircle,
  Check,
} from "lucide-react";
import { InjectedItemPicker } from "./InjectedItemPicker";
import { DebateTagPicker } from "./DebateTagPicker";
import type { Debate, DebateMessage, InjectedItem } from "@/ipc/types/debate";
import { useDebates } from "@/hooks/useDebates";
import { useNotes } from "@/hooks/useNotes";
import { showError, showSuccess } from "@/lib/toast";
import {
  DyadMarkdownParser,
  VanillaMarkdownParser,
} from "@/components/chat/DyadMarkdownParser";
import { auth } from "@/lib/firebase";

import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";

interface DebatePanelProps {
  debateId?: number;
}

export function DebatePanel({ debateId }: DebatePanelProps) {
  const navigate = useNavigate();
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const [debate, setDebate] = useState<Debate | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [injectedItems, setInjectedItems] = useState<InjectedItem[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const { invalidateDebates } = useDebates();
  const { invalidateNotes } = useNotes();
  const scrollRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadDebate();
    setInjectedItems([]);
    setIsEditingTitle(false);
  }, [debateId]);

  useEffect(() => {
    if (debate) setEditTitle(debate.title);
  }, [debate?.title]);

  const handleSaveTitle = async () => {
    if (!debateId || !editTitle.trim() || editTitle === debate?.title) {
      setIsEditingTitle(false);
      return;
    }
    try {
      await ipc.debate.updateDebate({ id: debateId!, title: editTitle });
      setDebate((prev) => (prev ? { ...prev, title: editTitle } : null));
      setIsEditingTitle(false);
      invalidateDebates();
      showSuccess("Título actualizado");
    } catch (e: any) {
      showError(`Error al actualizar título: ${e.message}`);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [debate?.messages, isStreaming]);

  const loadDebate = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (!debateId) {
        // Mock empty debate for new session
        setDebate({
          id: 0,
          title: "Nuevo Debate",
          messages: [],
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          summary: undefined,
        } as any);
        setLoading(false);
        return;
      }
      const d = await ipc.debate.getDebate(debateId);
      setDebate(d);
    } catch (e: any) {
      showError(`Error al cargar: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (skipSave: boolean | any = false) => {
    if (!input.trim() && injectedItems.length === 0) return;

    let activeDebateId = debateId;

    // Create debate if it doesn't exist
    if (!activeDebateId) {
      try {
        activeDebateId = await ipc.debate.createDebate({
          title: "Nuevo Debate",
        });
        // We update the URL silently
        navigate({
          search: (prev: any) => ({ ...prev, id: activeDebateId }),
          replace: true
        });
      } catch (e: any) {
        showError(`Error al crear debate: ${e.message}`);
        return;
      }
    }

    setIsStreaming(true);
    const currentInput = input;
    const currentInjected = [...injectedItems];
    setInput("");
    setInjectedItems([]);

    // Create abort controller for this stream
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const isSkip = typeof skipSave === 'boolean' ? skipSave : false;

    try {
      ipc.debateStream.start(
        {
          debateId: activeDebateId,
          prompt: currentInput,
          mode: "append",
          injectedItems: currentInjected,
          appId: selectedAppId ?? undefined,
          skipSaveUserMessage: isSkip,
        },
        {
          onChunk: (data) => {
            setDebate((prev) =>
              prev ? { ...prev, messages: data.messages } : null,
            );
          },
          onEnd: () => {
            setIsStreaming(false);
            abortControllerRef.current = null;
            invalidateDebates();
          },
          onError: (data) => {
            showError(`Error: ${data.error}`);
            setIsStreaming(false);
            abortControllerRef.current = null;
          },
        },
      );
    } catch (e: any) {
      showError(e.message);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopStream = () => {
    if (debateId) {
      ipc.debate.abortStream({ debateId });
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    showSuccess("Generación detenida");
  };

  const handleEditMessage = (message: DebateMessage) => {
    if (message.role !== "user") return;
    setEditingMessageId(message.id);
    const cleanContent =
      message.content.split("\n\n--- CONTEXTO INYECTADO ---")[0];
    setEditingContent(cleanContent);
  };

  const handleSendEditedMessage = async () => {
    if (!editingContent.trim() || !debateId) return;

    const finalContent = editingContent;
    setEditingMessageId(null);
    setEditingContent("");

    setIsStreaming(true);

    // Create abort controller for this stream
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      ipc.debateStream.start(
        {
          debateId: debateId,
          prompt: finalContent,
          mode: "append",
          injectedItems: [], // No items for simple inline edit resend
          appId: selectedAppId ?? undefined,
        },
        {
          onChunk: (data) => {
            setDebate((prev) =>
              prev ? { ...prev, messages: data.messages } : null,
            );
          },
          onEnd: () => {
            setIsStreaming(false);
            abortControllerRef.current = null;
            invalidateDebates();
          },
          onError: (err) => {
            showError(`Error en el stream: ${err}`);
            setIsStreaming(false);
            abortControllerRef.current = null;
          },
          signal: abortController.signal,
        },
      );
    } catch (e: any) {
      showError(`Error al enviar mensaje editado: ${e.message}`);
      setIsStreaming(false);
    }
  };

  const handleDeleteMessage = async (msgId: number) => {
    try {
      await ipc.debate.deleteMessage(msgId);
      setDebate((prev) =>
        prev
          ? { ...prev, messages: prev.messages.filter((m) => m.id !== msgId) }
          : null,
      );
      showSuccess("Mensaje eliminado");
    } catch (e: any) {
      showError(e.message);
    }
  };

  const handleSummarize = async () => {
    if (!debateId) return;
    setIsSummarizing(true);
    try {
      const summary = await ipc.debate.summarizeDebate(debateId!);
      setDebate((prev) => (prev ? { ...prev, summary } : null));
      showSuccess("Resumen generado con éxito");

      // Wait for re-render then scroll
      setTimeout(() => {
        summaryRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    } catch (e: any) {
      showError(`Error al resumir: ${e.message}`);
    } finally {
      setIsSummarizing(false);
      setLoading(false);
      await loadDebate(); // Reload to get the new message
    }
  };

  const handleSaveAsNote = async () => {
    if (!debate?.summary) return;
    try {
      await ipc.note.createNote({
        title: `Resumen: ${debate.title}`,
        content: debate.summary,
      });
      await invalidateNotes();
      showSuccess("Resumen guardado como nota");
    } catch (e: any) {
      showError(`Error al guardar nota: ${e.message}`);
    }
  };

  const handleRemoveInjected = (idx: number) => {
    setInjectedItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleTagsChange = (tags: any[]) => {
    setDebate((prev) => (prev ? { ...prev, tags } : null));
    invalidateDebates();
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin text-primary" size={40} />
        <span className="text-muted-foreground animate-pulse">
          Cargando debate...
        </span>
      </div>
    );
  }

  if (!debate) return null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background/30">
      {/* Header section with glassmorphism */}
      <div className="border-b p-4 flex items-center justify-between bg-background sticky top-0 z-20 shadow-sm">
        <div className="flex flex-col overflow-hidden mr-4 flex-1">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                className="bg-secondary/30 border-none focus:ring-1 focus:ring-primary/30 rounded-lg px-2 py-1 text-lg font-bold w-full max-w-md outline-none"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") setIsEditingTitle(false);
                }}
                onBlur={handleSaveTitle}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 group/title">
              <h2
                className="text-lg font-bold truncate max-w-md bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setIsEditingTitle(true)}
              >
                {debate.title}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover/title:opacity-100 transition-opacity rounded-full"
                onClick={() => setIsEditingTitle(true)}
              >
                <Edit3 size={12} className="text-muted-foreground" />
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2 items-center mt-1">
            {debate.tags.map((t) => (
              <span
                key={t.id}
                className="bg-primary/10 text-primary text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 border border-primary/20"
              >
                <Hash size={10} /> {t.name}
              </span>
            ))}
            {debateId && (
              <DebateTagPicker
                debateId={debateId}
                selectedTags={debate.tags}
                onTagsChange={handleTagsChange}
              />
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSummarize}
            disabled={isSummarizing}
            className="gap-2 rounded-2xl hover:bg-primary/5 hover:border-primary/30 transition-colors active:scale-95 group min-w-[100px]"
          >
            {isSummarizing ? (
              <Loader2 size={14} className="text-primary animate-spin" />
            ) : (
              <Sparkles
                size={14}
                className="text-primary group-hover:animate-pulse"
              />
            )}
            <span className="hidden sm:inline">
              {isSummarizing ? "Resumiendo..." : "Resumir"}
            </span>
          </Button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar" ref={scrollRef}>
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-32 space-y-12">
          {debate.messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/30 space-y-4">
              <MessageSquare size={48} strokeWidth={1} />
              <p className="text-lg font-medium tracking-tight">
                Comienza el debate enviando un mensaje.
              </p>
            </div>
          )}

          {debate.messages.map((m, index) => (
            <div
              key={m.id}
              className={`flex gap-4 md:gap-6 group animate-in fade-in duration-300 relative ${m.role === "user" ? "flex-row-reverse" : ""
                }`}
            >
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm overflow-hidden ${m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-zinc-800 text-zinc-200 dark:bg-zinc-200 dark:text-zinc-800"
                  }`}
              >
                {m.role === "user" ? (
                  auth.currentUser?.photoURL ? (
                    <img
                      src={auth.currentUser.photoURL}
                      alt="User"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={18} />
                  )
                ) : (
                  <Bot size={18} />
                )}
              </div>

              <div className={`flex-1 space-y-4 overflow-hidden ${m.role === "user" ? "flex flex-col items-end" : ""}`}>
                <div className={`flex items-center gap-2 ${m.role === "user" ? "flex-row-reverse" : "justify-between"}`}>
                  <span className="text-sm font-bold tracking-tight">
                    {m.isSummary
                      ? "Resumen"
                      : m.role === "user"
                        ? "Tú"
                        : "Vibes"}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40 font-medium">
                    {new Date(m.createdAt!).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <div className={`space-y-4 ${m.role === "user" ? "flex flex-col items-end" : ""}`}>
                  {m.injectedItems && m.injectedItems.length > 0 && (
                    <div className="flex flex-col gap-2 mb-2 p-3 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/10 rounded-xl relative overflow-hidden group/context">
                      <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/50" />
                      <div className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-2 mb-1">
                        <Sparkles size={12} /> Contexto Inyectado (
                        {m.injectedItems.length})
                      </div>
                      <div className="flex flex-wrap gap-2 pl-2">
                        {m.injectedItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 text-[10px] flex items-center gap-2 border border-border/50 shadow-sm hover:border-indigo-500/30 transition-colors"
                          >
                            <Hash size={10} className="text-indigo-500/70" />
                            <span className="font-medium truncate max-w-[150px]">
                              {item.title}
                            </span>
                            <span className="text-muted-foreground/50 text-[8px] uppercase">
                              {item.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {editingMessageId === m.id ? (
                    <div className="bg-[#1a1c1e] rounded-2xl p-4 border border-border/50 mb-4 animate-in fade-in slide-in-from-top-2">
                      <textarea
                        autoFocus
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="w-full bg-transparent border-none outline-none resize-none text-foreground text-sm min-h-[120px] mb-4"
                        placeholder="Edita tu mensaje..."
                      />
                      <div className="flex items-center justify-end pt-2 border-t border-border/20">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditingContent("");
                            }}
                            className="rounded-full text-muted-foreground hover:text-foreground h-8 px-4"
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleSendEditedMessage}
                            className="rounded-full bg-white text-black hover:bg-gray-200 h-8 px-4 font-bold"
                          >
                            Enviar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-secondary/50 prose-pre:rounded-xl prose-pre:border prose-pre:border-border/50 ${m.isSummary
                        ? "text-primary dark:text-primary border-l-4 border-primary/50 pl-4 py-2 bg-primary/5 dark:bg-primary/10 rounded-r-lg"
                        : m.role === "user"
                          ? "bg-primary/60 text-primary-foreground rounded-2xl px-4 py-3 inline-block max-w-[80%]"
                          : ""
                        }`}
                    >
                      {m.isSummary && (
                        <div className="flex items-center gap-2 mb-2 font-bold text-xs uppercase tracking-widest opacity-70">
                          <Sparkles size={12} /> Resumen Generado
                        </div>
                      )}
                      {m.role === "assistant" ? (
                        <DyadMarkdownParser
                          content={
                            m.content.split("\n\n--- CONTEXTO INYECTADO ---")[0]
                          }
                          isStreaming={
                            isStreaming && index === debate.messages.length - 1
                          }
                        />
                      ) : (
                        <VanillaMarkdownParser
                          content={
                            m.content.split("\n\n--- CONTEXTO INYECTADO ---")[0]
                          }
                        />
                      )}

                      {m.isSummary && (
                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              ipc.note
                                .createNote({
                                  title: `Resumen: ${debate.title}`,
                                  content: m.content,
                                })
                                .then(() => {
                                  invalidateNotes();
                                  showSuccess("Resumen guardado como nota");
                                })
                            }
                            className="gap-2 text-xs hover:bg-primary/20 h-7"
                          >
                            <FileText size={10} /> Guardar Nota
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action buttons below bubble */}
                <div className={`flex gap-1 opacity-0 group-hover:opacity-100 transition-[opacity,transform] scale-90 group-hover:scale-100 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "user" && !isStreaming && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        handleEditMessage(m);
                      }}
                    >
                      <Edit3 size={12} />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteMessage(m.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {isStreaming && (
            <div className="flex gap-4 md:gap-6 animate-in fade-in">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-zinc-800 text-zinc-200 dark:bg-zinc-200 dark:text-zinc-800 shadow-sm">
                <Bot size={18} />
              </div>
              <div className="flex-1 pt-2">
                <div className="flex gap-1.5 items-center h-6">
                  <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce"></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modern Input Area */}
      <div className="p-4 md:p-6 border-t bg-background">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          {injectedItems.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 animate-in slide-in-from-bottom-2">
              {injectedItems.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-primary/5 text-primary text-[10px] font-bold px-3 py-1.5 rounded-full border border-primary/20 flex items-center gap-2 group shadow-sm"
                >
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                  <span className="truncate max-w-[200px]">{item.title}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveInjected(idx)}
                    className="ml-1 hover:bg-primary/20 p-0.5 rounded-full transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3 bg-secondary/30 rounded-3xl p-2 pl-4 border border-border/50 focus-within:border-primary/40 focus-within:bg-secondary/50 transition-[border-color,background-color] shadow-sm">
            <div className="flex-shrink-0 mb-1">
              <InjectedItemPicker
                onSelect={(item) => setInjectedItems((prev) => [...prev, item])}
              />
            </div>

            <textarea
              className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none resize-none py-3 text-sm max-h-48 min-h-[44px] px-1 placeholder:text-muted-foreground/40 leading-relaxed"
              placeholder="Pregunta lo que quieras... (injecta notas con /)"
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />

            <Button
              type="button"
              size="icon"
              className={`rounded-full h-10 w-10 flex-shrink-0 shadow-lg transition-colors active:scale-95 ${isStreaming
                ? "bg-destructive hover:bg-destructive/90 shadow-destructive/10"
                : "bg-primary hover:bg-primary/90 shadow-primary/10"
                }`}
              disabled={!isStreaming && (!input.trim() && injectedItems.length === 0)}
              onClick={() => isStreaming ? handleStopStream() : handleSendMessage('new')}
            >
              {isStreaming ? (
                <StopCircle size={18} />
              ) : (
                <Send size={18} />
              )}
            </Button>
          </div>
          <div className="flex justify-center px-4">
            <span className="text-[10px] text-muted-foreground/30 font-medium tracking-tight uppercase">
              SHIFT + ENTER para nueva línea • AI Debater v1.2
            </span>
          </div>
        </div>
      </div>
    </div >
  );
}
