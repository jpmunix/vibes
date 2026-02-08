import { useState, useEffect, useRef } from "react";
import { ipc } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Trash2, Edit3, X, Sparkles, Hash, User, Bot, MessageSquare, FileText } from "lucide-react";
import { InjectedItemPicker } from "./InjectedItemPicker";
import type { Debate, DebateMessage, InjectedItem } from "@/ipc/types/debate";
import { useDebates } from "@/hooks/useDebates";
import { useNotes } from "@/hooks/useNotes";
import { showError, showSuccess } from "@/lib/toast";
import ReactMarkdown from "react-markdown";

interface DebatePanelProps {
    debateId: number;
}

export function DebatePanel({ debateId }: DebatePanelProps) {
    const [debate, setDebate] = useState<Debate | null>(null);
    const [loading, setLoading] = useState(true);
    const [input, setInput] = useState("");
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [injectedItems, setInjectedItems] = useState<InjectedItem[]>([]);
    const { invalidateDebates } = useDebates();
    const { invalidateNotes } = useNotes();
    const scrollRef = useRef<HTMLDivElement>(null);
    const summaryRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadDebate();
        setInjectedItems([]);
        setIsEditingTitle(false);
    }, [debateId]);

    useEffect(() => {
        if (debate) setEditTitle(debate.title);
    }, [debate?.title]);

    const handleSaveTitle = async () => {
        if (!editTitle.trim() || editTitle === debate?.title) {
            setIsEditingTitle(false);
            return;
        }
        try {
            await ipc.debate.updateDebate({ id: debateId, title: editTitle });
            setDebate(prev => prev ? { ...prev, title: editTitle } : null);
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

    const loadDebate = async () => {
        setLoading(true);
        try {
            const d = await ipc.debate.getDebate(debateId);
            setDebate(d);
        } catch (e: any) {
            showError(`Error al cargar: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSendMessage = async () => {
        if (!input.trim() && injectedItems.length === 0) return;

        setIsStreaming(true);
        const currentInput = input;
        const currentInjected = [...injectedItems];
        setInput("");
        setInjectedItems([]);

        try {
            ipc.debateStream.start(
                {
                    debateId,
                    prompt: currentInput,
                    injectedItems: currentInjected,
                },
                {
                    onChunk: (data) => {
                        setDebate((prev) => (prev ? { ...prev, messages: data.messages } : null));
                    },
                    onEnd: () => {
                        setIsStreaming(false);
                        invalidateDebates();
                        // Just refresh data to be sure
                        loadDebate();
                    },
                    onError: (data) => {
                        showError(`Error: ${data.error}`);
                        setIsStreaming(false);
                    },
                }
            );
        } catch (e: any) {
            showError(e.message);
            setIsStreaming(false);
        }
    };

    const handleDeleteMessage = async (msgId: number) => {
        try {
            await ipc.debate.deleteMessage(msgId);
            setDebate((prev) =>
                prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== msgId) } : null
            );
            showSuccess("Mensaje eliminado");
        } catch (e: any) {
            showError(e.message);
        }
    };

    const handleSummarize = async () => {
        setIsSummarizing(true);
        try {
            const summary = await ipc.debate.summarizeDebate(debateId);
            setDebate((prev) => (prev ? { ...prev, summary } : null));
            showSuccess("Resumen generado con éxito");

            // Wait for re-render then scroll
            setTimeout(() => {
                summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 100);
        } catch (e: any) {
            showError(`Error al resumir: ${e.message}`);
        } finally {
            setIsSummarizing(false);
        }
    };

    const handleSaveAsNote = async () => {
        if (!debate?.summary) return;
        try {
            await ipc.note.createNote({
                title: `Resumen: ${debate.title}`,
                content: debate.summary
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

    if (loading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                <Loader2 className="animate-spin text-primary" size={40} />
                <span className="text-muted-foreground animate-pulse">Cargando debate...</span>
            </div>
        );
    }

    if (!debate) return null;

    return (
        <div className="flex flex-1 flex-col overflow-hidden bg-background/30">
            {/* Header section with glassmorphism */}
            <div className="border-b p-4 flex items-center justify-between bg-background/60 backdrop-blur-xl sticky top-0 z-20 shadow-sm">
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
                        {debate.tags.length === 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                Sin etiquetas
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSummarize}
                        disabled={isSummarizing}
                        className="gap-2 rounded-2xl hover:bg-amber-500/5 hover:border-amber-500/30 transition-all active:scale-95 group min-w-[100px]"
                    >
                        {isSummarizing ? (
                            <Loader2 size={14} className="text-amber-500 animate-spin" />
                        ) : (
                            <Sparkles size={14} className="text-amber-500 group-hover:animate-pulse" />
                        )}
                        <span className="hidden sm:inline">{isSummarizing ? "Resumiendo..." : "Resumir"}</span>
                    </Button>
                </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar" ref={scrollRef}>
                <div className="max-w-3xl mx-auto px-4 py-8 space-y-12">
                    {debate.summary && (
                        <div
                            ref={summaryRef}
                            className="bg-amber-500/5 border border-amber-500/10 p-6 rounded-2xl relative group/summary shadow-sm animate-in fade-in slide-in-from-top-4 duration-500"
                        >
                            <div className="flex items-center gap-2 mb-3 text-amber-600 dark:text-amber-400 font-bold text-xs tracking-widest uppercase">
                                <Sparkles size={14} /> Resumen del Debate
                            </div>
                            <p className="text-sm text-foreground/80 leading-relaxed italic pr-8">
                                {debate.summary}
                            </p>

                            <div className="mt-4 flex justify-end">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleSaveAsNote}
                                    className="gap-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 rounded-xl transition-all"
                                >
                                    <FileText size={12} />
                                    Guardar como nota
                                </Button>
                            </div>

                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-4 right-4 opacity-0 group-hover/summary:opacity-100 h-8 w-8 rounded-full text-muted-foreground hover:bg-amber-500/10 transition-all"
                                onClick={() => ipc.debate.updateDebate({ id: debateId, summary: "" }).then(loadDebate)}
                            >
                                <X size={14} />
                            </Button>
                        </div>
                    )}

                    {debate.messages.length === 0 && !isStreaming && (
                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/30 space-y-4">
                            <MessageSquare size={48} strokeWidth={1} />
                            <p className="text-lg font-medium tracking-tight">Comienza el debate enviando un mensaje.</p>
                        </div>
                    )}

                    {debate.messages.map((m) => (
                        <div
                            key={m.id}
                            className="flex gap-4 md:gap-6 group animate-in fade-in duration-300 relative"
                        >
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${m.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-zinc-800 text-zinc-200 dark:bg-zinc-200 dark:text-zinc-800"}`}
                            >
                                {m.role === "user" ? <User size={18} /> : <Bot size={18} />}
                            </div>

                            <div className="flex-1 space-y-4 overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-bold tracking-tight">
                                        {m.role === "user" ? "Tú" : "Vibes"}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/40 font-medium">
                                        {new Date(m.createdAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                </div>

                                <div className="space-y-4">
                                    {m.injectedItems && m.injectedItems.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {m.injectedItems.map((item, idx) => (
                                                <div
                                                    key={idx}
                                                    className="bg-secondary/50 backdrop-blur-sm rounded-lg px-3 py-1.5 text-[10px] flex items-center gap-2 border border-border/50"
                                                >
                                                    <Hash size={12} className="opacity-50" />
                                                    <span className="font-bold truncate max-w-[150px]">{item.title}</span>
                                                    <span className="opacity-50 text-[8px] uppercase">{item.type}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-secondary/50 prose-pre:rounded-xl prose-pre:border prose-pre:border-border/50">
                                        <ReactMarkdown>{m.content}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>

                            <div className="absolute -right-2 top-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                                    onClick={() => handleDeleteMessage(m.id)}
                                >
                                    <Trash2 size={12} />
                                </Button>
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
            <div className="p-4 md:p-6 border-t bg-background/50 backdrop-blur-2xl">
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
                                        onClick={() => handleRemoveInjected(idx)}
                                        className="ml-1 hover:bg-primary/20 p-0.5 rounded-full transition-colors"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-end gap-3 bg-secondary/30 rounded-3xl p-2 pl-4 border border-border/50 focus-within:border-primary/40 focus-within:bg-secondary/50 transition-all shadow-sm">
                        <div className="flex-shrink-0 mb-1">
                            <InjectedItemPicker onSelect={(item) => setInjectedItems((prev) => [...prev, item])} />
                        </div>

                        <textarea
                            className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none resize-none py-3 text-sm max-h-48 min-h-[44px] px-1 placeholder:text-muted-foreground/40 leading-relaxed"
                            placeholder="Pregunta lo que quieras... (injecta notas con /)"
                            rows={1}
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                // Auto-resize
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                        />

                        <Button
                            size="icon"
                            className="rounded-full h-10 w-10 flex-shrink-0 shadow-lg bg-primary hover:bg-primary/90 transition-all active:scale-95 shadow-primary/10"
                            disabled={isStreaming || (!input.trim() && injectedItems.length === 0)}
                            onClick={handleSendMessage}
                        >
                            <Send size={18} className={isStreaming ? "animate-pulse" : ""} />
                        </Button>
                    </div>
                    <div className="flex justify-center px-4">
                        <span className="text-[10px] text-muted-foreground/30 font-medium tracking-tight uppercase">
                            SHIFT + ENTER para nueva línea • AI Debater v1.2
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}


