import { useMemo } from "react";
import { type LanguageModel } from "@/ipc/types";
import { ModelItemContent } from "@/components/ModelItemContent";
import { useSettings } from "@/hooks/useSettings";
import { useModelAliases } from "@/hooks/useModelAliases";
import { DEFAULT_ENABLED_MODELS } from "@/ipc/shared/language_model_constants";
import { UnifiedSelector, type SelectorOption, type SelectorGroup } from "@/components/ui/UnifiedSelector";

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

    // Build a lookup for display names
    const modelLookup = useMemo(() => {
        const map = new Map<string, LanguageModel>();
        for (const m of models) map.set(m.apiName, m);
        return map;
    }, [models]);

    // Build options for UnifiedSelector — special first, then models
    const options: SelectorOption[] = useMemo(() => {
        const specialOpts: SelectorOption[] = specialOptions.map((opt) => ({
            value: opt.value,
            label: opt.label,
            description: opt.description,
            group: specialOptions.length > 0 && filteredModels.length > 0 ? "special" : undefined,
        }));

        const modelOpts: SelectorOption[] = filteredModels.map((model) => ({
            value: model.apiName,
            label: aliases[model.apiName] || model.displayName,
            description: model.contextWindow
                ? `${model.contextWindow >= 1000000 ? `${(model.contextWindow / 1000000).toFixed(0)}M` : model.contextWindow >= 1000 ? `${(model.contextWindow / 1000).toFixed(0)}K` : model.contextWindow} context`
                : undefined,
            group: specialOptions.length > 0 && filteredModels.length > 0 ? "models" : undefined,
            keywords: [model.apiName, model.displayName],
        }));

        return [...specialOpts, ...modelOpts];
    }, [specialOptions, filteredModels, aliases]);

    // Groups (only if both special and models exist)
    const groups: SelectorGroup[] | undefined = useMemo(() => {
        if (specialOptions.length > 0 && filteredModels.length > 0) {
            return [
                { id: "special" },
                { id: "models" },
            ];
        }
        return undefined;
    }, [specialOptions.length, filteredModels.length]);

    // Resolve display name for the trigger
    const getDisplayName = () => {
        const special = specialOptions.find((opt) => opt.value === selectedModel);
        if (special) return special.label;
        // Check alias first
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
                popoverWidth="w-[300px]"
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
                        return (
                            <ModelItemContent
                                model={model}
                            />
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
