import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { UnifiedSelector, type SelectorOption } from "@/components/ui/UnifiedSelector";
import { ModelItemContent } from "@/components/ModelItemContent";
import type { MultiProviderModel } from "@/hooks/useMultiProviderModels";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/hooks/useSettings";

/**
 * Unified model selector — the ONE component that renders model pickers
 * everywhere (chat input, settings model selectors, admin prefs, playground).
 *
 * - value: the selected model's apiName (prefixed: `custom::id::name`, `ollama::name`,
 *   or plain OpenRouter `vendor/model`).
 * - models: MultiProviderModel[] from useMultiProviderModels (each carries sourceProvider
 *   + sourceProviderLabel).
 * - Groups models by provider with human headings (OpenRouter / Ollama / custom names).
 * - Supports specialOptions (e.g. the default/recommended model) rendered at the top.
 * - Optional rightPanel (e.g. ModelFiltersPanel) turns the popover into the wide
 *   two-pane layout used by the chat picker.
 */
export interface ModelSelectorProps {
  value: string | undefined;
  onChange: (value: string) => void;
  models: MultiProviderModel[];
  /** Optional loading state (shows placeholder while loading) */
  loading?: boolean;
  placeholder?: string;
  /** Optional special options rendered at the top (e.g. default/recommended model) */
  specialOptions?: Array<{
    value: string;
    label: string;
    description?: string;
  }>;
  /** Hide models that are not explicitly enabled in settings (enabledModels) */
  disableEnabledFilter?: boolean;
  /** Show the provider label next to each model (badge style like settings) */
  showProviderBadge?: boolean;
  /** Trigger style: "pillSoft" (chat, translucent), "pill" (solid), "default" (form) */
  variant?: "default" | "pill" | "pillSoft" | "ghost" | "minimal" | "inline";
  size?: "xs" | "sm" | "md";
  /** Extra trigger classes */
  className?: string;
  /** Optional right panel (e.g. ModelFiltersPanel) — turns popover into two-pane layout */
  rightPanel?: React.ReactNode;

  /* ── Search ─────────────────────────────────────────────────────────── */
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearchChange?: (search: string) => void;

  /* ── Misc ───────────────────────────────────────────────────────────── */
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  popoverMaxHeight?: string;
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
}: ModelSelectorProps) {
  const { t } = useI18n();
  const { settings } = useSettings();

  // ── Enabled filter (settings.enabledModels), disabled via prop ──────────
  const visibleModels = useMemo(() => {
    if (disableEnabledFilter) return models;
    const enabled = settings?.enabledModels;
    if (!enabled || enabled.length === 0) return models;
    return models.filter((m) => enabled.includes(m.apiName));
  }, [models, disableEnabledFilter, settings?.enabledModels]);

  // ── Option builder from a model ──────────────────────────────────────────
  const modelToOption = (m: MultiProviderModel): SelectorOption => ({
    value: m.apiName,
    label: m.displayName || m.apiName,
    description: m.description,
    // Provider is used for grouping + as a search keyword
    group: m.sourceProvider,
    keywords: [m.sourceProviderLabel, m.sourceProvider],
    // Provider badge rendered inside the item (when showProviderBadge)
    rightIcon: showProviderBadge ? (
      <span className="shrink-0 text-[9px] font-medium text-primary/70">
        {m.sourceProviderLabel}
      </span>
    ) : undefined,
  });

  // ── Group models by provider ────────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, SelectorOption[]>();
    for (const m of visibleModels) {
      const opt = modelToOption(m);
      const arr = map.get(m.sourceProvider) || [];
      arr.push(opt);
      map.set(m.sourceProvider, arr);
    }
    // Stable ordering: OpenRouter, then custom, then ollama
    const order = ["openrouter", "ollama"];
    const customKeys = [...map.keys()].filter(
      (k) => !order.includes(k) && k !== "auto-router",
    );
    const sortedKeys = [
      ...order.filter((k) => map.has(k)),
      ...customKeys.sort(),
      ...(map.has("auto-router") ? ["auto-router"] : []),
    ];
    return sortedKeys.map((k) => ({
      id: k,
      heading: providerHeading(k, map.get(k)?.[0]),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleModels, showProviderBadge]);

  function providerHeading(
    provider: string,
    sample?: SelectorOption,
  ): string {
    if (provider === "openrouter") return "OpenRouter";
    if (provider === "ollama") return "Ollama";
    if (provider === "auto-router") return "Auto";
    // Custom provider: use the human label from the sample model
    const label = sample?.keywords?.[0];
    return label || provider;
  }

  // ── Build options with special options first ────────────────────────────
  const allOptions = useMemo<SelectorOption[]>(() => {
    const specials: SelectorOption[] = (specialOptions || []).map((s) => ({
      value: s.value,
      label: s.label,
      description: s.description,
      keywords: [s.label, s.description || ""],
    }));
    return [...specials, ...visibleModels.map(modelToOption)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialOptions, visibleModels, t]);

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
      // UnificatedSelector rewrites "w-…" → "min-w-…"; pass the unprefixed form.
      popoverWidth={rightPanel ? "w-[660px]" : "w-[380px]"}
      popoverMaxHeight={rightPanel ? undefined : popoverMaxHeight}
      align={align}
      side={side}
      rightPanel={rightPanel}
      itemLayout="custom"
      renderItem={(option, isSelected) => {
        // Special options render with the standard label/description layout
        const isSpecial = (specialOptions || []).some(
          (s) => s.value === option.value,
        );
        if (isSpecial) {
          return (
            <div className="flex flex-col gap-0 flex-1 min-w-0">
              <span className={cn("font-medium", isSelected && "!font-bold")}>
                {option.label}
              </span>
              {option.description && (
                <span className="typo-caption leading-tight opacity-80">
                  {option.description}
                </span>
              )}
            </div>
          );
        }

        // Regular model: render the shared ultra-lightweight item content
        const model = visibleModels.find((m) => m.apiName === option.value);
        if (!model) return null;
        return (
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 min-w-0">
              <ModelItemContent
                model={model}
                isAutoRouter={model.sourceProvider === "auto-router"}
                showAutoRouterBadge={model.sourceProvider === "auto-router"}
                providerLabel={
                  showProviderBadge || model.sourceProvider === "auto-router"
                    ? model.sourceProviderLabel
                    : model.sourceProvider === "openrouter"
                      ? undefined
                      : model.sourceProviderLabel
                }
              />
            </div>
          </div>
        );
      }}
    />
  );
}
