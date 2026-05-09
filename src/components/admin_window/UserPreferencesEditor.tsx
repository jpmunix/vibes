/**
 * UserPreferencesEditor — Admin KV settings table with smart editors.
 *
 * Reads from `user_preferences` (KV table) and provides type-aware
 * inline editing: model dropdowns, boolean toggles, JSON pretty-print,
 * secret masking, and plain text inputs.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { ipc, type LanguageModel } from "@/ipc/types";
import { SettingsModelSelector } from "@/components/SettingsModelSelector";
import { UserSettingsSchema } from "@/lib/schemas";
import { PrimaryColorPicker, getColorById } from "@/components/PrimaryColorPicker";
import { FONT_OPTIONS } from "@/shared/fonts";
import { localTemplatesData } from "@/shared/templates";
import {
    Loader2,
    Check,
    X,
    Copy,
    Eye,
    EyeOff,
    Pencil,
    Trash2,
    Search,
    Bot,
    KeyRound,
    Palette,
    Settings2,
    Package,
    ChevronDown,
} from "@/components/ui/icons";
import type { LucideIcon } from "@/components/ui/icons";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";
import ConfirmationDialog from "@/components/ConfirmationDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Zod schema introspection ────────────────────────────────────────────────
// Walk UserSettingsSchema.shape to extract enum values, number types, etc.
// This runs once at module load — zero manual mapping required.
// Supports both Zod v3 (_def.typeName, _def.values) and v4 (_def.type, _def.entries).

/** Get the type discriminator from a Zod node (v3 vs v4 compat) */
function zodType(schema: any): string | undefined {
    return schema?._def?.typeName ?? schema?._def?.type;
}

/** Unwrap ZodOptional / ZodDefault / ZodPreprocess / ZodPipe to find the inner type */
function unwrapZod(schema: any): any {
    if (!schema?._def) return schema;
    const tn = zodType(schema);
    if (tn === "ZodOptional" || tn === "optional" || tn === "ZodDefault" || tn === "default" || tn === "ZodNullable" || tn === "nullable") {
        return unwrapZod(schema._def.innerType);
    }
    if (tn === "ZodPreprocess") {
        return unwrapZod(schema._def.schema);
    }
    // Zod v4 uses "pipe" for preprocess — follow the output schema
    if (tn === "pipe") {
        return unwrapZod(schema._def.out);
    }
    return schema;
}

/** Extract enum string[] from a Zod schema node, or null */
function extractEnumValues(schema: any): string[] | null {
    const inner = unwrapZod(schema);
    if (!inner?._def) return null;
    const tn = zodType(inner);
    if (tn === "ZodEnum") {
        return inner._def.values as string[];
    }
    // Zod v4 — enums use _def.entries (object { value: value })
    if (tn === "enum" && inner._def.entries) {
        return Object.keys(inner._def.entries);
    }
    return null;
}

/** Extract whether a Zod schema node is a number type */
function isZodNumber(schema: any): boolean {
    const inner = unwrapZod(schema);
    const tn = zodType(inner);
    return tn === "ZodNumber" || tn === "number";
}

// Build lookup maps from schema
const SCHEMA_ENUM_VALUES = new Map<string, string[]>();
const SCHEMA_NUMBER_KEYS = new Set<string>();

(() => {
    const shape = (UserSettingsSchema as any).shape;
    if (!shape) return;
    for (const [key, fieldSchema] of Object.entries(shape)) {
        const enumVals = extractEnumValues(fieldSchema);
        if (enumVals && enumVals.length > 0) {
            SCHEMA_ENUM_VALUES.set(key, enumVals);
        }
        if (isZodNumber(fieldSchema)) {
            SCHEMA_NUMBER_KEYS.add(key);
        }
    }
})();

/** Keys whose values are colors (hue angles or hex/oklch strings) */
const COLOR_KEYS = new Set(["primaryColorLight", "primaryColorDark"]);

/** Keys whose values are font IDs */
const FONT_KEYS = new Set(["selectedFont", "selectedChatFont"]);

/** Keys whose values are template IDs */
const TEMPLATE_KEYS = new Set(["selectedTemplateId"]);

/** Template options for the selector */
const TEMPLATE_OPTIONS = localTemplatesData
    .filter((t) => t.isOfficial && !t.isExperimental)
    .map((t) => ({ value: t.id, label: t.title, description: t.description }));

// ── Type detection helpers ──────────────────────────────────────────────────

/** Keys whose values represent LLM model identifiers */
const MODEL_KEYS = new Set([
    "selectedModel",
    "strategistModel",
    "executorModel",
    "standardModeModel",
    "proModeModel",
    "turboEditModel",
    "appTitleGenerationModel",
    "todoAnalysisModel",
    "debateModel",
    "summaryModel",
    "knowledgeExtractionModel",
    "dossierModel",
    "embeddingsModel",
    "memoriesSynthesisModelV2",
    "memoriesRouterModelV2",
    "morphPatchModel",
]);

/** Keys that contain sensitive values (API keys, tokens) */
const SECRET_KEYS = new Set([
    "providerSettings",
    "githubAccessToken",
    "vercelAccessToken",
    "sessionToken",
]);

/** Keys whose values are always JSON objects/arrays */
const JSON_KEYS = new Set([
    "providerSettings",
    "selectedModel",
    "supabase",
    "neon",
    "firebase",
    "openCodePermissions",
    "openCodePermissions2",
    "agentToolConsents",
    "customPrompts",
    "windowState",
    "secondaryWindowStates",
    "agentModels",
    "playgroundModelSets",
    "lastKnownPerformance",
    "githubUser",
    "enabledOpenRouterModels",
    "openCodeIgnorePatterns",
    "_migrations",
]);

type ValueType = "model" | "boolean" | "json" | "secret" | "string" | "enum" | "number" | "color" | "font" | "template";

function detectValueType(key: string, value: string): ValueType {
    if (MODEL_KEYS.has(key) && !key.includes("selectedModel")) return "model";
    if (SECRET_KEYS.has(key)) return "secret";
    if (JSON_KEYS.has(key)) return "json";
    if (COLOR_KEYS.has(key)) return "color";
    if (FONT_KEYS.has(key)) return "font";
    if (TEMPLATE_KEYS.has(key)) return "template";
    if (SCHEMA_ENUM_VALUES.has(key)) return "enum";
    if (SCHEMA_NUMBER_KEYS.has(key)) return "number";

    // Try to detect from value
    if (value === "true" || value === "false") return "boolean";

    // Check if it's a JSON object/array
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
        return "json";
    }

    // Detect numeric strings that aren't in MODEL/SECRET/JSON sets
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return "number";

    return "string";
}

// ── Category grouping ───────────────────────────────────────────────────────

type Category = "models" | "keys" | "appearance" | "behavior" | "other";

const CATEGORY_LABELS: Record<Category, { icon: LucideIcon; label: string }> = {
    models: { icon: Bot, label: "Modelos" },
    keys: { icon: KeyRound, label: "Claves API e Integraciones" },
    appearance: { icon: Palette, label: "Apariencia" },
    behavior: { icon: Settings2, label: "Comportamiento" },
    other: { icon: Package, label: "Otros" },
};

const CATEGORY_ORDER: Category[] = ["models", "keys", "appearance", "behavior", "other"];

const APPEARANCE_KEYS = new Set([
    "selectedFont", "selectedChatFont", "fontScaleUI", "fontScaleSidebar",
    "fontScaleChat", "fontScaleBubbleWidth", "primaryColorLight", "primaryColorDark",
    "primaryChromaLight", "primaryChromaDark", "themeIntensity", "zoomLevel",
    "iconLibrary", "chatRenderMode", "previewDeviceMode", "previewPosition",
]);

function categorizeKey(key: string): Category {
    if (MODEL_KEYS.has(key) || key === "selectedModel" || key === "selectedModelVariant") return "models";
    if (SECRET_KEYS.has(key) || key.includes("AccessToken") || key.includes("apiKey")) return "keys";
    if (APPEARANCE_KEYS.has(key)) return "appearance";

    // Booleans and enums → behavior
    if (key.startsWith("enable") || key.startsWith("show") || key.startsWith("auto") ||
        key === "chatLanguage" || key === "defaultChatMode" || key === "selectedChatMode" ||
        key === "reasoningEffort" || key === "textVerbosity" || key === "runtimeMode2" ||
        key === "proLazyEditsMode" || key === "telemetryConsent" || key === "selectedTemplateId" ||
        key === "maxChatTurnsInContext" || key === "agentMaxSteps" ||
        key === "aiQueryLogRotationThreshold" || key === "smartContextOption" ||
        key === "proSmartContextOption") return "behavior";

    return "other";
}

// ── Preference entry type ───────────────────────────────────────────────────

interface PrefEntry {
    key: string;
    value: string;
    updatedAt: string | null;
    valueType: ValueType;
    category: Category;
}

// ── Main component ──────────────────────────────────────────────────────────

export function UserPreferencesEditor({ userId }: { userId: string }) {
    const [prefs, setPrefs] = useState<PrefEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [collapsedCategories, setCollapsedCategories] = useState<Set<Category>>(new Set(CATEGORY_ORDER));
    const [allModels, setAllModels] = useState<LanguageModel[]>([]);

    // Fetch all available models once for model-type selectors
    useEffect(() => {
        ipc.languageModel.getModelsByProviders().then((byProvider) => {
            const flat = Object.values(byProvider).flat();
            setAllModels(flat);
        }).catch(() => { /* ignore — models won't have picker */ });
    }, []);

    const fetchPrefs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await ipc.admin.getUserPreferences({ userId });
            const entries: PrefEntry[] = result.preferences.map((p) => ({
                key: p.key,
                value: p.value,
                updatedAt: p.updatedAt,
                valueType: detectValueType(p.key, p.value),
                category: categorizeKey(p.key),
            }));
            // Sort by key within each category
            entries.sort((a, b) => a.key.localeCompare(b.key));
            setPrefs(entries);
        } catch (err: any) {
            setError(err.message || "Error al cargar preferencias");
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { fetchPrefs(); }, [fetchPrefs]);

    const filteredPrefs = useMemo(() => {
        if (!filter) return prefs;
        const q = filter.toLowerCase();
        return prefs.filter((p) =>
            p.key.toLowerCase().includes(q) ||
            p.value.toLowerCase().includes(q)
        );
    }, [prefs, filter]);

    const groupedPrefs = useMemo(() => {
        const groups = new Map<Category, PrefEntry[]>();
        for (const cat of CATEGORY_ORDER) groups.set(cat, []);
        for (const p of filteredPrefs) {
            groups.get(p.category)!.push(p);
        }
        // Remove empty groups
        for (const [cat, entries] of groups) {
            if (entries.length === 0) groups.delete(cat);
        }
        return groups;
    }, [filteredPrefs]);

    const toggleCategory = (cat: Category) => {
        setCollapsedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    const handleSave = async (key: string, newValue: string) => {
        try {
            await ipc.admin.setUserPreference({ userId, key, value: newValue });
            setPrefs((prev) => prev.map((p) =>
                p.key === key ? { ...p, value: newValue, valueType: detectValueType(key, newValue) } : p
            ));
            toast.success(`${key} guardado`);
        } catch (err: any) {
            toast.error(err.message || "Error al guardar");
        }
    };

    const handleDelete = async (key: string) => {
        try {
            await ipc.admin.deleteUserPreference({ userId, key });
            setPrefs((prev) => prev.filter((p) => p.key !== key));
            toast.success(`${key} eliminado`);
        } catch (err: any) {
            toast.error(err.message || "Error al eliminar");
        }
    };

    if (loading) {
        return (
            <div className="p-4 rounded-xl border border-border/50 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
                <span className="typo-caption">Cargando preferencias…</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 rounded-xl border border-border/50">
                <p className="typo-caption text-destructive">{error}</p>
            </div>
        );
    }

    if (prefs.length === 0) {
        return (
            <div className="p-4 rounded-xl border border-border/50">
                <p className="typo-caption">Sin preferencias guardadas</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Search */}
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                <input
                    type="text"
                    placeholder="Buscar preferencia…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:ring-0 outline-none transition-colors"
                />
            </div>

            {/* Count badge */}
            <div className="flex items-center gap-2">
                <span className="typo-caption text-muted-foreground">
                    {filteredPrefs.length} preferencia{filteredPrefs.length !== 1 ? "s" : ""}
                    {filter && ` (de ${prefs.length} total)`}
                </span>
            </div>

            {/* Grouped preferences */}
            {CATEGORY_ORDER.map((cat) => {
                const entries = groupedPrefs.get(cat);
                if (!entries || entries.length === 0) return null;
                const info = CATEGORY_LABELS[cat];
                const isCollapsed = collapsedCategories.has(cat);

                return (
                    <div key={cat} className="rounded-xl border border-border/50 overflow-hidden">
                        {/* Category header */}
                        <button
                            type="button"
                            className="w-full flex items-center justify-between px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => toggleCategory(cat)}
                        >
                            <span className="typo-label flex items-center gap-2">
                                <info.icon size={14} className="text-muted-foreground" />
                                {info.label}
                                <span className="typo-caption text-muted-foreground/60 ml-1">
                                    ({entries.length})
                                </span>
                            </span>
                            <ChevronDown
                                size={14}
                                className={cn(
                                    "text-muted-foreground/50 transition-transform duration-150",
                                    isCollapsed && "-rotate-90",
                                )}
                            />
                        </button>

                        {/* Entries */}
                        {!isCollapsed && (
                            <div className="divide-y divide-border/20">
                                {entries.map((pref) => (
                                    <PrefRow
                                        key={pref.key}
                                        pref={pref}
                                        onSave={handleSave}
                                        onDelete={handleDelete}
                                        allModels={allModels}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Individual preference row ───────────────────────────────────────────────

function PrefRow({
    pref,
    onSave,
    onDelete,
    allModels,
}: {
    pref: PrefEntry;
    onSave: (key: string, value: string) => Promise<void>;
    onDelete: (key: string) => Promise<void>;
    allModels: LanguageModel[];
}) {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(pref.value);
    const [saving, setSaving] = useState(false);
    const [showSecret, setShowSecret] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const handleStartEdit = () => {
        // Pretty-print any value that parses as JSON (secrets, json, etc.)
        const trimmed = pref.value.trim();
        const looksJson = (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
            (trimmed.startsWith("[") && trimmed.endsWith("]"));
        if (looksJson) {
            try {
                const parsed = JSON.parse(pref.value);
                setEditValue(JSON.stringify(parsed, null, 2));
            } catch {
                setEditValue(pref.value);
            }
        } else {
            setEditValue(pref.value);
        }
        setEditing(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Compact JSON before saving (for any value that parses)
            let valueToSave = editValue;
            const trimmedEdit = editValue.trim();
            const looksJsonEdit = (trimmedEdit.startsWith("{") && trimmedEdit.endsWith("}")) ||
                (trimmedEdit.startsWith("[") && trimmedEdit.endsWith("]"));
            if (looksJsonEdit) {
                try {
                    const parsed = JSON.parse(editValue);
                    valueToSave = JSON.stringify(parsed);
                } catch {
                    if (pref.valueType === "json") {
                        toast.error("JSON inválido");
                        setSaving(false);
                        return;
                    }
                    // Non-json types: save as-is if parse fails
                }
            }
            await onSave(pref.key, valueToSave);
            setEditing(false);
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setEditing(false);
        setEditValue(pref.value);
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(pref.value);
        toast.success("Copiado");
    };

    const handleToggleBoolean = async () => {
        const newVal = pref.value === "true" ? "false" : "true";
        await onSave(pref.key, newVal);
    };

    // ── Render value display ──

    const renderValueDisplay = () => {
        const { valueType, value } = pref;

        if (valueType === "boolean") {
            return (
                <button
                    type="button"
                    onClick={handleToggleBoolean}
                    className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer",
                        value === "true"
                            ? "bg-primary/15 text-primary hover:bg-primary/25"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted/80",
                    )}
                >
                    {value === "true"
                        ? <span className="flex items-center gap-1"><Check size={10} /> true</span>
                        : <span className="flex items-center gap-1"><X size={10} /> false</span>
                    }
                </button>
            );
        }

        if (valueType === "model") {
            return (
                <span className="typo-caption font-mono text-primary/90 break-all select-all">
                    {value}
                </span>
            );
        }

        if (valueType === "enum") {
            return (
                <span className="typo-caption font-mono text-foreground/80 select-all">
                    {value}
                </span>
            );
        }

        if (valueType === "color") {
            const colorEntry = getColorById(value);
            return (
                <div className="flex items-center gap-2">
                    <div
                        className="w-5 h-5 rounded-full border border-border/60 shrink-0"
                        style={{ background: colorEntry?.preview || "#888" }}
                    />
                    <span className="typo-caption font-mono text-foreground/80 select-all">{colorEntry?.name || value}</span>
                </div>
            );
        }

        if (valueType === "font") {
            const font = FONT_OPTIONS.find((f) => f.id === value);
            return (
                <span className="typo-caption text-foreground/80 select-all">
                    {font?.name || value}
                </span>
            );
        }

        if (valueType === "template") {
            const tpl = TEMPLATE_OPTIONS.find((t) => t.value === value);
            return (
                <span className="typo-caption text-foreground/80 select-all">
                    {tpl?.label || value}
                </span>
            );
        }

        if (valueType === "number") {
            return (
                <span className="typo-caption font-mono text-foreground/80 tabular-nums select-all">
                    {value}
                </span>
            );
        }

        if (valueType === "secret") {
            return (
                <div className="flex items-center gap-1.5">
                    <span className="typo-caption font-mono text-foreground/80 break-all select-all">
                        {showSecret ? value : maskValue(value)}
                    </span>
                    <button
                        type="button"
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0"
                        onClick={() => setShowSecret(!showSecret)}
                    >
                        {showSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                </div>
            );
        }

        if (valueType === "json") {
            let preview: string;
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) {
                    preview = `[${parsed.length} elemento${parsed.length !== 1 ? "s" : ""}]`;
                } else if (typeof parsed === "object" && parsed !== null) {
                    const keys = Object.keys(parsed);
                    preview = `{${keys.length} prop${keys.length !== 1 ? "s" : ""}}`;
                } else {
                    preview = String(parsed);
                }
            } catch {
                preview = value.slice(0, 50) + (value.length > 50 ? "…" : "");
            }
            return (
                <span className="typo-caption text-muted-foreground/70 italic">
                    {preview}
                </span>
            );
        }

        // String fallback
        const display = value.length > 80 ? value.slice(0, 80) + "…" : value;
        return (
            <span className="typo-caption font-mono text-foreground/80 break-all select-all">
                {display}
            </span>
        );
    };

    // ── Render editor ──

    if (editing) {
        const isJson = pref.valueType === "json" || (() => {
            const t = editValue.trim();
            return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
        })();
        const isModel = pref.valueType === "model";

        // Model editing: inline within the compact row — no expanded panel
        if (isModel && allModels.length > 0) {
            return (
                <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-muted/10 transition-colors">
                    <div className="shrink-0 min-w-[200px] max-w-[280px]">
                        <span className="typo-caption text-muted-foreground break-all">{pref.key}</span>
                    </div>
                    <div className="flex-1 flex justify-end">
                        <SettingsModelSelector
                            selectedModel={editValue}
                            onModelSelect={async (apiName) => {
                                setEditValue(apiName);
                                setSaving(true);
                                try {
                                    await onSave(pref.key, apiName);
                                    setEditing(false);
                                } finally {
                                    setSaving(false);
                                }
                            }}
                            models={allModels}
                            disableEnabledFilter
                            placeholder="Selecciona un modelo"
                            size="sm"
                        />
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        {saving && <Loader2 size={12} className="animate-spin text-primary" />}
                        <button
                            type="button"
                            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                            onClick={handleCancel}
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>
            );
        }

        // Enum editing: inline compact row with UnifiedSelector
        const enumVals = SCHEMA_ENUM_VALUES.get(pref.key);
        if (pref.valueType === "enum" && enumVals) {
            return (
                <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-muted/10 transition-colors">
                    <div className="shrink-0 min-w-[200px] max-w-[280px]">
                        <span className="typo-caption text-muted-foreground break-all">{pref.key}</span>
                    </div>
                    <div className="flex-1 flex justify-end">
                        <UnifiedSelector
                            value={editValue}
                            onChange={async (v) => {
                                setEditValue(v);
                                setSaving(true);
                                try {
                                    await onSave(pref.key, v);
                                    setEditing(false);
                                } finally {
                                    setSaving(false);
                                }
                            }}
                            options={enumVals.map((v) => ({ value: v, label: v }))}
                            triggerVariant="default"
                            triggerSize="sm"
                            showCheckmark
                            itemLayout="compact"
                        />
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        {saving && <Loader2 size={12} className="animate-spin text-primary" />}
                        <button
                            type="button"
                            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                            onClick={handleCancel}
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>
            );
        }

        // Number editing: compact inline row (spinners hidden via CSS)
        if (pref.valueType === "number") {
            return (
                <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-muted/10 transition-colors">
                    <div className="shrink-0 min-w-[200px] max-w-[280px]">
                        <span className="typo-caption text-muted-foreground break-all">{pref.key}</span>
                    </div>
                    <div className="flex-1 flex justify-end">
                        <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-24 px-3 py-1.5 bg-secondary border border-border rounded-md text-foreground text-sm font-mono tabular-nums text-right focus:border-primary focus:ring-0 outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            autoFocus
                            step="any"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSave();
                                if (e.key === "Escape") handleCancel();
                            }}
                        />
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        <button type="button" className="p-1 rounded hover:bg-accent text-primary cursor-pointer transition-colors" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        </button>
                        <button type="button" className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors" onClick={handleCancel}>
                            <X size={12} />
                        </button>
                    </div>
                </div>
            );
        }

        // Color editing: inline PrimaryColorPicker
        if (pref.valueType === "color") {
            return (
                <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-muted/10 transition-colors">
                    <div className="shrink-0 min-w-[200px] max-w-[280px]">
                        <span className="typo-caption text-muted-foreground break-all">{pref.key}</span>
                    </div>
                    <div className="flex-1 flex justify-end">
                        <PrimaryColorPicker
                            selectedColor={editValue}
                            onColorSelect={async (colorId) => {
                                setEditValue(colorId);
                                setSaving(true);
                                try {
                                    await onSave(pref.key, colorId);
                                    setEditing(false);
                                } finally {
                                    setSaving(false);
                                }
                            }}
                            variant="dark"
                        />
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        {saving && <Loader2 size={12} className="animate-spin text-primary" />}
                        <button type="button" className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors" onClick={handleCancel}>
                            <X size={12} />
                        </button>
                    </div>
                </div>
            );
        }

        // Template editing: inline UnifiedSelector with template options
        if (pref.valueType === "template") {
            return (
                <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-muted/10 transition-colors">
                    <div className="shrink-0 min-w-[200px] max-w-[280px]">
                        <span className="typo-caption text-muted-foreground break-all">{pref.key}</span>
                    </div>
                    <div className="flex-1 flex justify-end">
                        <UnifiedSelector
                            value={editValue}
                            onChange={async (v) => {
                                setEditValue(v);
                                setSaving(true);
                                try {
                                    await onSave(pref.key, v);
                                    setEditing(false);
                                } finally {
                                    setSaving(false);
                                }
                            }}
                            options={TEMPLATE_OPTIONS}
                            triggerVariant="default"
                            triggerSize="sm"
                            showCheckmark
                            searchable
                            searchPlaceholder="Buscar template…"
                        />
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        {saving && <Loader2 size={12} className="animate-spin text-primary" />}
                        <button type="button" className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors" onClick={handleCancel}>
                            <X size={12} />
                        </button>
                    </div>
                </div>
            );
        }

        // Font editing: inline UnifiedSelector with font options
        if (pref.valueType === "font") {
            return (
                <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-muted/10 transition-colors">
                    <div className="shrink-0 min-w-[200px] max-w-[280px]">
                        <span className="typo-caption text-muted-foreground break-all">{pref.key}</span>
                    </div>
                    <div className="flex-1 flex justify-end">
                        <UnifiedSelector
                            value={editValue}
                            onChange={async (v) => {
                                setEditValue(v);
                                setSaving(true);
                                try {
                                    await onSave(pref.key, v);
                                    setEditing(false);
                                } finally {
                                    setSaving(false);
                                }
                            }}
                            options={FONT_OPTIONS.map((f) => ({
                                value: f.id,
                                label: f.name,
                                description: f.category,
                            }))}
                            triggerVariant="default"
                            triggerSize="sm"
                            showCheckmark
                            searchable
                            searchPlaceholder="Buscar fuente…"
                        />
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        {saving && <Loader2 size={12} className="animate-spin text-primary" />}
                        <button type="button" className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors" onClick={handleCancel}>
                            <X size={12} />
                        </button>
                    </div>
                </div>
            );
        }

        // JSON / string / other: expanded panel
        return (
            <div className="px-4 py-3 space-y-2 bg-muted/10">
                <div className="flex items-center justify-between">
                    <span className="typo-caption text-muted-foreground font-medium">{pref.key}</span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            className="p-1.5 rounded hover:bg-accent text-primary cursor-pointer transition-colors"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        </button>
                        <button
                            type="button"
                            className="p-1.5 rounded hover:bg-accent text-muted-foreground cursor-pointer transition-colors"
                            onClick={handleCancel}
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
                {isJson ? (
                    (() => {
                        let parsed: any = null;
                        try { parsed = JSON.parse(editValue); } catch {}

                        // If parseable as an object or array, use recursive editor
                        if (parsed !== null && typeof parsed === "object") {
                            return (
                                <RecursiveJsonEditor
                                    value={parsed}
                                    onChange={(updated) => setEditValue(JSON.stringify(updated, null, 2))}
                                    allModels={allModels}
                                    depth={0}
                                />
                            );
                        }

                        // Fallback: raw textarea
                        return (
                            <textarea
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-xs font-mono placeholder:text-muted-foreground/50 focus:border-primary focus:ring-0 outline-none transition-colors resize-y min-h-[120px]"
                                rows={Math.min(20, editValue.split("\n").length + 2)}
                                spellCheck={false}
                            />
                        );
                    })()
                ) : (
                    <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:border-primary focus:ring-0 outline-none transition-colors"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleSave();
                            if (e.key === "Escape") handleCancel();
                        }}
                    />
                )}
            </div>
        );
    }

    // ── Read-only row ──

    return (
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-muted/20 transition-colors group">
            {/* Key */}
            <div className="shrink-0 min-w-[200px] max-w-[280px]">
                <span className="typo-caption text-muted-foreground break-all">{pref.key}</span>
            </div>

            {/* Value */}
            <div className="flex-1 flex justify-end">{renderValueDisplay()}</div>

            {/* Actions */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                    type="button"
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                    onClick={handleCopy}
                    title="Copiar valor"
                >
                    <Copy size={12} />
                </button>
                <button
                    type="button"
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                    onClick={handleStartEdit}
                    title="Editar"
                >
                    <Pencil size={12} />
                </button>
                <button
                    type="button"
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive cursor-pointer transition-colors"
                    onClick={() => setConfirmDelete(true)}
                    title="Eliminar"
                >
                    <Trash2 size={12} />
                </button>
            </div>

            <ConfirmationDialog
                isOpen={confirmDelete}
                title="Eliminar preferencia"
                message={`¿Seguro que quieres eliminar "${pref.key}"? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                onConfirm={() => {
                    setConfirmDelete(false);
                    onDelete(pref.key);
                }}
                onCancel={() => setConfirmDelete(false)}
            />
        </div>
    );
}

// ── RecursiveJsonEditor ─────────────────────────────────────────────────────
// Renders any JSON value with type-aware inline editors for each property.
// Supports: boolean toggles, number inputs, model selectors, color pickers,
// font selectors, nested object recursion, array recursion, and string inputs.

/** Heuristic: does this key name refer to an LLM model? */
function looksLikeModelKey(key: string): boolean {
    const k = key.toLowerCase();
    return k.includes("model") && !k.includes("mode");
}

/** Heuristic: does this key name refer to a color? */
function looksLikeColorKey(key: string): boolean {
    const k = key.toLowerCase();
    return k.includes("color") || k.includes("colour");
}

/** Heuristic: does this key name refer to a font? */
function looksLikeFontKey(key: string): boolean {
    const k = key.toLowerCase();
    return k.includes("font");
}

interface RecursiveJsonEditorProps {
    value: any;
    onChange: (updated: any) => void;
    allModels: LanguageModel[];
    depth: number;
    parentKey?: string;
}

function RecursiveJsonEditor({ value, onChange, allModels, depth }: RecursiveJsonEditorProps) {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const toggleCollapse = (key: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // ── Array rendering ──
    if (Array.isArray(value)) {
        return (
            <div className="flex flex-col gap-0.5">
                {value.map((item, idx) => {
                    const isNested = typeof item === "object" && item !== null;

                    if (isNested) {
                        const isCollapsed = collapsed.has(String(idx));
                        return (
                            <div key={idx}>
                                <button
                                    type="button"
                                    className="flex items-center gap-1.5 w-full px-2 py-1 rounded hover:bg-muted/30 transition-colors cursor-pointer"
                                    onClick={() => toggleCollapse(String(idx))}
                                >
                                    <ChevronDown
                                        size={12}
                                        className={cn(
                                            "text-muted-foreground/50 transition-transform",
                                            isCollapsed && "-rotate-90",
                                        )}
                                    />
                                    <span className="typo-caption font-mono text-muted-foreground/50">{idx}</span>
                                    <span className="typo-caption text-muted-foreground/40 ml-auto">
                                        {Array.isArray(item) ? `[${item.length}]` : `{${Object.keys(item).length}}`}
                                    </span>
                                </button>
                                {!isCollapsed && (
                                    <div className="ml-4 pl-3 border-l border-border/30">
                                        <RecursiveJsonEditor
                                            value={item}
                                            onChange={(updated) => {
                                                const arr = [...value];
                                                arr[idx] = updated;
                                                onChange(arr);
                                            }}
                                            allModels={allModels}
                                            depth={depth + 1}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    }

                    return (
                        <div key={idx} className="flex items-center gap-2">
                            <span className="typo-caption font-mono text-muted-foreground/50 shrink-0 w-6 text-right">{idx}</span>
                            <div className="flex-1">
                                <RecursiveJsonPropEditor
                                    propKey={String(idx)}
                                    propValue={item}
                                    onPropChange={(updated) => {
                                        const arr = [...value];
                                        arr[idx] = updated;
                                        onChange(arr);
                                    }}
                                    allModels={allModels}
                                    depth={depth}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    // ── Object rendering ──
    if (typeof value === "object" && value !== null) {
        const entries = Object.entries(value);
        return (
            <div className="flex flex-col gap-0.5">
                {entries.map(([propKey, propVal]) => {
                    const isNested = typeof propVal === "object" && propVal !== null;

                    if (isNested) {
                        const isCollapsed = collapsed.has(propKey);
                        return (
                            <div key={propKey}>
                                <button
                                    type="button"
                                    className="flex items-center gap-1.5 w-full px-2 py-1 rounded hover:bg-muted/30 transition-colors cursor-pointer group"
                                    onClick={() => toggleCollapse(propKey)}
                                >
                                    <ChevronDown
                                        size={12}
                                        className={cn(
                                            "text-muted-foreground/50 transition-transform",
                                            isCollapsed && "-rotate-90",
                                        )}
                                    />
                                    <span className="typo-caption font-mono text-foreground/70 font-medium">{propKey}</span>
                                    <span className="typo-caption text-muted-foreground/40 ml-auto">
                                        {Array.isArray(propVal) ? `[${propVal.length}]` : `{${Object.keys(propVal as object).length}}`}
                                    </span>
                                </button>
                                {!isCollapsed && (
                                    <div className="ml-4 pl-3 border-l border-border/30">
                                        <RecursiveJsonEditor
                                            value={propVal}
                                            onChange={(updated) => onChange({ ...value, [propKey]: updated })}
                                            allModels={allModels}
                                            depth={depth + 1}
                                            parentKey={propKey}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    }

                    return (
                        <div key={propKey} className="flex items-center justify-between gap-3 px-2 py-1 rounded hover:bg-muted/30 transition-colors">
                            <span className="typo-caption font-mono text-foreground/70 shrink-0">{propKey}</span>
                            <div className="flex-1 flex justify-end">
                                <RecursiveJsonPropEditor
                                    propKey={propKey}
                                    propValue={propVal}
                                    onPropChange={(updated) => onChange({ ...value, [propKey]: updated })}
                                    allModels={allModels}
                                    depth={depth}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    // Primitive at root
    return <span className="typo-caption font-mono text-foreground/80">{String(value)}</span>;
}

/** Renders an inline editor for a single primitive JSON property value */
function RecursiveJsonPropEditor({
    propKey,
    propValue,
    onPropChange,
    allModels,
}: {
    propKey: string;
    propValue: any;
    onPropChange: (updated: any) => void;
    allModels: LanguageModel[];
    depth: number;
}) {
    // ── Boolean ──
    if (typeof propValue === "boolean") {
        return (
            <button
                type="button"
                onClick={() => onPropChange(!propValue)}
                className={cn(
                    "px-2 py-0.5 rounded-full text-xs font-medium transition-all cursor-pointer",
                    propValue
                        ? "bg-primary/15 text-primary hover:bg-primary/25"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted/80",
                )}
            >
                {propValue
                    ? <span className="flex items-center gap-1"><Check size={10} /> true</span>
                    : <span className="flex items-center gap-1"><X size={10} /> false</span>
                }
            </button>
        );
    }

    // ── Number ──
    if (typeof propValue === "number") {
        return (
            <input
                type="number"
                defaultValue={propValue}
                onBlur={(e) => {
                    const n = parseFloat(e.target.value);
                    if (!isNaN(n) && n !== propValue) onPropChange(n);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        const n = parseFloat((e.target as HTMLInputElement).value);
                        if (!isNaN(n)) onPropChange(n);
                    }
                }}
                className="w-20 px-2 py-0.5 bg-secondary border border-border rounded text-foreground text-xs font-mono tabular-nums text-right focus:border-primary focus:ring-0 outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                step="any"
            />
        );
    }

    // ── String ──
    if (typeof propValue === "string") {
        // Template key heuristic
        if (propKey.toLowerCase().includes("template") && propKey.toLowerCase().includes("id")) {
            const tplMatch = TEMPLATE_OPTIONS.find((t) => t.value === propValue);
            if (tplMatch) {
                return (
                    <UnifiedSelector
                        value={propValue}
                        onChange={(v) => onPropChange(v)}
                        options={TEMPLATE_OPTIONS}
                        triggerVariant="default"
                        triggerSize="xs"
                        showCheckmark
                    />
                );
            }
        }

        // Model key heuristic
        if (looksLikeModelKey(propKey) && allModels.length > 0 && propValue.includes("/")) {
            return (
                <SettingsModelSelector
                    selectedModel={propValue}
                    onModelSelect={(apiName) => onPropChange(apiName)}
                    models={allModels}
                    disableEnabledFilter
                    placeholder="Modelo"
                    size="sm"
                />
            );
        }

        // Color key heuristic
        if (looksLikeColorKey(propKey)) {
            const colorEntry = getColorById(propValue);
            if (colorEntry) {
                return (
                    <PrimaryColorPicker
                        selectedColor={propValue}
                        onColorSelect={(colorId) => onPropChange(colorId)}
                        variant="dark"
                    />
                );
            }
        }

        // Font key heuristic
        if (looksLikeFontKey(propKey)) {
            const fontMatch = FONT_OPTIONS.find((f) => f.id === propValue);
            if (fontMatch) {
                return (
                    <UnifiedSelector
                        value={propValue}
                        onChange={(v) => onPropChange(v)}
                        options={FONT_OPTIONS.map((f) => ({
                            value: f.id,
                            label: f.name,
                            description: f.category,
                        }))}
                        triggerVariant="default"
                        triggerSize="xs"
                        showCheckmark
                    />
                );
            }
        }

        // Enum from schema
        const enumVals = SCHEMA_ENUM_VALUES.get(propKey);
        if (enumVals && enumVals.includes(propValue)) {
            return (
                <UnifiedSelector
                    value={propValue}
                    onChange={(v) => onPropChange(v)}
                    options={enumVals.map((v) => ({ value: v, label: v }))}
                    triggerVariant="default"
                    triggerSize="xs"
                    showCheckmark
                    itemLayout="compact"
                />
            );
        }

        // Default: auto-sized editable text (textarea for long values)
        const isLong = propValue.length > 50 || propValue.includes("\n");
        if (isLong) {
            return (
                <textarea
                    defaultValue={propValue}
                    onBlur={(e) => {
                        if (e.target.value !== propValue) onPropChange(e.target.value);
                    }}
                    rows={Math.max(2, Math.min(8, propValue.split("\n").length + 1))}
                    className="w-full px-2 py-1 bg-secondary border border-border rounded text-foreground text-xs font-mono focus:border-primary focus:ring-0 outline-none transition-colors resize-y min-h-[40px]"
                    spellCheck={false}
                />
            );
        }
        return (
            <input
                type="text"
                defaultValue={propValue}
                onBlur={(e) => {
                    if (e.target.value !== propValue) onPropChange(e.target.value);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") onPropChange((e.target as HTMLInputElement).value);
                }}
                className="w-full max-w-[300px] px-2 py-0.5 bg-secondary border border-border rounded text-foreground text-xs font-mono text-right focus:border-primary focus:ring-0 outline-none transition-colors"
            />
        );
    }

    // null / undefined
    return <span className="typo-caption text-muted-foreground/50 italic">null</span>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function maskValue(value: string): string {
    if (value.length <= 8) return "••••••••";
    // Show first 6 and last 4 characters
    const start = value.slice(0, 6);
    const end = value.slice(-4);
    return `${start}${"•".repeat(Math.min(20, value.length - 10))}${end}`;
}
