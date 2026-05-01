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
    ChevronsDownUp,
    Save,
    Trash2,
    FolderOpen,
    Pencil,
    Merge,
    Download,
    FileText,
    Database,
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { usePlaygroundPresets } from "@/hooks/usePlaygroundPresets";
import { matchesModelSearch } from "@/lib/modelSearch";

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
    timeout?: boolean;
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

const TYPE_LABELS: Record<string, string> = {
    fact: "Hecho",
    preference: "Preferencia",
    issue: "Problema",
    episode: "Episodio",
    decision: "Decisión",
};

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

// ─── Memory count helper ─────────────────────────────────────────────────────

function getMemoryCount(text: string): number | null {
    try {
        let raw = text.trim();
        raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
        const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
        if (fenceMatch) raw = fenceMatch[1].trim();
        if (!raw.startsWith("{") && !raw.startsWith("[")) {
            const objMatch = raw.match(/(\{[\s\S]*\})/);
            const arrMatch = raw.match(/(\[[\s\S]*\])/);
            raw = objMatch?.[1] || arrMatch?.[1] || raw;
        }
        const parsed = JSON.parse(raw);
        const operations = parsed.operations || parsed.memories || (Array.isArray(parsed) ? parsed : null);
        if (!operations || !Array.isArray(operations)) return null;
        return operations.length;
    } catch {
        return null;
    }
}

// ─── Memory result card (for Memorias view mode) ─────────────────────────────

function MemoryResponseContent({ text }: { text: string }) {
    try {
        let raw = text.trim();

        // Strip thinking/reasoning blocks
        raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();

        // Strip markdown code fences (```json ... ``` or ``` ... ```)
        const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
        if (fenceMatch) raw = fenceMatch[1].trim();

        // Try to find a JSON object if the raw text has leading/trailing prose
        if (!raw.startsWith("{") && !raw.startsWith("[")) {
            const objMatch = raw.match(/(\{[\s\S]*\})/);
            const arrMatch = raw.match(/(\[[\s\S]*\])/);
            raw = objMatch?.[1] || arrMatch?.[1] || raw;
        }

        const parsed = JSON.parse(raw);
        const operations = parsed.operations || parsed.memories || (Array.isArray(parsed) ? parsed : null);
        if (!operations || !Array.isArray(operations) || operations.length === 0) {
            return <ResponseContent text={text} />;
        }

        const normalizeImp = (imp: unknown): number => {
            if (typeof imp !== "number") return 50;
            return imp > 1 ? imp : Math.round(imp * 100);
        };

        return (
            <div className="space-y-1">
                {operations.map((op: any, i: number) => (
                    <div
                        key={i}
                        className="border rounded-xl px-4 py-3 transition-all hover:bg-muted/30 border-border"
                    >
                        <div className="flex items-start gap-3">
                            <span className="shrink-0 px-2 py-0.5 typo-micro rounded-md bg-muted text-muted-foreground border border-border">
                                {TYPE_LABELS[op.type] || op.type || "?"}
                            </span>
                            <p className="flex-1 typo-body leading-relaxed min-w-0">
                                {op.content || "—"}
                            </p>
                        </div>
                        <div className="flex items-center gap-3 mt-2 typo-micro text-muted-foreground">
                            {op.key && (
                                <span className="typo-mono-xs bg-muted/50 px-1.5 py-0.5 rounded">key:{op.key}</span>
                            )}
                            <span>imp:{normalizeImp(op.importance)}</span>
                            {op.action && <span className="text-primary/70">{op.action}</span>}
                        </div>
                    </div>
                ))}
            </div>
        );
    } catch {
        return <ResponseContent text={text} />;
    }
}

// ─── Model chip with right-click preset menu ─────────────────────────────────

function ModelChipWithPresets({ apiName, displayName, time, disabled, isRunning, presets, onToggle, onRemove, onAddToPreset }: {
    apiName: string;
    displayName: string;
    time?: number;
    disabled: boolean;
    isRunning: boolean;
    presets: Array<{ name: string; models: string[] }>;
    onToggle: () => void;
    onRemove: () => void;
    onAddToPreset: (presetName: string) => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
                <span
                    className={`playground-chip${disabled ? ' disabled' : ''}`}
                    onPointerDown={(e) => {
                        // Prevent Radix from opening the dropdown on left-click
                        if (e.button === 0) e.preventDefault();
                    }}
                    onClick={(e) => {
                        e.preventDefault();
                        onToggle();
                    }}
                    onContextMenu={(e) => {
                        if (presets.length > 0) {
                            e.preventDefault();
                            setMenuOpen(true);
                        }
                    }}
                >
                    {displayName}
                    {time != null && (
                        <span className="chip-time">{(time / 1000).toFixed(1)}s</span>
                    )}
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                        disabled={isRunning}
                    >
                        <X size={10} />
                    </button>
                </span>
            </DropdownMenuTrigger>
            {presets.length > 0 && (
                <DropdownMenuContent align="start" className="min-w-[180px]">
                    <div className="px-3 py-1.5 typo-micro text-muted-foreground opacity-60 uppercase tracking-wider">
                        Añadir a preset
                    </div>
                    {presets.map(set => {
                        const alreadyIn = set.models.includes(apiName);
                        return (
                            <DropdownMenuItem
                                key={set.name}
                                className={cn(
                                    "cursor-pointer py-2",
                                    alreadyIn && "opacity-40"
                                )}
                                disabled={alreadyIn}
                                onSelect={() => onAddToPreset(set.name)}
                            >
                                <Plus size={12} className="mr-2 opacity-60" />
                                <span className="truncate">{set.name}</span>
                                {alreadyIn && (
                                    <Check size={12} className="ml-auto opacity-40" />
                                )}
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            )}
        </DropdownMenu>
    );
}

// ─── Result card (collapsible) ────────────────────────────────────────────────

function ResultCard({ result, collapsed, rank, onToggle, onRetry, isRetrying, viewMode, exportChecked, onExportToggle }: {
    result: ModelResult;
    collapsed: boolean;
    rank?: number;
    onToggle: () => void;
    onRetry?: () => void;
    isRetrying?: boolean;
    viewMode: 'raw' | 'memorias';
    exportChecked?: boolean;
    onExportToggle?: () => void;
}) {
    const isTimeout = result.timeout;
    const memoryCount = !result.error ? getMemoryCount(result.text) : null;
    const canExpand = !isTimeout;

    return (
        <div className={cn("playground-result-card", isTimeout && "border-destructive/30 bg-destructive/5")}>
            <div
                className={cn("playground-result-header", !canExpand && "cursor-default")}
                onClick={canExpand ? onToggle : undefined}
                style={{ cursor: canExpand ? 'pointer' : 'default' }}
            >
                {onExportToggle != null && (
                    <input
                        type="checkbox"
                        checked={exportChecked}
                        onChange={(e) => { e.stopPropagation(); onExportToggle(); }}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                    />
                )}
                {rank != null && (
                    <span className={`playground-rank ${rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : ''}`}>
                        #{rank}
                    </span>
                )}
                <h3 className={cn("typo-label !text-sm font-semibold truncate flex-1", isTimeout && "text-destructive")}>
                    {result.modelDisplayName}
                </h3>
                <div className="flex items-center gap-3 shrink-0">
                    {/* Time */}
                    <span className={cn("flex items-center gap-1 typo-caption", isTimeout ? "text-destructive" : "text-muted-foreground")}>
                        <Clock size={12} className="opacity-60" />
                        {(result.durationMs / 1000).toFixed(2)}s
                    </span>
                    {/* Memory count (memorias mode) */}
                    {viewMode === 'memorias' && memoryCount != null && (
                        <span className="flex items-center gap-1 typo-caption text-muted-foreground">
                            <Database size={12} className="opacity-60" />
                            {memoryCount}
                        </span>
                    )}
                    {canExpand && (
                        <ChevronDown
                            size={14}
                            className="text-muted-foreground transition-transform duration-200"
                            style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)' }}
                        />
                    )}
                    {isTimeout && (
                        <AlertCircle size={14} className="text-destructive" />
                    )}
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
            {canExpand && !collapsed && (
                <div className="playground-result-body">
                    {result.error ? (
                        <div className="flex items-center gap-2 text-destructive">
                            <AlertCircle size={14} />
                            <span className="typo-body text-sm">{result.text}</span>
                        </div>
                    ) : viewMode === 'memorias' ? (
                        <MemoryResponseContent text={result.text} />
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
    const { settings, updateSettings } = useSettings();
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
    const [viewMode, setViewMode] = useState<'memorias' | 'raw'>('memorias');
    const [morphActive, setMorphActive] = useState(false);
    const { aliases } = useModelAliases();
    const resultsRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const cancelledRef = useRef(false);
    const skipCurrentRef = useRef(false);
    const userScrolledRef = useRef(false);
    const [inputCollapsed, setInputCollapsed] = useState(false);
    // Snapshot of selectedModels at the moment the popover closes — used for sorting
    const [pickerSnapshot, setPickerSnapshot] = useState<string[]>([]);
    const [autoCollapse, setAutoCollapse] = useState(true);
    // Preset management
    const presets = usePlaygroundPresets();
    const modelSets = presets.modelPresets;
    const [activePresetName, setActivePresetName] = useState<string | null>(null);
    const [presetMenuOpen, setPresetMenuOpen] = useState(false);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [saveAsName, setSaveAsName] = useState("");
    const [saveMode, setSaveMode] = useState<'new' | 'update'>('new');
    const [pendingDeletePreset, setPendingDeletePreset] = useState<string | null>(null);
    const [pendingRenamePreset, setPendingRenamePreset] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [exportSelection, setExportSelection] = useState<Set<string>>(new Set());
    // Prompt presets
    const [activePromptPreset, setActivePromptPreset] = useState<string | null>(null);
    const [promptPresetMenuOpen, setPromptPresetMenuOpen] = useState(false);
    const [promptSaveDialogOpen, setPromptSaveDialogOpen] = useState(false);
    const [promptSaveName, setPromptSaveName] = useState("");
    const [pendingDeletePromptPreset, setPendingDeletePromptPreset] = useState<string | null>(null);
    const [pendingRenamePromptPreset, setPendingRenamePromptPreset] = useState<string | null>(null);
    const [promptRenameValue, setPromptRenameValue] = useState("");

    // One-shot migration from settings JSON → user_preferences DB
    useEffect(() => {
        if (!presets.loaded || !settings) return;
        const legacy = settings.playgroundModelSets as any;
        if (legacy && Array.isArray(legacy) && legacy.length > 0 && presets.modelPresets.length === 0) {
            presets.migrateFromSettings(legacy).then(migrated => {
                if (migrated) {
                    // Clean up settings JSON
                    const { playgroundModelSets, ...rest } = settings as any;
                    updateSettings(rest);
                    console.log('[Playground] Migrated model presets to DB, cleaned settings');
                }
            });
        }
    }, [presets.loaded]);

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
    // Uses pickerSnapshot (frozen at popover open) so the list doesn't jump while selecting
    const pickerModels = useMemo(() => {
        const filtered = allModels.filter(m => {
            if (!modelSearch.trim()) return true;
            return matchesModelSearch(
                modelSearch,
                aliases[m.apiName] || m.displayName,
                m.apiName,
            );
        });

        // Sort: selected (from snapshot) first, then alphabetical — stable while popover is open
        const snapshotSet = new Set(pickerSnapshot);
        return filtered.sort((a, b) => {
            const aSelected = snapshotSet.has(a.apiName);
            const bSelected = snapshotSet.has(b.apiName);
            if (aSelected && !bSelected) return -1;
            if (!aSelected && bSelected) return 1;
            const nameA = aliases[a.apiName] || a.displayName;
            const nameB = aliases[b.apiName] || b.displayName;
            return nameA.localeCompare(nameB);
        });
    }, [modelSearch, allModels, aliases, pickerSnapshot]);

    // When the popover opens, snapshot the current selection for stable sorting
    const handleSearchOpenChange = useCallback((open: boolean) => {
        if (open) {
            setPickerSnapshot([...selectedModels]);
        }
        setSearchOpen(open);
    }, [selectedModels]);

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
        'size-asc': viewMode === 'memorias' ? 'Menos memorias' : 'Respuesta más corta',
        'size-desc': viewMode === 'memorias' ? 'Más memorias' : 'Respuesta más larga',
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
        setPickerSnapshot([]);
        setCurrentModelIndex(-1);
        setRetryingModel(null);
        setInputCollapsed(false);
        setMorphActive(false);
        setPrompt("");
        setActivePresetName(null);
        setActivePromptPreset(null);
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
        skipCurrentRef.current = false;
        userScrolledRef.current = false;
        setInputCollapsed(true);

        const MODEL_TIMEOUT_MS = 15_000;

        for (let i = 0; i < activeModels.length; i++) {
            if (cancelledRef.current) break;

            setCurrentModelIndex(i);
            skipCurrentRef.current = false;
            const modelApiName = activeModels[i];
            const modelDisplayName = modelDisplayNameMap.get(modelApiName) || modelApiName;

            const startTime = performance.now();
            let durationMs = 0;
            try {
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error("__TIMEOUT__")), MODEL_TIMEOUT_MS);
                });

                const response = await Promise.race([
                    ipc.misc.playgroundCompletion({
                        model: modelApiName,
                        prompt: prompt.trim(),
                    }),
                    timeoutPromise,
                ]);

                if (cancelledRef.current || skipCurrentRef.current) {
                    if (skipCurrentRef.current) {
                        durationMs = performance.now() - startTime;
                        setResults(prev => [...prev, {
                            modelApiName,
                            modelDisplayName,
                            text: "Modelo omitido por el usuario",
                            durationMs,
                            error: true,
                        }]);
                        setModelTimes(prev => new Map(prev).set(modelApiName, durationMs));
                        continue;
                    }
                    break;
                }

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
                const isTimeout = error?.message === "__TIMEOUT__";
                setResults(prev => [...prev, {
                    modelApiName,
                    modelDisplayName,
                    text: isTimeout ? "Tiempo límite superado (15s)" : (error?.message || String(error)),
                    durationMs,
                    error: true,
                    timeout: isTimeout,
                }]);
            }

            // Update chip times after each model completes
            setModelTimes(prev => new Map(prev).set(modelApiName, durationMs));

            // Auto-collapse: when ON, collapse ALL cards (never expand)
            // When OFF, collapse previous and expand current
            if (autoCollapse) {
                setExpandedCards(new Set());
            } else {
                if (i > 0) {
                    const prevApiName = activeModels[i - 1];
                    const prevKey = `${prevApiName}-${i - 1}`;
                    setExpandedCards(prev => { const s = new Set(prev); s.delete(prevKey); return s; });
                }
                const thisKey = `${modelApiName}-${i}`;
                setExpandedCards(prev => new Set(prev).add(thisKey));
            }

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
    }, [prompt, activeModels, isRunning, modelDisplayNameMap, autoCollapse]);

    // Cancel in-flight request and stop the loop
    const handleCancel = useCallback(async () => {
        cancelledRef.current = true;
        try {
            await ipc.misc.playgroundCancel({});
        } catch { /* ignore */ }
    }, []);

    // Skip the current model (continue to next)
    const handleSkipCurrent = useCallback(async () => {
        skipCurrentRef.current = true;
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

    // Update prompt (resize is now manual via CSS resize handle)
    const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPrompt(e.target.value);
    }, []);

    // ── Model preset management (via DB) ──────────────────────────────────
    const handleSavePreset = useCallback(async (name: string) => {
        if (!name.trim() || selectedModels.length === 0) return;
        await presets.saveModelPreset(name.trim(), [...selectedModels]);
        setActivePresetName(name.trim());
        setSaveDialogOpen(false);
        setSaveAsName("");
    }, [selectedModels, presets]);

    const handleLoadPreset = useCallback((name: string) => {
        const preset = modelSets.find(s => s.name === name);
        if (!preset) return;
        setSelectedModels(preset.models);
        setDisabledModels(new Set());
        setActivePresetName(name);
    }, [modelSets]);

    const handleDeletePreset = useCallback(async (name: string) => {
        await presets.deleteModelPreset(name);
        if (activePresetName === name) setActivePresetName(null);
    }, [presets, activePresetName]);

    const handleRenamePreset = useCallback(async (oldName: string, newName: string) => {
        if (!newName.trim() || newName.trim() === oldName) return;
        await presets.renameModelPreset(oldName, newName.trim());
        if (activePresetName === oldName) setActivePresetName(newName.trim());
        setPendingRenamePreset(null);
        setRenameValue("");
    }, [presets, activePresetName]);

    const handleMergePreset = useCallback((name: string) => {
        const preset = modelSets.find(s => s.name === name);
        if (!preset) return;
        const merged = [...new Set([...selectedModels, ...preset.models])];
        setSelectedModels(merged);
        setDisabledModels(new Set());
        setActivePresetName(name);
    }, [modelSets, selectedModels]);

    // Add a single model to an existing preset (merge)
    const handleAddModelToPreset = useCallback(async (modelApiName: string, presetName: string) => {
        const preset = modelSets.find(s => s.name === presetName);
        if (!preset) return;
        if (preset.models.includes(modelApiName)) return; // already in preset
        const merged = [...preset.models, modelApiName];
        await presets.saveModelPreset(presetName, merged);
    }, [modelSets, presets]);

    const handleExportMarkdown = useCallback(() => {
        const toExport = displayResults.filter(r => exportSelection.has(`${r.modelApiName}`));
        if (toExport.length === 0) return;

        const lines: string[] = [
            `# Playground — Comparativa de modelos`,
            ``,
            `**Fecha:** ${new Date().toLocaleString("es-ES")}`,
            `**Prompt:**`,
            '```',
            prompt,
            '```',
            `**Modo:** ${viewMode === 'memorias' ? 'Memorias' : 'Raw'}`,
            `**Orden:** ${sortMode}`,
            ``,
            `---`,
            ``,
        ];

        toExport.forEach((r, idx) => {
            lines.push(`## ${idx + 1}. ${r.modelDisplayName}`);
            lines.push(``);
            lines.push(`| Métrica | Valor |`);
            lines.push(`|---|---|`);
            lines.push(`| Tiempo | ${(r.durationMs / 1000).toFixed(2)}s |`);
            if (r.inputTokens != null) lines.push(`| Tokens entrada | ${r.inputTokens} |`);
            if (r.outputTokens != null) lines.push(`| Tokens salida | ${r.outputTokens} |`);
            lines.push(`| Caracteres | ${r.text.length} |`);
            lines.push(``);
            if (r.error) {
                lines.push(`> ⚠️ Error: ${r.text}`);
            } else {
                lines.push('```');
                lines.push(r.text);
                lines.push('```');
            }
            lines.push(``);
            lines.push(`---`);
            lines.push(``);
        });

        const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `playground_${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
        setExportSelection(new Set());
    }, [displayResults, exportSelection, prompt, viewMode, sortMode]);

    // Detect if current selection differs from active preset
    const presetIsDirty = useMemo(() => {
        if (!activePresetName) return false;
        const preset = modelSets.find(s => s.name === activePresetName);
        if (!preset) return false;
        if (preset.models.length !== selectedModels.length) return true;
        const set = new Set(preset.models);
        return selectedModels.some(m => !set.has(m));
    }, [activePresetName, selectedModels, modelSets]);

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
                    resize: vertical;
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

            {/* ── Row 1: Model search + chips ── */}
            <div className="playground-input-area">
                <div className="flex items-center gap-2 flex-wrap">
                    <Popover open={searchOpen} onOpenChange={handleSearchOpenChange}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className="flex items-center gap-2 px-3 py-1.5 h-[34px] typo-select border border-border/40 rounded-lg bg-background hover:bg-muted/50 transition-colors text-muted-foreground w-[220px] justify-between disabled:opacity-50 shrink-0"
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
                                                const fmtTokens = (n: number | undefined) => {
                                                    if (n === undefined) return "—";
                                                    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
                                                    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
                                                    return n.toString();
                                                };
                                                const fmtPrice = (p: string | undefined) => {
                                                    if (!p) return "—";
                                                    const v = parseFloat(p);
                                                    if (isNaN(v)) return "—";
                                                    if (v === 0) return "gratis";
                                                    const pm = v * 1_000_000;
                                                    return `$${pm < 0.01 ? pm.toFixed(4) : pm.toFixed(2)}`;
                                                };
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
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-medium truncate">
                                                                {aliases[m.apiName] || m.displayName}
                                                            </div>
                                                            <div className="typo-caption truncate mt-0.5 flex items-center gap-2 opacity-70">
                                                                <span>Contexto: {fmtTokens(m.contextWindow)}</span>
                                                                <span className="opacity-30">·</span>
                                                                <span>Salida: {fmtTokens(m.maxOutputTokens)}</span>
                                                            </div>
                                                            {(m.pricingInput || m.pricingOutput) && (
                                                                <div className="typo-caption truncate mt-0.5 flex items-center gap-2 opacity-50">
                                                                    <span>In</span>
                                                                    <span className="tabular-nums">{fmtPrice(m.pricingInput)}</span>
                                                                    <span className="opacity-40">·</span>
                                                                    <span>Out</span>
                                                                    <span className="tabular-nums">{fmtPrice(m.pricingOutput)}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </CommandItem>
                                                );
                                            })}
                                        </CommandGroup>
                                    )}
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                    {/* Model chips inline with search */}
                    {orderedChips.map(apiName => {
                        const time = modelTimes.get(apiName);
                        return (
                            <ModelChipWithPresets
                                key={apiName}
                                apiName={apiName}
                                displayName={modelDisplayNameMap.get(apiName) || apiName}
                                time={time}
                                disabled={disabledModels.has(apiName)}
                                isRunning={isRunning}
                                presets={modelSets}
                                onToggle={() => handleToggleModel(apiName)}
                                onRemove={() => handleRemoveModel(apiName)}
                                onAddToPreset={(presetName) => handleAddModelToPreset(apiName, presetName)}
                            />
                        );
                    })}
                </div>

                {/* ── Preset bar ── */}
                <div className="playground-toolbar" style={{ borderTop: 'none', paddingTop: 0 }}>
                    {/* Preset loader dropdown */}
                    <DropdownMenu open={presetMenuOpen} onOpenChange={setPresetMenuOpen}>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 h-[34px] typo-select border rounded-lg transition-colors",
                                    activePresetName
                                        ? "border-primary/30 bg-primary/5 text-primary"
                                        : "border-border/40 bg-background hover:bg-muted/50 text-muted-foreground"
                                )}
                                disabled={isRunning}
                            >
                                <FolderOpen size={14} className="shrink-0" />
                                <span className="truncate max-w-[160px]">
                                    {activePresetName || "Presets"}
                                </span>
                                {presetIsDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                                <ChevronDown size={13} className="opacity-50 shrink-0" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-[520px]">
                            {/* Deselect option */}
                            {activePresetName && (
                                <>
                                    <DropdownMenuItem
                                        className="cursor-pointer py-2 text-muted-foreground"
                                        onSelect={() => {
                                            setActivePresetName(null);
                                            setPresetMenuOpen(false);
                                        }}
                                    >
                                        <X size={13} className="mr-2 opacity-60" />
                                        Ninguno
                                    </DropdownMenuItem>
                                    <div className="h-px bg-border/50 my-1" />
                                </>
                            )}
                            {modelSets.length === 0 ? (
                                <div className="py-3 px-4 text-center typo-caption text-muted-foreground">
                                    Sin presets guardados
                                </div>
                            ) : (
                                modelSets.map(set => (
                                    <DropdownMenuItem
                                        key={set.name}
                                        className={cn(
                                            "cursor-pointer py-2.5 flex items-center justify-between gap-2",
                                            activePresetName === set.name && "bg-primary/10 font-semibold"
                                        )}
                                        onSelect={(e) => {
                                            e.preventDefault();
                                            handleLoadPreset(set.name);
                                            setPresetMenuOpen(false);
                                        }}
                                    >
                                        <div className="flex flex-col min-w-0">
                                            <span className="truncate">{set.name}</span>
                                            <span className="typo-micro text-muted-foreground truncate">
                                                {set.models.length} modelo{set.models.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                            <button
                                                type="button"
                                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPendingRenamePreset(set.name);
                                                    setRenameValue(set.name);
                                                    setPresetMenuOpen(false);
                                                }}
                                                title="Renombrar preset"
                                            >
                                                <Pencil size={11} />
                                            </button>
                                            <button
                                                type="button"
                                                className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleMergePreset(set.name);
                                                    setPresetMenuOpen(false);
                                                }}
                                                title={`Fusionar "${set.name}" con la selección actual`}
                                            >
                                                <Merge size={11} />
                                            </button>
                                            <button
                                                type="button"
                                                className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSavePreset(set.name);
                                                    setPresetMenuOpen(false);
                                                }}
                                                title={`Sobreescribir "${set.name}" con la selección actual`}
                                            >
                                                <Save size={11} />
                                            </button>
                                            <button
                                                type="button"
                                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPendingDeletePreset(set.name);
                                                    setPresetMenuOpen(false);
                                                }}
                                                title="Eliminar preset"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </DropdownMenuItem>
                                ))
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Delete preset confirmation dialog */}
                    <AlertDialog open={!!pendingDeletePreset} onOpenChange={(open) => { if (!open) setPendingDeletePreset(null); }}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Eliminar preset</AlertDialogTitle>
                                <AlertDialogDescription>
                                    ¿Estás seguro de que quieres eliminar "{pendingDeletePreset}"? Esta acción no se puede deshacer.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => {
                                        if (pendingDeletePreset) handleDeletePreset(pendingDeletePreset);
                                        setPendingDeletePreset(null);
                                    }}
                                >
                                    Eliminar
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    {/* Rename preset dialog */}
                    <AlertDialog open={!!pendingRenamePreset} onOpenChange={(open) => { if (!open) { setPendingRenamePreset(null); setRenameValue(""); } }}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Renombrar preset</AlertDialogTitle>
                                <AlertDialogDescription asChild>
                                    <div className="space-y-3">
                                        <p>Escribe el nuevo nombre para "{pendingRenamePreset}":</p>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-1.5 typo-body text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                                            value={renameValue}
                                            onChange={e => setRenameValue(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === "Enter" && renameValue.trim() && pendingRenamePreset) {
                                                    handleRenamePreset(pendingRenamePreset, renameValue);
                                                }
                                            }}
                                            autoFocus
                                        />
                                    </div>
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                    disabled={!renameValue.trim() || renameValue.trim() === pendingRenamePreset}
                                    onClick={() => {
                                        if (pendingRenamePreset) handleRenamePreset(pendingRenamePreset, renameValue);
                                    }}
                                >
                                    Renombrar
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    {/* Save / Update buttons */}
                    {selectedModels.length > 0 && (
                        <>
                            {/* Update current preset (only if dirty) */}
                            {activePresetName && presetIsDirty && (
                                <button
                                    type="button"
                                    className="flex items-center gap-1.5 px-3 py-1.5 h-[34px] typo-select border border-primary/30 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors text-primary"
                                    onClick={() => handleSavePreset(activePresetName)}
                                    title={`Actualizar "${activePresetName}"`}
                                >
                                    <Pencil size={13} />
                                    Actualizar
                                </button>
                            )}
                            {/* Save as new */}
                            <Popover open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className="flex items-center gap-1.5 px-3 py-1.5 h-[34px] typo-select border border-border/40 rounded-lg bg-background hover:bg-muted/50 transition-colors text-muted-foreground"
                                        title="Guardar selección como preset"
                                    >
                                        <Save size={13} />
                                        {activePresetName ? "Guardar como…" : "Guardar"}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-[280px] p-3" sideOffset={8}>
                                    <div className="space-y-2">
                                        <p className="typo-caption font-medium">Nombre del preset</p>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-1.5 typo-body text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                            placeholder="Ej: Modelos benchmark..."
                                            value={saveAsName}
                                            onChange={e => setSaveAsName(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === "Enter" && saveAsName.trim()) {
                                                    handleSavePreset(saveAsName);
                                                }
                                            }}
                                            autoFocus
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button
                                                type="button"
                                                className="px-3 py-1.5 typo-select text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                                                onClick={() => { setSaveDialogOpen(false); setSaveAsName(""); }}
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                className="px-3 py-1.5 typo-select bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
                                                disabled={!saveAsName.trim()}
                                                onClick={() => handleSavePreset(saveAsName)}
                                            >
                                                Guardar
                                            </button>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </>
                    )}
                </div>

                {/* ── Row 2: Options bar ── */}
                <div className="playground-toolbar">
                    {/* Sort selector */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="flex items-center gap-2 px-3 py-1.5 h-[34px] typo-select border border-border/40 rounded-lg bg-background hover:bg-muted/50 transition-colors text-muted-foreground"
                            >
                                <ArrowUpDown size={13} />
                                <span className="truncate">{sortLabels[sortMode]}</span>
                                <ChevronDown size={13} className="opacity-50" />
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

                    {/* Raw / Memorias toggle */}
                    <div className="flex items-center rounded-lg border border-border/40 overflow-hidden h-[34px]">
                        <button
                            type="button"
                            className={cn(
                                "px-3 py-1.5 typo-select transition-colors",
                                viewMode === 'raw'
                                    ? "bg-primary/10 text-primary font-semibold"
                                    : "text-muted-foreground hover:bg-muted/50"
                            )}
                            onClick={() => setViewMode('raw')}
                        >
                            Raw
                        </button>
                        <div className="w-px h-5 bg-border/40" />
                        <button
                            type="button"
                            className={cn(
                                "px-3 py-1.5 typo-select transition-colors",
                                viewMode === 'memorias'
                                    ? "bg-primary/10 text-primary font-semibold"
                                    : "text-muted-foreground hover:bg-muted/50"
                            )}
                            onClick={() => setViewMode('memorias')}
                        >
                            Memorias
                        </button>
                    </div>

                    {/* Morph button (toggle) */}
                    <button
                        type="button"
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 h-[34px] typo-select border rounded-lg transition-colors disabled:opacity-50",
                            morphActive
                                ? "bg-primary/10 text-primary border-primary/30 font-semibold"
                                : "border-border/40 bg-background hover:bg-muted/50 text-muted-foreground"
                        )}
                        title="Cargar / quitar test de Morph V3"
                        onClick={() => {
                            if (morphActive) {
                                setPrompt("");
                                setSelectedModels(prev => prev.filter(m => !m.startsWith("morph/")));
                                setMorphActive(false);
                            } else {
                                setPrompt("<instruction>I will add type hints</instruction>\n<code>def greet(name):\n    return \"Hello \" + name</code>\n<update>def greet(name: str) -> str</update>");
                                setSelectedModels(prev => {
                                    const morphModels = ["morph/morph-v3-large", "morph/morph-v3-fast"];
                                    const without = prev.filter(m => !morphModels.includes(m));
                                    return [...without, ...morphModels];
                                });
                                setMorphActive(true);
                            }
                        }}
                        disabled={isRunning}
                    >
                        <Zap size={14} />
                        Morph
                    </button>

                    {/* Auto-collapse toggle */}
                    <button
                        type="button"
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 h-[34px] typo-select border rounded-lg transition-colors",
                            autoCollapse
                                ? "bg-primary/10 text-primary border-primary/30 font-semibold"
                                : "border-border/40 bg-background hover:bg-muted/50 text-muted-foreground"
                        )}
                        title={autoCollapse ? "Desactivar auto-colapso" : "Activar auto-colapso: colapsar resultado anterior al terminar uno nuevo"}
                        onClick={() => setAutoCollapse(c => !c)}
                    >
                        <ChevronsDownUp size={14} />
                        Auto-colapso
                    </button>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Reset */}
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

                    {/* Send / Cancel */}
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

                {/* ── Row 3: Collapsible prompt + Prompt Presets ── */}
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
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {isRunning && <Loader2 size={14} className="animate-spin text-primary" />}

                        {/* Prompt preset dropdown */}
                        <DropdownMenu open={promptPresetMenuOpen} onOpenChange={setPromptPresetMenuOpen}>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className={cn(
                                        "flex items-center gap-1.5 px-2.5 py-1 typo-select rounded-lg border transition-colors",
                                        activePromptPreset
                                            ? "border-primary/30 bg-primary/5 text-primary"
                                            : "border-border/40 bg-background text-muted-foreground hover:bg-muted/50"
                                    )}
                                    onClick={(e) => { e.stopPropagation(); setPromptPresetMenuOpen(o => !o); }}
                                    title="Presets de prompt"
                                >
                                    <FileText size={12} />
                                    {activePromptPreset
                                        ? <span className="max-w-[120px] truncate">{activePromptPreset}</span>
                                        : "Prompts"}
                                    <ChevronDown size={11} className="opacity-50 shrink-0" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[360px]" onClick={(e) => e.stopPropagation()}>
                                {/* Deselect */}
                                {activePromptPreset && (
                                    <>
                                        <DropdownMenuItem
                                            className="cursor-pointer py-2 text-muted-foreground"
                                            onSelect={() => {
                                                setActivePromptPreset(null);
                                                setPromptPresetMenuOpen(false);
                                            }}
                                        >
                                            <X size={13} className="mr-2 opacity-60" />
                                            Ninguno
                                        </DropdownMenuItem>
                                        <div className="h-px bg-border/50 my-1" />
                                    </>
                                )}

                                {/* Save current */}
                                {prompt.trim() && (
                                    <>
                                        <DropdownMenuItem
                                            className="cursor-pointer py-2 text-primary"
                                            onSelect={(e) => {
                                                e.preventDefault();
                                                setPromptSaveName("");
                                                setPromptSaveDialogOpen(true);
                                                setPromptPresetMenuOpen(false);
                                            }}
                                        >
                                            <Plus size={13} className="mr-2" />
                                            Guardar prompt actual
                                        </DropdownMenuItem>
                                        <div className="h-px bg-border/50 my-1" />
                                    </>
                                )}

                                {presets.promptPresets.length === 0 ? (
                                    <div className="py-3 px-4 text-center typo-caption text-muted-foreground">
                                        Sin presets de prompt
                                    </div>
                                ) : (
                                    presets.promptPresets.map(pp => (
                                        <DropdownMenuItem
                                            key={pp.name}
                                            className={cn(
                                                "cursor-pointer py-2.5 flex items-center justify-between gap-2",
                                                activePromptPreset === pp.name && "bg-primary/10 font-semibold"
                                            )}
                                            onSelect={(e) => {
                                                e.preventDefault();
                                                setPrompt(pp.prompt);
                                                setActivePromptPreset(pp.name);
                                                setPromptPresetMenuOpen(false);
                                            }}
                                        >
                                            <div className="flex flex-col min-w-0">
                                                <span className="truncate">{pp.name}</span>
                                                <span className="typo-micro text-muted-foreground truncate">
                                                    {pp.prompt.slice(0, 60)}{pp.prompt.length > 60 ? '…' : ''}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-0.5 shrink-0">
                                                <button
                                                    type="button"
                                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPendingRenamePromptPreset(pp.name);
                                                        setPromptRenameValue(pp.name);
                                                        setPromptPresetMenuOpen(false);
                                                    }}
                                                    title="Renombrar"
                                                >
                                                    <Pencil size={11} />
                                                </button>
                                                {prompt.trim() && (
                                                    <button
                                                        type="button"
                                                        className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            presets.updatePromptPreset(pp.name, prompt);
                                                            setActivePromptPreset(pp.name);
                                                            setPromptPresetMenuOpen(false);
                                                        }}
                                                        title={`Sobreescribir "${pp.name}" con el prompt actual`}
                                                    >
                                                        <Save size={11} />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPendingDeletePromptPreset(pp.name);
                                                        setPromptPresetMenuOpen(false);
                                                    }}
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </DropdownMenuItem>
                                    ))
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>

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
                    <textarea
                        ref={textareaRef}
                        className="playground-textarea typo-body"
                        placeholder="Escribe tu prompt aquí…"
                        value={prompt}
                        onChange={handlePromptChange}
                        onKeyDown={handleKeyDown}
                        disabled={isRunning}
                    />
                )}
            </div>

            {/* ── Prompt Preset Dialogs ── */}

            {/* Save prompt dialog */}
            <AlertDialog open={promptSaveDialogOpen} onOpenChange={setPromptSaveDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Guardar prompt como preset</AlertDialogTitle>
                        <AlertDialogDescription>Dale un nombre al preset para guardarlo.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <input
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground typo-body"
                        value={promptSaveName}
                        onChange={(e) => setPromptSaveName(e.target.value)}
                        placeholder="Nombre del preset…"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && promptSaveName.trim()) {
                                presets.savePromptPreset(promptSaveName.trim(), prompt);
                                setActivePromptPreset(promptSaveName.trim());
                                setPromptSaveDialogOpen(false);
                                setPromptSaveName("");
                            }
                        }}
                        autoFocus
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={!promptSaveName.trim()}
                            onClick={() => {
                                presets.savePromptPreset(promptSaveName.trim(), prompt);
                                setActivePromptPreset(promptSaveName.trim());
                                setPromptSaveDialogOpen(false);
                                setPromptSaveName("");
                            }}
                        >
                            Guardar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Rename prompt preset dialog */}
            <AlertDialog open={!!pendingRenamePromptPreset} onOpenChange={(open) => { if (!open) setPendingRenamePromptPreset(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Renombrar preset de prompt</AlertDialogTitle>
                    </AlertDialogHeader>
                    <input
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground typo-body"
                        value={promptRenameValue}
                        onChange={(e) => setPromptRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && promptRenameValue.trim() && pendingRenamePromptPreset) {
                                presets.renamePromptPreset(pendingRenamePromptPreset, promptRenameValue.trim());
                                if (activePromptPreset === pendingRenamePromptPreset) setActivePromptPreset(promptRenameValue.trim());
                                setPendingRenamePromptPreset(null);
                            }
                        }}
                        autoFocus
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={!promptRenameValue.trim()}
                            onClick={() => {
                                if (pendingRenamePromptPreset) {
                                    presets.renamePromptPreset(pendingRenamePromptPreset, promptRenameValue.trim());
                                    if (activePromptPreset === pendingRenamePromptPreset) setActivePromptPreset(promptRenameValue.trim());
                                    setPendingRenamePromptPreset(null);
                                }
                            }}
                        >
                            Renombrar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete prompt preset dialog */}
            <AlertDialog open={!!pendingDeletePromptPreset} onOpenChange={(open) => { if (!open) setPendingDeletePromptPreset(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar preset de prompt</AlertDialogTitle>
                        <AlertDialogDescription>
                            ¿Eliminar <strong>"{pendingDeletePromptPreset}"</strong>? Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (pendingDeletePromptPreset) {
                                    presets.deletePromptPreset(pendingDeletePromptPreset);
                                    if (activePromptPreset === pendingDeletePromptPreset) setActivePromptPreset(null);
                                    setPendingDeletePromptPreset(null);
                                }
                            }}
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── Results ── */}
            <div className="playground-results">
                {displayResults.map((result, i) => {
                    const cardKey = `${result.modelApiName}-${i}`;
                    const isCollapsed = !expandedCards.has(cardKey);
                    return (
                        <ResultCard
                            key={cardKey}
                            result={result}
                            collapsed={isCollapsed}
                            rank={runFinished ? i + 1 : undefined}
                            onToggle={() => toggleCard(cardKey)}
                            onRetry={runFinished && !isRunning ? () => handleRetryModel(result.modelApiName) : undefined}
                            isRetrying={retryingModel === result.modelApiName}
                            viewMode={viewMode}
                            exportChecked={runFinished ? exportSelection.has(result.modelApiName) : undefined}
                            onExportToggle={runFinished ? () => {
                                setExportSelection(prev => {
                                    const next = new Set(prev);
                                    if (next.has(result.modelApiName)) next.delete(result.modelApiName);
                                    else next.add(result.modelApiName);
                                    return next;
                                });
                            } : undefined}
                        />
                    );
                })}

                {/* Export bar */}
                {runFinished && exportSelection.size > 0 && (
                    <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-primary/20 bg-primary/5">
                        <span className="typo-caption text-primary">
                            {exportSelection.size} resultado{exportSelection.size !== 1 ? 's' : ''} seleccionado{exportSelection.size !== 1 ? 's' : ''}
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="typo-select text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => setExportSelection(new Set())}
                            >
                                Limpiar
                            </button>
                            <button
                                type="button"
                                className="flex items-center gap-1.5 px-3 py-1.5 typo-select bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                                onClick={handleExportMarkdown}
                            >
                                <Download size={13} />
                                Exportar .md
                            </button>
                        </div>
                    </div>
                )}

                {/* Running indicator */}
                {isRunning && currentModelIndex >= 0 && currentModelIndex < activeModels.length && (
                    <div className="playground-running">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="flex-1">
                            Ejecutando <strong>{modelDisplayNameMap.get(activeModels[currentModelIndex]) || activeModels[currentModelIndex]}</strong>
                            {" "}({currentModelIndex + 1}/{activeModels.length})
                        </span>
                        <button
                            type="button"
                            className="flex items-center gap-1 px-2 py-1 typo-micro rounded-md border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            onClick={handleSkipCurrent}
                            title="Omitir este modelo"
                        >
                            <StopCircle size={11} />
                            Omitir
                        </button>
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
