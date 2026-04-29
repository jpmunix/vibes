/**
 * Playground Window — Model Comparison Tool
 *
 * Allows the user to write a single prompt, select multiple models,
 * and run the prompt sequentially against each model to compare
 * response quality and latency.
 */
import { useEffect, useState, useCallback, useMemo, useRef, type ChangeEvent } from "react";
import {
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { getColorById, adjustChroma, DEFAULT_LIGHT_COLOR, DEFAULT_DARK_COLOR } from "@/components/PrimaryColorPicker";
import { useSettings } from "@/hooks/useSettings";
import { WindowsControls } from "@/components/WindowsControls";
import {
    FlaskConical,
    Loader2,
    X,
    SendHorizontal,
    Clock,
    Zap,
    AlertCircle,
    Search,
    Plus,
    ChevronDown,
    ChevronRight,
    ArrowUpDown,
    RotateCcw,
    RefreshCw,
    StopCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import { ipc, type LanguageModel } from "@/ipc/types";
import { useModelAliases } from "@/hooks/useModelAliases";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandInput,
    CommandList,
    CommandGroup,
    CommandItem,
} from "@/components/ui/command";
import { Check } from "@/components/ui/icons";
import { ModelItemContent } from "@/components/ModelItemContent";

import "@/styles/globals.css";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 10_000, retry: false },
        mutations: { retry: false },
    },
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface ModelResult {
    modelApiName: string;
    modelDisplayName: string;
    text: string;
    inputTokens?: number;
    outputTokens?: number;
    durationMs: number;
    error?: boolean;
}

// ─── Smart content renderer ──────────────────────────────────────────────────

function isJsonString(str: string): boolean {
    const trimmed = str.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
    try {
        JSON.parse(trimmed);
        return true;
    } catch {
        return false;
    }
}

function ResponseContent({ text }: { text: string }) {
    if (isJsonString(text)) {
        try {
            const parsed = JSON.parse(text.trim());
            return (
                <pre className="playground-code-block">
                    <code>{JSON.stringify(parsed, null, 2)}</code>
                </pre>
            );
        } catch { /* fall through */ }
    }

    // Check if it contains code blocks (```...```)
    const hasCodeBlocks = /```[\s\S]*?```/.test(text);
    if (hasCodeBlocks) {
        const parts = text.split(/(```[\s\S]*?```)/g);
        return (
            <div className="space-y-3">
                {parts.map((part, i) => {
                    if (part.startsWith("```")) {
                        const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
                        const lang = match?.[1] || "";
                        const code = match?.[2] || part.slice(3, -3);
                        return (
                            <div key={i} className="relative">
                                {lang && (
                                    <span className="absolute top-2 right-2 typo-caption px-2 py-0.5 rounded bg-muted/50 text-muted-foreground text-[10px]">
                                        {lang}
                                    </span>
                                )}
                                <pre className="playground-code-block">
                                    <code>{code.trim()}</code>
                                </pre>
                            </div>
                        );
                    }
                    if (!part.trim()) return null;
                    return (
                        <div key={i} className="playground-prose whitespace-pre-wrap">
                            {part}
                        </div>
                    );
                })}
            </div>
        );
    }

    // Plain text
    return <div className="playground-prose whitespace-pre-wrap">{text}</div>;
}

// ─── Result card (collapsible) ────────────────────────────────────────────────

function ResultCard({ result, collapsed, rank, onToggle, onRetry, isRetrying }: {
    result: ModelResult;
    collapsed: boolean;
    rank?: number;
    onToggle: () => void;
    onRetry?: () => void;
    isRetrying?: boolean;
}) {
    return (
        <div className="playground-result-card">
            <div className="playground-result-header" onClick={onToggle} style={{ cursor: 'pointer' }}>
                {rank != null && (
                    <span className={`playground-rank ${rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : ''}`}>
                        #{rank}
                    </span>
                )}
                <h3 className="typo-label !text-sm font-semibold truncate flex-1">
                    {result.modelDisplayName}
                </h3>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="flex items-center gap-1 typo-caption text-muted-foreground">
                        <Clock size={12} className="opacity-60" />
                        {(result.durationMs / 1000).toFixed(2)}s
                    </span>
                    {(result.inputTokens != null || result.outputTokens != null) && (
                        <span className="flex items-center gap-1 typo-caption text-muted-foreground">
                            <Zap size={12} className="opacity-60" />
                            {result.inputTokens ?? "?"}→{result.outputTokens ?? "?"}
                        </span>
                    )}
                    <ChevronDown
                        size={14}
                        className="text-muted-foreground transition-transform duration-200"
                        style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)' }}
                    />
                    {onRetry && (
                        <button
                            type="button"
                            className="playground-retry-btn"
                            onClick={(e) => { e.stopPropagation(); onRetry(); }}
                            disabled={isRetrying}
                            title="Repetir este modelo"
                        >
                            {isRetrying ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        </button>
                    )}
                </div>
            </div>
            {!collapsed && (
                <div className="playground-result-body">
                    {result.error ? (
                        <div className="flex items-center gap-2 text-destructive">
                            <AlertCircle size={14} />
                            <span className="typo-body text-sm">{result.text}</span>
                        </div>
                    ) : (
                        <ResponseContent text={result.text} />
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main Playground Panel ───────────────────────────────────────────────────

function PlaygroundPanel() {
    const [prompt, setPrompt] = useState("");
    const [selectedModels, setSelectedModels] = useState<string[]>([]);
    const [disabledModels, setDisabledModels] = useState<Set<string>>(new Set());
    const [results, setResults] = useState<ModelResult[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [currentModelIndex, setCurrentModelIndex] = useState(-1);
    const [allModels, setAllModels] = useState<LanguageModel[]>([]);
    const [modelSearch, setModelSearch] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [modelTimes, setModelTimes] = useState<Map<string, number>>(new Map());
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
    const [runFinished, setRunFinished] = useState(false);
    const [sortMode, setSortMode] = useState<'speed-asc' | 'speed-desc' | 'size-asc' | 'size-desc'>('speed-asc');
    const [retryingModel, setRetryingModel] = useState<string | null>(null);
    const { aliases } = useModelAliases();
    const resultsRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const cancelledRef = useRef(false);
    const userScrolledRef = useRef(false);
    const [inputCollapsed, setInputCollapsed] = useState(false);

    // Load models from IPC
    useEffect(() => {
        ipc.languageModel.getModels({ providerId: "openrouter" }).then(setAllModels).catch(console.error);
    }, []);

    // Build a display name lookup
    const modelDisplayNameMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const m of allModels) {
            map.set(m.apiName, aliases[m.apiName] || m.displayName);
        }
        return map;
    }, [allModels, aliases]);

    // Filter and sort models for the picker
    const pickerModels = useMemo(() => {
        const q = modelSearch.trim().toLowerCase().replace(/-/g, ' ');
        const filtered = allModels.filter(m => {
            if (!q) return true;
            const display = (aliases[m.apiName] || m.displayName).toLowerCase().replace(/-/g, ' ');
            const api = m.apiName.toLowerCase().replace(/-/g, ' ');
            return display.includes(q) || api.includes(q);
        });

        // Sort: selected first, then alphabetical
        return filtered.sort((a, b) => {
            const aSelected = selectedModels.includes(a.apiName);
            const bSelected = selectedModels.includes(b.apiName);
            if (aSelected && !bSelected) return -1;
            if (!aSelected && bSelected) return 1;
            const nameA = aliases[a.apiName] || a.displayName;
            const nameB = aliases[b.apiName] || b.displayName;
            return nameA.localeCompare(nameB);
        });
    }, [modelSearch, allModels, aliases, selectedModels]);

    // Smart auto-scroll: pause when user scrolls up, resume when at bottom
    useEffect(() => {
        const el = resultsRef.current;
        if (!el) return;
        const handleScroll = () => {
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
            userScrolledRef.current = !atBottom;
        };
        el.addEventListener("scroll", handleScroll);
        return () => el.removeEventListener("scroll", handleScroll);
    }, []);

    // Add or remove a single model (toggle in the picker)
    const handleTogglePickerModel = useCallback((apiName: string) => {
        if (selectedModels.includes(apiName)) {
            setSelectedModels(prev => prev.filter(m => m !== apiName));
            setDisabledModels(prev => { const s = new Set(prev); s.delete(apiName); return s; });
        } else {
            setSelectedModels(prev => [...prev, apiName]);
        }
    }, [selectedModels]);

    // Remove a model chip
    const handleRemoveModel = useCallback((apiName: string) => {
        setSelectedModels(prev => prev.filter(m => m !== apiName));
        setDisabledModels(prev => { const s = new Set(prev); s.delete(apiName); return s; });
    }, []);

    // Toggle a model chip active/disabled
    const handleToggleModel = useCallback((apiName: string) => {
        setDisabledModels(prev => {
            const s = new Set(prev);
            if (s.has(apiName)) s.delete(apiName); else s.add(apiName);
            return s;
        });
    }, []);

    // Active models (selected but not disabled)
    const activeModels = useMemo(() => selectedModels.filter(m => !disabledModels.has(m)), [selectedModels, disabledModels]);

    // Chips ordered: during/after a run, sort completed ones by time (fastest first), incomplete ones at the end
    const orderedChips = useMemo(() => {
        if (modelTimes.size === 0) return selectedModels;
        return [...selectedModels].sort((a, b) => {
            const ta = modelTimes.get(a);
            const tb = modelTimes.get(b);
            if (ta != null && tb != null) return ta - tb;
            if (ta != null) return -1;
            if (tb != null) return 1;
            return 0;
        });
    }, [selectedModels, modelTimes]);

    // Sorted results for display (sorted after run finishes)
    const displayResults = useMemo(() => {
        if (!runFinished) return results;
        return [...results].sort((a, b) => {
            switch (sortMode) {
                case 'speed-asc':  return a.durationMs - b.durationMs;
                case 'speed-desc': return b.durationMs - a.durationMs;
                case 'size-asc':   return a.text.length - b.text.length;
                case 'size-desc':  return b.text.length - a.text.length;
                default:           return 0;
            }
        });
    }, [results, runFinished, sortMode]);

    // Sort labels for dropdown
    const sortLabels: Record<string, string> = {
        'speed-asc': 'Más rápido primero',
        'speed-desc': 'Más lento primero',
        'size-asc': 'Respuesta más corta',
        'size-desc': 'Respuesta más larga',
    };

    // Reset everything (keep prompt)
    const handleReset = useCallback(() => {
        setSelectedModels([]);
        setDisabledModels(new Set());
        setResults([]);
        setModelTimes(new Map());
        setExpandedCards(new Set());
        setRunFinished(false);
        setSortMode('speed-asc');
        setModelSearch("");
        setSearchOpen(false);
        setCurrentModelIndex(-1);
        setRetryingModel(null);
        setInputCollapsed(false);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    }, []);

    // Retry a single model
    const handleRetryModel = useCallback(async (modelApiName: string) => {
        if (!prompt.trim() || retryingModel) return;
        setRetryingModel(modelApiName);
        const modelDisplayName = modelDisplayNameMap.get(modelApiName) || modelApiName;

        const startTime = performance.now();
        try {
            const response = await ipc.misc.playgroundCompletion({
                model: modelApiName,
                prompt: prompt.trim(),
            });
            const durationMs = performance.now() - startTime;
            const newResult: ModelResult = {
                modelApiName,
                modelDisplayName,
                text: response.text,
                inputTokens: response.inputTokens,
                outputTokens: response.outputTokens,
                durationMs,
            };
            setResults(prev => prev.map(r => r.modelApiName === modelApiName ? newResult : r));
            setModelTimes(prev => new Map(prev).set(modelApiName, durationMs));
        } catch (error: any) {
            const durationMs = performance.now() - startTime;
            const newResult: ModelResult = {
                modelApiName,
                modelDisplayName,
                text: error?.message || String(error),
                durationMs,
                error: true,
            };
            setResults(prev => prev.map(r => r.modelApiName === modelApiName ? newResult : r));
            setModelTimes(prev => new Map(prev).set(modelApiName, durationMs));
        }
        setRetryingModel(null);
    }, [prompt, retryingModel, modelDisplayNameMap]);

    // Run the prompt sequentially against active models only
    const handleSubmit = useCallback(async () => {
        if (!prompt.trim() || activeModels.length === 0 || isRunning) return;

        setIsRunning(true);
        setRunFinished(false);
        setResults([]);
        setModelTimes(new Map());
        setExpandedCards(new Set());
        setCurrentModelIndex(0);
        cancelledRef.current = false;
        userScrolledRef.current = false;
        setInputCollapsed(true);

        for (let i = 0; i < activeModels.length; i++) {
            if (cancelledRef.current) break;

            setCurrentModelIndex(i);
            const modelApiName = activeModels[i];
            const modelDisplayName = modelDisplayNameMap.get(modelApiName) || modelApiName;

            const startTime = performance.now();
            let durationMs = 0;
            try {
                const response = await ipc.misc.playgroundCompletion({
                    model: modelApiName,
                    prompt: prompt.trim(),
                });

                if (cancelledRef.current) break;

                durationMs = performance.now() - startTime;

                setResults(prev => [...prev, {
                    modelApiName,
                    modelDisplayName,
                    text: response.text,
                    inputTokens: response.inputTokens,
                    outputTokens: response.outputTokens,
                    durationMs,
                }]);
            } catch (error: any) {
                if (cancelledRef.current) break;

                durationMs = performance.now() - startTime;
                setResults(prev => [...prev, {
                    modelApiName,
                    modelDisplayName,
                    text: error?.message || String(error),
                    durationMs,
                    error: true,
                }]);
            }

            // Update chip times after each model completes
            setModelTimes(prev => new Map(prev).set(modelApiName, durationMs));

            // Auto-scroll to bottom (only if user hasn't scrolled)
            if (!userScrolledRef.current) {
                setTimeout(() => {
                    resultsRef.current?.scrollTo({
                        top: resultsRef.current.scrollHeight,
                        behavior: "smooth",
                    });
                }, 50);
            }
        }

        // Run finished: collapse all, sort, scroll to top
        setRunFinished(true);
        setIsRunning(false);
        setCurrentModelIndex(-1);
        setTimeout(() => {
            if (!userScrolledRef.current) {
                resultsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            }
        }, 100);
    }, [prompt, activeModels, isRunning, modelDisplayNameMap]);

    // Cancel in-flight request and stop the loop
    const handleCancel = useCallback(async () => {
        cancelledRef.current = true;
        try {
            await ipc.misc.playgroundCancel({});
        } catch { /* ignore */ }
    }, []);

    // Toggle expand/collapse for a single result card
    const toggleCard = useCallback((key: string) => {
        setExpandedCards(prev => {
            const s = new Set(prev);
            if (s.has(key)) s.delete(key); else s.add(key);
            return s;
        });
    }, []);

    // Ctrl+Enter to submit
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSubmit();
        }
    }, [handleSubmit]);

    // Auto-resize textarea
    const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPrompt(e.target.value);
        const ta = e.target;
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 720)}px`;
    }, []);

    return (
        <div ref={resultsRef} className="playground-scroll-root">
            <style>{`
                /* ── Playground styles ── */
                .playground-scroll-root {
                    flex: 1;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-4, 16px);
                    padding: var(--spacing-5, 20px) var(--spacing-5, 20px);
                }

                .playground-input-area {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-3, 12px);
                    flex-shrink: 0;
                }

                .playground-collapse-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    cursor: pointer;
                    padding: var(--spacing-3, 12px) var(--spacing-4, 16px);
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    background: var(--card, var(--background));
                    user-select: none;
                    transition: background 0.15s;
                }
                .playground-collapse-header:hover {
                    background: var(--muted);
                }

                .playground-textarea {
                    width: 100%;
                    min-height: 240px;
                    max-height: 720px;
                    resize: none;
                    overflow-y: auto;
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    padding: var(--spacing-3, 12px) var(--spacing-4, 16px);
                    background: var(--background);
                    color: var(--foreground);
                    font-family: inherit;
                    outline: none;
                    transition: border-color 0.15s ease, box-shadow 0.15s ease;
                }
                .playground-textarea:focus {
                    border-color: var(--primary);
                    box-shadow: 0 0 0 2px oklch(from var(--primary) l c h / 0.15);
                }
                .playground-textarea::placeholder {
                    color: var(--muted-foreground);
                    opacity: 0.6;
                }

                .playground-chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    align-items: center;
                }

                .playground-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 14px;
                    border-radius: 8px;
                    background: oklch(from var(--primary) l c h / 0.12);
                    color: var(--primary);
                    font-size: 12px;
                    font-weight: 500;
                    line-height: 1.4;
                    cursor: pointer;
                    user-select: none;
                    transition: opacity 0.2s, background 0.2s;
                    animation: chipIn 0.2s cubic-bezier(0.22, 1, 0.36, 1);
                }
                .playground-chip:hover {
                    background: oklch(from var(--primary) l c h / 0.18);
                }
                .playground-chip.disabled {
                    opacity: 0.35;
                    background: var(--muted);
                    color: var(--muted-foreground);
                    text-decoration: line-through;
                }
                .playground-chip.disabled:hover {
                    opacity: 0.5;
                }
                .playground-chip .chip-time {
                    font-size: 11px;
                    font-weight: 400;
                    padding: 2px 8px;
                    border-radius: 5px;
                    background: oklch(from var(--primary) l c h / 0.15);
                    color: var(--primary);
                    letter-spacing: 0.04em;
                    font-variant-numeric: tabular-nums;
                }
                .playground-chip.disabled .chip-time {
                    background: var(--muted);
                    color: var(--muted-foreground);
                }
                @keyframes chipIn {
                    from { opacity: 0; transform: scale(0.9); }
                    to { opacity: 1; transform: scale(1); }
                }
                .playground-chip button {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    border: none;
                    background: transparent;
                    color: inherit;
                    cursor: pointer;
                    opacity: 0.6;
                    transition: opacity 0.15s, background 0.15s;
                    padding: 0;
                }
                .playground-chip button:hover {
                    opacity: 1;
                    background: oklch(from var(--primary) l c h / 0.2);
                }

                .playground-toolbar {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .playground-sort-trigger {
                    border: 0;
                    background: var(--primary);
                    color: var(--primary-foreground);
                    border-radius: 8px;
                    padding: 6px 14px;
                    height: auto;
                    width: fit-content;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    white-space: nowrap;
                    transition: all 0.2s;
                }
                .playground-sort-trigger:hover {
                    filter: brightness(1.1);
                }

                .playground-send-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 8px 18px;
                    border-radius: 8px;
                    border: none;
                    background: var(--primary);
                    color: var(--primary-foreground);
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: opacity 0.15s, transform 0.1s;
                    white-space: nowrap;
                }
                .playground-send-btn:hover:not(:disabled) {
                    opacity: 0.9;
                }
                .playground-send-btn:active:not(:disabled) {
                    transform: scale(0.97);
                }
                .playground-send-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .playground-results {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-3, 12px);
                    flex-shrink: 0;
                }

                .playground-result-card {
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    overflow: hidden;
                    background: var(--card, var(--background));
                    animation: resultIn 0.3s cubic-bezier(0.22, 1, 0.36, 1);
                }
                @keyframes resultIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .playground-result-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-2, 8px);
                    padding: var(--spacing-3, 12px) var(--spacing-4, 16px);
                    border-bottom: 1px solid var(--border);
                    background: oklch(from var(--sidebar) l c h / 0.6);
                    user-select: none;
                    transition: background 0.15s;
                }
                .playground-result-header:hover {
                    background: oklch(from var(--sidebar) l c h / 0.8);
                }

                .playground-retry-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    height: 28px;
                    border-radius: 6px;
                    border: 1px solid var(--border);
                    background: transparent;
                    color: var(--muted-foreground);
                    cursor: pointer;
                    transition: background 0.15s, color 0.15s, border-color 0.15s;
                    padding: 0;
                    flex-shrink: 0;
                }
                .playground-retry-btn:hover:not(:disabled) {
                    background: var(--accent);
                    color: var(--foreground);
                }
                .playground-retry-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .playground-rank {
                    font-size: 11px;
                    font-weight: 700;
                    min-width: 24px;
                    text-align: center;
                    border-radius: 4px;
                    padding: 1px 4px;
                    color: var(--muted-foreground);
                }
                .playground-rank.gold   { color: #f59e0b; }
                .playground-rank.silver { color: #94a3b8; }
                .playground-rank.bronze { color: #d97706; }

                .playground-result-body {
                    padding: var(--spacing-4, 16px);
                    color: var(--foreground);
                }

                .playground-code-block {
                    background: oklch(from var(--sidebar) calc(l - 0.04) c h);
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    padding: 14px 16px;
                    overflow-x: auto;
                    font-size: 12px;
                    line-height: 1.6;
                    font-family: var(--font-mono, 'JetBrains Mono', monospace);
                    color: var(--foreground);
                }

                .playground-prose {
                    color: var(--foreground);
                    line-height: 1.65;
                }

                .playground-running {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    background: oklch(from var(--primary) l c h / 0.06);
                    color: var(--primary);
                    font-size: 13px;
                    animation: pulse-glow 2s ease-in-out infinite;
                }
                @keyframes pulse-glow {
                    0%, 100% { box-shadow: 0 0 0 0 oklch(from var(--primary) l c h / 0); }
                    50% { box-shadow: 0 0 12px 2px oklch(from var(--primary) l c h / 0.1); }
                }

                .playground-empty {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 80px 40px;
                    color: var(--muted-foreground);
                    opacity: 0.6;
                }
            `}</style>

            {/* ── Collapsible input area ── */}
            <div className="playground-input-area">
                <div
                    className="playground-collapse-header"
                    onClick={() => setInputCollapsed(c => !c)}
                >
                    <div className="flex-1 min-w-0">
                        <h3 className="typo-label">Prompt</h3>
                        <p className="typo-caption mt-0.5 truncate text-muted-foreground">
                            {prompt.trim()
                                ? `${prompt.trim().slice(0, 80)}${prompt.trim().length > 80 ? '…' : ''}`
                                : 'Sin prompt definido'}
                            {selectedModels.length > 0 && ` · ${activeModels.length} modelo${activeModels.length !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {isRunning && <Loader2 size={14} className="animate-spin text-primary" />}
                        <ChevronRight
                            size={16}
                            className={cn(
                                "text-muted-foreground/50 transition-transform duration-200",
                                !inputCollapsed && "rotate-90"
                            )}
                        />
                    </div>
                </div>

                {!inputCollapsed && (
                    <div className="space-y-3">
                        <textarea
                            ref={textareaRef}
                            className="playground-textarea typo-body"
                            placeholder="Escribe tu prompt aquí…"
                            value={prompt}
                            onChange={handlePromptChange}
                            onKeyDown={handleKeyDown}
                            disabled={isRunning}
                        />

                        {/* Model chips */}
                        {selectedModels.length > 0 && (
                            <div className="playground-chips">
                                {orderedChips.map(apiName => {
                                    const time = modelTimes.get(apiName);
                                    return (
                                        <span
                                            key={apiName}
                                            className={`playground-chip${disabledModels.has(apiName) ? ' disabled' : ''}`}
                                            onClick={() => handleToggleModel(apiName)}
                                        >
                                            {modelDisplayNameMap.get(apiName) || apiName}
                                            {time != null && (
                                                <span className="chip-time">{(time / 1000).toFixed(1)}s</span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleRemoveModel(apiName); }}
                                                disabled={isRunning}
                                            >
                                                <X size={10} />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        {/* Toolbar: search + send */}
                        <div className="playground-toolbar">
                            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className="flex items-center gap-2 px-3 py-1.5 h-[34px] typo-select border border-border/40 rounded-lg bg-background hover:bg-muted/50 transition-colors text-muted-foreground w-[220px] justify-between disabled:opacity-50"
                                        disabled={isRunning}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Search size={14} className="shrink-0" />
                                            <span className="truncate">Buscar modelos...</span>
                                        </div>
                                        <ChevronDown size={14} className="shrink-0 opacity-50" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-[380px] p-0" sideOffset={8}>
                                    <Command shouldFilter={false}>
                                        <CommandInput 
                                            placeholder="Buscar modelos..." 
                                            value={modelSearch}
                                            onValueChange={setModelSearch}
                                        />
                                        <CommandList className="max-h-[300px]">
                                            {pickerModels.length === 0 ? (
                                                <div className="py-4 text-center typo-caption">Sin resultados</div>
                                            ) : (
                                                <CommandGroup>
                                                    {pickerModels.map(m => {
                                                        const isSelected = selectedModels.includes(m.apiName);
                                                        return (
                                                            <CommandItem
                                                                key={m.apiName}
                                                                value={m.apiName}
                                                                onSelect={() => handleTogglePickerModel(m.apiName)}
                                                                className={cn(
                                                                    "cursor-pointer",
                                                                    isSelected && "bg-primary/8"
                                                                )}
                                                            >
                                                                <span className="w-5 shrink-0 flex items-center justify-start">
                                                                    {isSelected && <Check size={14} className="text-primary" />}
                                                                </span>
                                                                <ModelItemContent 
                                                                    model={m}
                                                                    alias={aliases[m.apiName]}
                                                                />
                                                            </CommandItem>
                                                        );
                                                    })}
                                                </CommandGroup>
                                            )}
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            <div className="flex-1 flex items-center justify-start px-2">
                                <button
                                    type="button"
                                    className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-muted/50 transition-all text-muted-foreground cursor-pointer"
                                    title="Cargar test de Morph V3"
                                    onClick={() => {
                                        setPrompt("<instruction>I will add type hints</instruction>\n<code>def greet(name):\n    return \"Hello \" + name</code>\n<update>def greet(name: str) -> str</update>");
                                        setSelectedModels(["morph/morph-v3-large", "morph/morph-v3-fast"]);
                                    }}
                                    disabled={isRunning}
                                >
                                    <FlaskConical size={14} />
                                </button>
                            </div>
                            <button
                                type="button"
                                className="playground-send-btn"
                                onClick={handleReset}
                                disabled={isRunning}
                                style={{
                                    background: 'transparent',
                                    color: 'var(--muted-foreground)',
                                    border: '1px solid var(--border)',
                                    opacity: (selectedModels.length === 0 && results.length === 0 && !prompt) ? 0.3 : 1,
                                }}
                            >
                                <RotateCcw size={14} />
                                Reset
                            </button>
                            <button
                                type="button"
                                className="playground-send-btn"
                                onClick={isRunning ? handleCancel : handleSubmit}
                                disabled={!isRunning && (!prompt.trim() || activeModels.length === 0)}
                                style={isRunning ? { background: 'var(--destructive)', color: 'var(--destructive-foreground)' } : undefined}
                            >
                                {isRunning ? (
                                    <>
                                        <StopCircle size={14} />
                                        Cancelar
                                    </>
                                ) : (
                                    <>
                                        <SendHorizontal size={14} />
                                        Enviar ({activeModels.length})
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Sort controls (always visible when applicable) */}
            {runFinished && results.length > 1 && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="playground-sort-trigger typo-select"
                        >
                            <ArrowUpDown size={13} />
                            {sortLabels[sortMode]}
                            <ChevronDown size={13} className="opacity-60" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[220px]">
                        {(Object.entries(sortLabels) as [typeof sortMode, string][]).map(([key, label]) => (
                            <DropdownMenuItem
                                key={key}
                                className={cn(
                                    "cursor-pointer py-2.5",
                                    sortMode === key && "bg-primary/10 font-semibold"
                                )}
                                onSelect={() => setSortMode(key as any)}
                            >
                                {label}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            {/* ── Results ── */}
            <div className="playground-results">
                {displayResults.map((result, i) => {
                    const cardKey = `${result.modelApiName}-${i}`;
                    const isCollapsed = runFinished && !expandedCards.has(cardKey);
                    return (
                        <ResultCard
                            key={cardKey}
                            result={result}
                            collapsed={isCollapsed}
                            rank={runFinished ? i + 1 : undefined}
                            onToggle={() => toggleCard(cardKey)}
                            onRetry={runFinished && !isRunning ? () => handleRetryModel(result.modelApiName) : undefined}
                            isRetrying={retryingModel === result.modelApiName}
                        />
                    );
                })}

                {/* Running indicator */}
                {isRunning && currentModelIndex >= 0 && currentModelIndex < activeModels.length && (
                    <div className="playground-running">
                        <Loader2 size={16} className="animate-spin" />
                        <span>
                            Ejecutando <strong>{modelDisplayNameMap.get(activeModels[currentModelIndex]) || activeModels[currentModelIndex]}</strong>
                            {" "}({currentModelIndex + 1}/{activeModels.length})
                        </span>
                    </div>
                )}

                {/* Empty state */}
                {!isRunning && results.length === 0 && (
                    <div className="playground-empty">
                        <FlaskConical size={32} strokeWidth={1.5} />
                        <span className="text-sm">Selecciona modelos y envía un prompt para comparar</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Window shell (theme + chrome) ───────────────────────────────────────────

function PlaygroundWindowContent() {
    const { settings } = useSettings();

    // Apply primary colors from settings
    useEffect(() => {
        if (settings) {
            const lightColor = getColorById(settings.primaryColorLight || DEFAULT_LIGHT_COLOR);
            const darkColor = getColorById(settings.primaryColorDark || DEFAULT_DARK_COLOR);
            const lightFactor = (settings.primaryChromaLight ?? 100) / 100;
            const darkFactor = (settings.primaryChromaDark ?? 100) / 100;
            const root = document.documentElement;
            if (lightColor) root.style.setProperty("--primary-color-light", adjustChroma(lightColor.light, lightFactor));
            if (darkColor) root.style.setProperty("--primary-color-dark", adjustChroma(darkColor.dark, darkFactor));
        }
    }, [settings?.primaryColorLight, settings?.primaryColorDark, settings?.primaryChromaLight, settings?.primaryChromaDark]);

    useEffect(() => { document.title = "Playground de modelos"; }, []);

    return (
        <TooltipProvider>
            <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
                <TitleBar label="Playground de modelos" icon={FlaskConical} iconClass="text-primary" />
                <PlaygroundPanel />
            </div>
        </TooltipProvider>
    );
}

// ─── Reusable title bar ──────────────────────────────────────────────────────

function TitleBar({
    label,
    icon: Icon,
    iconClass = "text-muted-foreground",
}: {
    label: string;
    icon: React.ElementType;
    iconClass?: string;
}) {
    return (
        <div className="app-region-drag flex items-center justify-between px-3 h-9 bg-(--sidebar) border-b border-border shrink-0">
            <div className="flex items-center gap-2 no-app-region-drag">
                <Icon size={14} className={iconClass} />
                <span className="typo-button">{label}</span>
            </div>
            <WindowsControls className="no-app-region-drag pr-0 pointer-events-auto" buttonClassName="h-9" />
        </div>
    );
}

// ─── Root export ─────────────────────────────────────────────────────────────

export function PlaygroundWindowApp() {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <PlaygroundWindowContent />
                <Toaster richColors />
            </ThemeProvider>
        </QueryClientProvider>
    );
}
