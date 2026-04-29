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
    Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import { ipc, type LanguageModel } from "@/ipc/types";
import { useModelAliases } from "@/hooks/useModelAliases";

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

function ResultCard({ result, collapsed, rank, onToggle }: {
    result: ModelResult;
    collapsed: boolean;
    rank?: number;
    onToggle: () => void;
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
    const { aliases } = useModelAliases();
    const resultsRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

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

    // Filter models by search keyword
    const searchResults = useMemo(() => {
        const q = modelSearch.trim().toLowerCase();
        if (!q) return [];
        return allModels.filter(m => {
            const display = (aliases[m.apiName] || m.displayName).toLowerCase();
            const api = m.apiName.toLowerCase();
            return (display.includes(q) || api.includes(q)) && !selectedModels.includes(m.apiName);
        });
    }, [modelSearch, allModels, aliases, selectedModels]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
                searchRef.current && !searchRef.current.contains(e.target as Node)
            ) {
                setSearchOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Add a single model
    const handleAddModel = useCallback((apiName: string) => {
        if (!selectedModels.includes(apiName)) {
            setSelectedModels(prev => [...prev, apiName]);
        }
    }, [selectedModels]);

    // Bulk add all search results
    const handleAddAllResults = useCallback(() => {
        const toAdd = searchResults.map(m => m.apiName).filter(a => !selectedModels.includes(a));
        if (toAdd.length > 0) {
            setSelectedModels(prev => [...prev, ...toAdd]);
        }
        setModelSearch("");
        setSearchOpen(false);
    }, [searchResults, selectedModels]);

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
        return [...results].sort((a, b) => a.durationMs - b.durationMs);
    }, [results, runFinished]);

    // Run the prompt sequentially against active models only
    const handleSubmit = useCallback(async () => {
        if (!prompt.trim() || activeModels.length === 0 || isRunning) return;

        setIsRunning(true);
        setRunFinished(false);
        setResults([]);
        setModelTimes(new Map());
        setExpandedCards(new Set());
        setCurrentModelIndex(0);

        for (let i = 0; i < activeModels.length; i++) {
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

            // Auto-scroll to bottom
            setTimeout(() => {
                resultsRef.current?.scrollTo({
                    top: resultsRef.current.scrollHeight,
                    behavior: "smooth",
                });
            }, 50);
        }

        // Run finished: collapse all, sort, scroll to top
        setRunFinished(true);
        setIsRunning(false);
        setCurrentModelIndex(-1);
        setTimeout(() => {
            resultsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        }, 100);
    }, [prompt, activeModels, isRunning, modelDisplayNameMap]);

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
        ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
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
                    gap: 0;
                }

                .playground-input-area {
                    padding: 16px 20px;
                    background: var(--sidebar);
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    flex-shrink: 0;
                }

                .playground-textarea {
                    width: 100%;
                    min-height: 80px;
                    max-height: 240px;
                    resize: none;
                    overflow: hidden;
                    border: 1px solid var(--border);
                    border-radius: 10px;
                    padding: 12px 14px;
                    background: var(--background);
                    color: var(--foreground);
                    font-size: 13px;
                    line-height: 1.5;
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
                    gap: 4px;
                    padding: 4px 10px;
                    border-radius: 20px;
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
                    font-size: 10px;
                    font-weight: 600;
                    opacity: 0.7;
                    margin-left: 2px;
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

                .playground-search-wrap {
                    position: relative;
                    flex: 1;
                    max-width: 320px;
                }
                .playground-search-input {
                    width: 100%;
                    height: 32px;
                    padding: 0 10px 0 30px;
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    background: var(--background);
                    color: var(--foreground);
                    font-size: 12px;
                    outline: none;
                    transition: border-color 0.15s;
                }
                .playground-search-input:focus {
                    border-color: var(--primary);
                }
                .playground-search-icon {
                    position: absolute;
                    left: 9px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: var(--muted-foreground);
                    pointer-events: none;
                }
                .playground-search-dropdown {
                    position: absolute;
                    top: calc(100% + 4px);
                    left: 0;
                    right: 0;
                    max-height: 240px;
                    overflow-y: auto;
                    border: 1px solid var(--border);
                    border-radius: 10px;
                    background: var(--popover, var(--background));
                    box-shadow: 0 8px 30px rgba(0,0,0,0.18);
                    z-index: 50;
                    padding: 4px;
                }
                .playground-search-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 10px;
                    border-radius: 6px;
                    font-size: 12px;
                    color: var(--foreground);
                    cursor: pointer;
                    transition: background 0.1s;
                }
                .playground-search-item:hover {
                    background: var(--accent);
                }
                .playground-search-item .api-name {
                    color: var(--muted-foreground);
                    font-size: 10px;
                    margin-left: auto;
                    max-width: 40%;
                    text-align: right;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .playground-search-bulk {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 7px 10px;
                    margin: 2px 0;
                    border-radius: 6px;
                    border: none;
                    background: oklch(from var(--primary) l c h / 0.1);
                    color: var(--primary);
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    width: 100%;
                    transition: background 0.15s;
                }
                .playground-search-bulk:hover {
                    background: oklch(from var(--primary) l c h / 0.18);
                }

                .playground-toolbar {
                    display: flex;
                    align-items: center;
                    gap: 8px;
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
                    padding: 16px 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
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
                    gap: 8px;
                    padding: 12px 16px;
                    border-bottom: 1px solid var(--border);
                    background: oklch(from var(--sidebar) l c h / 0.6);
                    user-select: none;
                    transition: background 0.15s;
                }
                .playground-result-header:hover {
                    background: oklch(from var(--sidebar) l c h / 0.8);
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
                    padding: 16px;
                    font-size: 13px;
                    line-height: 1.65;
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

            {/* ── Input area ── */}
            <div className="playground-input-area">
                <textarea
                    ref={textareaRef}
                    className="playground-textarea"
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
                    <div className="playground-search-wrap">
                        <Search size={13} className="playground-search-icon" />
                        <input
                            ref={searchRef}
                            type="text"
                            className="playground-search-input"
                            placeholder="Buscar modelos…"
                            value={modelSearch}
                            onChange={(e) => { setModelSearch(e.target.value); setSearchOpen(true); }}
                            onFocus={() => setSearchOpen(true)}
                            disabled={isRunning}
                        />
                        {searchOpen && modelSearch.trim() && searchResults.length > 0 && (
                            <div ref={dropdownRef} className="playground-search-dropdown">
                                <button
                                    type="button"
                                    className="playground-search-bulk"
                                    onClick={handleAddAllResults}
                                >
                                    <Plus size={12} />
                                    Añadir todos ({searchResults.length})
                                </button>
                                {searchResults.map(m => (
                                    <div
                                        key={m.apiName}
                                        className="playground-search-item"
                                        onClick={() => { handleAddModel(m.apiName); setModelSearch(""); setSearchOpen(false); }}
                                    >
                                        <span className="truncate">{aliases[m.apiName] || m.displayName}</span>
                                        <span className="api-name">{m.apiName.split('/').pop()}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {searchOpen && modelSearch.trim() && searchResults.length === 0 && (
                            <div ref={dropdownRef} className="playground-search-dropdown">
                                <div className="playground-search-item" style={{ opacity: 0.5, cursor: 'default' }}>
                                    Sin resultados
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex-1" />
                    <button
                        type="button"
                        className="playground-send-btn"
                        onClick={handleSubmit}
                        disabled={isRunning || !prompt.trim() || activeModels.length === 0}
                    >
                        {isRunning ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                Ejecutando…
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

    useEffect(() => { document.title = "Playground"; }, []);

    return (
        <TooltipProvider>
            <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
                <TitleBar label="Playground" icon={FlaskConical} iconClass="text-primary" />
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
