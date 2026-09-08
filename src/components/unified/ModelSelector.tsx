import React, { useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { UnifiedSelector, type SelectorOption } from "@/components/ui/UnifiedSelector";
import { ModelItemContent } from "@/components/ModelItemContent";
import type { LanguageModel } from "@/ipc/types";
import type { MultiProviderModel } from "@/hooks/useMultiProviderModels";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/hooks/useSettings";

/** Accepts either enriched multi-provider models or plain language models (admin fetches flat). */
export type AnyModel = MultiProviderModel | LanguageModel;

function getSourceProvider(m: AnyModel): string {
  return (m as MultiProviderModel).sourceProvider ?? "openrouter";
}
function getSourceLabel(m: AnyModel): string {
  const mp = m as MultiProviderModel;
  if (mp.sourceProviderLabel) return mp.sourceProviderLabel;
  if (mp.sourceProvider) return mp.sourceProvider === "openrouter" ? "OpenRouter" : mp.sourceProvider;
  return "OpenRouter";
}

function toOption(m: AnyModel): SelectorOption {
  return {
    value: m.apiName,
    label: m.displayName || m.apiName,
    description: m.description,
    group: getSourceProvider(m),
    keywords: [getSourceLabel(m), getSourceProvider(m)],
  };
}

export interface ModelSelectorProps {
  value: string | undefined;
  onChange: (value: string) => void;
  models: AnyModel[];
  loading?: boolean;
  placeholder?: string;
  specialOptions?: Array<{ value: string; label: string; description?: string }>;
  disableEnabledFilter?: boolean;
  showProviderBadge?: boolean;
  variant?: "default" | "pill" | "pillSoft" | "ghost" | "minimal" | "inline";
  size?: "xs" | "sm" | "md";
  className?: string;
  rightPanel?: React.ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearchChange?: (search: string) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  popoverMaxHeight?: string;
  /** Controlled open state — forwarded to UnifiedSelector (#VIBES-204). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ModelSelector({
  value,
  onChange,
  models,
  loading = false,
  placeholder,
  specialOptions,
  disableEnabledFilter = false,
  showProviderBadge = false,
  variant = "pillSoft",
  size = "sm",
  className,
  rightPanel,
  searchable = true,
  searchPlaceholder,
  onSearchChange,
  align,
  side,
  popoverMaxHeight,
  open,
  onOpenChange,
}: ModelSelectorProps) {
  const { t } = useI18n();
  const { settings } = useSettings();

  const visibleModels = useMemo(() => {
    if (disableEnabledFilter) return models;
    const enabled = settings?.enabledModels;
    if (!enabled || enabled.length === 0) return models;
    return models.filter((m) => enabled.includes(m.apiName));
  }, [models, disableEnabledFilter, settings?.enabledModels]);

  const groups = useMemo(() => {
    const map = new Map<string, SelectorOption[]>();
    for (const m of visibleModels) {
      const opt = toOption(m);
      const arr = map.get(getSourceProvider(m)) || [];
      arr.push(opt);
      map.set(getSourceProvider(m), arr);
    }
    const order = ["openrouter", "ollama"];
    const customKeys = [...map.keys()].filter((k) => !order.includes(k) && k !== "auto-router");
    const sortedKeys = [
      ...order.filter((k) => map.has(k)),
      ...customKeys.sort(),
      ...(map.has("auto-router") ? ["auto-router"] : []),
    ];
    return sortedKeys.map((k) => ({
      id: k,
      heading: k === "openrouter" ? "OpenRouter" : k === "ollama" ? "Ollama" : k === "auto-router" ? "Auto" : (map.get(k)?.[0]?.keywords?.[0] || k),
    }));
  }, [visibleModels]);

  const allOptions = useMemo<SelectorOption[]>(() => {
    const specials: SelectorOption[] = (specialOptions || []).map((s) => ({
      value: s.value,
      label: s.label,
      description: s.description,
      keywords: [s.label, s.description || ""],
    }));
    return [...specials, ...visibleModels.map((m) => toOption(m))];
  }, [specialOptions, visibleModels]);

  // Índice apiName → modelo. renderItem se llama UNA VEZ POR FILA, y antes hacía
  // un find() lineal sobre visibleModels: O(n²) por apertura (con 400 modelos,
  // ~160.000 comparaciones de string). Con el Map es O(1) por fila.
  const modelsByApiName = useMemo(() => {
    const map = new Map<string, AnyModel>();
    for (const m of visibleModels) map.set(m.apiName, m);
    return map;
  }, [visibleModels]);

  const specialValues = useMemo(
    () => new Set((specialOptions || []).map((s) => s.value)),
    [specialOptions],
  );

  const renderItem = useCallback((option: SelectorOption, isSelected: boolean) => {
    if (specialValues.has(option.value)) {
      return (
        <div className="flex flex-col gap-0 flex-1 min-w-0">
          <span className={cn("font-medium", isSelected && "!font-bold")}>{option.label}</span>
          {option.description && <span className="typo-caption leading-tight opacity-80">{option.description}</span>}
        </div>
      );
    }
    const model = modelsByApiName.get(option.value);
    if (!model) return null;
    const sp = getSourceProvider(model);
    const sl = getSourceLabel(model);
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 min-w-0">
          <ModelItemContent
            model={model}
            isAutoRouter={sp === "auto-router"}
            showAutoRouterBadge={sp === "auto-router"}
            providerLabel={showProviderBadge || sp === "auto-router" ? sl : sp === "openrouter" ? undefined : sl}
            t={t}
          />
        </div>
      </div>
    );
  }, [modelsByApiName, specialValues, showProviderBadge, t]);

  return (
    <UnifiedSelector
      value={value}
      onChange={onChange}
      options={allOptions}
      groups={groups}
      triggerVariant={variant}
      triggerSize={size}
      triggerClassName={className}
      searchable={searchable}
      searchPlaceholder={searchPlaceholder ?? t("common.selectModel")}
      onSearchChange={onSearchChange}
      popoverWidth={rightPanel ? "w-[760px]" : "w-[440px]"}
      popoverStyle={rightPanel ? { minWidth: 760 } : { minWidth: 440 }}
      popoverMaxHeight={rightPanel ? undefined : popoverMaxHeight}
      align={align}
      side={side}
      rightPanel={rightPanel}
      disableInternalFilter
      itemLayout="custom"
      renderItem={renderItem}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
