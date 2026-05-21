import { useMemo } from "react";
import { type LanguageModel } from "@/ipc/types";
import { ModelItemContent } from "@/components/ModelItemContent";
import { useSettings } from "@/hooks/useSettings";
import { useModelAliases } from "@/hooks/useModelAliases";
import { DEFAULT_ENABLED_MODELS } from "@/ipc/shared/language_model_constants";
import { UnifiedSelector, type SelectorOption, type SelectorGroup } from "@/components/ui/UnifiedSelector";

// ── Provider badge styles ──────────────────────────────────────────────────
// Maps a sourceProvider key to visual badge styling.
const PROVIDER_BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    openrouter: { bg: "bg-sky-500/10", text: "text-sky-500", label: "OpenRouter" },
    ollama: { bg: "bg-emerald-500/10", text: "text-emerald-500", label: "Ollama" },
    local: { bg: "bg-amber-500/10", text: "text-amber-500", label: "Local" },
};

/** Get a badge for any provider. Custom providers get a dynamic purple badge. */
function getBadgeForProvider(provider: string, providerLabel?: string): { bg: string; text: string; label: string } | null {
    if (!provider) return null;
    if (PROVIDER_BADGE_STYLES[provider]) return PROVIDER_BADGE_STYLES[provider];
    // Custom providers (e.g. "custom::cortecs") get a purple badge with their name
    if (provider.startsWith("custom::")) {
        return {
            bg: "bg-purple-500/10",
            text: "text-purple-400",
            label: providerLabel || provider.replace("custom::", ""),
        };
    }
    return { bg: "bg-zinc-500/10", text: "text-zinc-400", label: providerLabel || provider };
}

/** Resolve the sourceProvider from a model object (MultiProviderModel carries it) */
function getSourceProvider(model: LanguageModel): string {
    return (model as any).sourceProvider || "openrouter";
}
function getSourceProviderLabel(model: LanguageModel): string {
    return (model as any).sourceProviderLabel || "";
}

/** Classify a provider into a group ID for the selector */
function getGroupId(provider: string): string {
    if (provider === "ollama") return "ollama";
    if (provider === "openrouter") return "openrouter";
    if (provider.startsWith("custom::")) return provider; // each custom gets its own group
    return "other";
}

interface SettingsModelSelectorProps {
    selectedModel: string | undefined;
    onModelSelect: (modelName: string) => void;
    models: LanguageModel[];
    loading?: boolean;
    placeholder?: string;
    specialOptions?: Array<{
        value: string;
        label: string;
        description?: string;
    }>;
    className?: string;
    /** "sm" = compact (home), "md" = larger (settings) */
    size?: "sm" | "md";
    /** "default" = outline button, "pill" = primary pill like other selectors */
    variant?: "default" | "pill";
    /**
     * When true, bypasses the enabledOpenRouterModels filter so all cached
     * models appear in the search dropdown (e.g. for the internal-tasks selector).
     */
    disableEnabledFilter?: boolean;
    /**
     * When true, shows a provider badge (OpenRouter, Ollama, etc.) next to each model
     * and groups models by provider. Used in multi-provider selectors (strategist/executor).
     */
    showProviderBadge?: boolean;
}

export function SettingsModelSelector({
    selectedModel,
    onModelSelect,
    models,
    loading = false,
    placeholder = "Selecciona un modelo",
    specialOptions = [],
    className = "",
    size = "sm",
    variant = "default",
    disableEnabledFilter = false,
    showProviderBadge = false,
}: SettingsModelSelectorProps) {
    const { settings } = useSettings();
    const { aliases } = useModelAliases();

    // Filter models to only show user-enabled ones (consistent with main ModelPicker)
    // unless disableEnabledFilter is set (e.g. internal-tasks selector shows all cached models)
    const filteredModels = useMemo(() => {
        if (disableEnabledFilter) return models;
        const enabledModels = settings?.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS;
        return models.filter((model) => enabledModels.includes(model.apiName));
    }, [models, settings?.enabledOpenRouterModels, disableEnabledFilter]);

    // Build a lookup for display names (and provider info)
    const modelLookup = useMemo(() => {
        const map = new Map<string, LanguageModel>();
        for (const m of models) map.set(m.apiName, m);
        return map;
    }, [models]);

    // Build options for UnifiedSelector — special first, then models
    // When showProviderBadge is on, group models by provider
    const { options, groups } = useMemo(() => {
        const specialOpts: SelectorOption[] = specialOptions.map((opt) => ({
            value: opt.value,
            label: opt.label,
            description: opt.description,
            group: "special",
        }));

        if (showProviderBadge) {
            // Group by sourceProvider (from MultiProviderModel)
            const buckets = new Map<string, { label: string; models: SelectorOption[] }>();

            for (const model of filteredModels) {
                const provider = getSourceProvider(model);
                const groupId = getGroupId(provider);

                if (!buckets.has(groupId)) {
                    let groupLabel = "";
                    if (groupId === "ollama") groupLabel = "Ollama (local)";
                    else if (groupId === "openrouter") groupLabel = "OpenRouter";
                    else if (groupId.startsWith("custom::")) {
                        const name = getSourceProviderLabel(model) || groupId.replace("custom::", "");
                        groupLabel = name;
                    }
                    else groupLabel = "Otros";
                    buckets.set(groupId, { label: groupLabel, models: [] });
                }

                buckets.get(groupId)!.models.push({
                    value: model.apiName,
                    label: aliases[model.apiName] || model.displayName,
                    description: model.contextWindow
                        ? `${model.contextWindow >= 1000000 ? `${(model.contextWindow / 1000000).toFixed(0)}M` : model.contextWindow >= 1000 ? `${(model.contextWindow / 1000).toFixed(0)}K` : model.contextWindow} context`
                        : undefined,
                    keywords: [model.apiName, model.displayName],
                    group: groupId,
                });
            }

            // Order: Ollama first, then custom, then OpenRouter
            const orderedBuckets = [
                ...([...buckets.entries()].filter(([k]) => k === "ollama")),
                ...([...buckets.entries()].filter(([k]) => k.startsWith("custom::"))),
                ...([...buckets.entries()].filter(([k]) => k === "openrouter")),
                ...([...buckets.entries()].filter(([k]) => k !== "ollama" && k !== "openrouter" && !k.startsWith("custom::"))),
            ];

            const allModelOpts = orderedBuckets.flatMap(([, b]) => b.models);
            const grps: SelectorGroup[] = [{ id: "special" }];
            for (const [id, bucket] of orderedBuckets) {
                if (bucket.models.length > 0) {
                    grps.push({ id, heading: bucket.label });
                }
            }

            return { options: [...specialOpts, ...allModelOpts], groups: grps };
        }

        // Default (no provider badges): flat list
        const modelOpts: SelectorOption[] = filteredModels.map((model) => ({
            value: model.apiName,
            label: aliases[model.apiName] || model.displayName,
            description: model.contextWindow
                ? `${model.contextWindow >= 1000000 ? `${(model.contextWindow / 1000000).toFixed(0)}M` : model.contextWindow >= 1000 ? `${(model.contextWindow / 1000).toFixed(0)}K` : model.contextWindow} context`
                : undefined,
            group: specialOptions.length > 0 && filteredModels.length > 0 ? "models" : undefined,
            keywords: [model.apiName, model.displayName],
        }));

        const allOpts = [...specialOpts, ...modelOpts];
        const grps: SelectorGroup[] | undefined =
            specialOptions.length > 0 && filteredModels.length > 0
                ? [{ id: "special" }, { id: "models" }]
                : undefined;

        return { options: allOpts, groups: grps };
    }, [specialOptions, filteredModels, aliases, showProviderBadge]);

    // Resolve display name for the trigger
    const getDisplayName = () => {
        const special = specialOptions.find((opt) => opt.value === selectedModel);
        if (special) return special.label;
        if (selectedModel && aliases[selectedModel]) return aliases[selectedModel];
        const model = models.find((m) => m.apiName === selectedModel);
        if (model) return model.displayName;
        return selectedModel || placeholder;
    };

    return (
        <>
            <UnifiedSelector
                value={selectedModel}
                onChange={onModelSelect}
                options={options}
                groups={groups}
                triggerVariant={variant}
                triggerSize={size}
                popoverWidth="w-[340px]"
                searchable={filteredModels.length > 5}
                searchPlaceholder="Buscar modelos…"
                emptyMessage={loading ? "Cargando modelos..." : "No hay modelos disponibles"}
                customTriggerLabel={
                    <span className="truncate flex-1 text-left">
                        {getDisplayName()}
                    </span>
                }
                triggerClassName={className}
                renderItem={(option, isSelected) => {
                    const model = modelLookup.get(option.value);

                    if (model) {
                        const provider = getSourceProvider(model);
                        const badge = showProviderBadge
                            ? getBadgeForProvider(provider, getSourceProviderLabel(model))
                            : null;
                        return (
                            <div className="flex items-center gap-2 w-full">
                                <div className="flex-1 min-w-0">
                                    <ModelItemContent model={model} />
                                </div>
                                {badge && (
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${badge.bg} ${badge.text}`}>
                                        {badge.label}
                                    </span>
                                )}
                            </div>
                        );
                    }
                    // Special option — standard render
                    return (
                        <div className="flex flex-col gap-0 flex-1 min-w-0 overflow-hidden">
                            <span className="truncate">{option.label}</span>
                            {option.description && (
                                <span className="typo-caption truncate leading-tight">
                                    {option.description}
                                </span>
                            )}
                        </div>
                    );
                }}
            />
        </>
    );
}
