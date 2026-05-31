import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Image, RotateCcw, Sparkles, Circle, Zap, Crosshair } from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Filter state type ───────────────────────────────────────────────────────

export type SortOption = "default" | "price_input" | "price_output" | "context";
export type SortOrder = "asc" | "desc";

export interface ModelFilters {
  /** true = only show models that accept image input */
  imageInput: boolean;
  /** true = show free models (default: true) */
  showFree: boolean;
  /** Context window filter step index (0=all, 1=≤64K, 2=≤256K, 3=>256K) */
  contextStep: number;
  /** Max input price step index (0=$0.25, 1=$0.5, 2=$1, 3=all). Higher = more permissive. */
  priceInputStep: number;
  /** Max output price step index (0=$1, 1=$2, 2=$5, 3=$10, 4=all). Higher = more permissive. */
  priceOutputStep: number;
  /** Excluded provider IDs (empty = none excluded = show all) */
  excludedProviders: string[];
  /** Sort by option */
  sortBy?: SortOption;
  /** Sort order option */
  sortOrder?: SortOrder;
}

// ─── Step definitions ────────────────────────────────────────────────────────

export const CONTEXT_STEPS = [
  { label: "Todos", filter: (_ctx: number) => true },
  { label: "64K", filter: (ctx: number) => ctx <= 64000 },
  { label: "256K", filter: (ctx: number) => ctx <= 256000 },
  { label: "256K+", filter: (ctx: number) => ctx > 256000 },
] as const;

export const INPUT_PRICE_STEPS = [
  { label: "$0.25", max: 0.25 },
  { label: "$0.5", max: 0.5 },
  { label: "$1", max: 1 },
  { label: "Todos", max: Infinity },
] as const;

export const OUTPUT_PRICE_STEPS = [
  { label: "$1", max: 1 },
  { label: "$2", max: 2 },
  { label: "$5", max: 5 },
  { label: "$10", max: 10 },
  { label: "Todos", max: Infinity },
] as const;

// ─── Default filters (100% permissive) ───────────────────────────────────────

export const DEFAULT_MODEL_FILTERS: ModelFilters = {
  imageInput: false,
  showFree: true,
  contextStep: 0, // "Todos"
  priceInputStep: INPUT_PRICE_STEPS.length - 1, // "Todos"
  priceOutputStep: OUTPUT_PRICE_STEPS.length - 1, // "Todos"
  excludedProviders: [],
  sortBy: "default",
  sortOrder: "desc",
};

// ─── Filter matching utility ─────────────────────────────────────────────────

function priceToPerMillion(pricePerToken: string | undefined): number | null {
  if (!pricePerToken) return null;
  const num = parseFloat(pricePerToken);
  if (isNaN(num)) return null;
  return num * 1_000_000;
}

export function modelPassesFilters(
  model: {
    pricingInput?: string;
    pricingOutput?: string;
    contextWindow?: number;
    inputModalities?: string[];
  },
  provider: string,
  filters: ModelFilters,
): boolean {
  // 1. Image input filter
  if (filters.imageInput) {
    if (!model.inputModalities?.includes("image")) return false;
  }

  // 1b. Free models filter: if showFree is explicitly false, hide free models
  if (filters.showFree === false) {
    const inPrice = model.pricingInput ? parseFloat(model.pricingInput) : 0;
    const outPrice = model.pricingOutput ? parseFloat(model.pricingOutput) : 0;
    const isFree = inPrice === 0 && outPrice === 0;
    if (isFree) return false;
  }

  // 2. Context window filter
  if (filters.contextStep > 0) {
    const ctx = model.contextWindow ?? 0;
    const step = CONTEXT_STEPS[filters.contextStep];
    if (step && !step.filter(ctx)) return false;
  }

  // 3. Input price filter (skip if at max = "Todos")
  if (filters.priceInputStep < INPUT_PRICE_STEPS.length - 1) {
    const perM = priceToPerMillion(model.pricingInput);
    if (perM !== null) {
      const maxPrice = INPUT_PRICE_STEPS[filters.priceInputStep].max;
      if (perM > maxPrice) return false;
    }
  }

  // 4. Output price filter (skip if at max = "Todos")
  if (filters.priceOutputStep < OUTPUT_PRICE_STEPS.length - 1) {
    const perM = priceToPerMillion(model.pricingOutput);
    if (perM !== null) {
      const maxPrice = OUTPUT_PRICE_STEPS[filters.priceOutputStep].max;
      if (perM > maxPrice) return false;
    }
  }

  // 5. Excluded provider filter
  if (filters.excludedProviders.length > 0) {
    if (filters.excludedProviders.includes(provider)) return false;
  }

  return true;
}

// ─── Check if filters are at default ─────────────────────────────────────────

export function isDefaultFilters(filters: ModelFilters): boolean {
  return (
    !filters.imageInput &&
    filters.showFree !== false &&
    filters.contextStep === 0 &&
    filters.priceInputStep === INPUT_PRICE_STEPS.length - 1 &&
    filters.priceOutputStep === OUTPUT_PRICE_STEPS.length - 1 &&
    filters.excludedProviders.length === 0 &&
    (filters.sortBy === "default" || !filters.sortBy)
  );
}

// ─── Premium Slider component ────────────────────────────────────────────────

function PremiumSlider({
  labels,
  value,
  onChange,
}: {
  labels: readonly string[];
  value: number;
  onChange: (step: number) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const max = labels.length - 1;
  const displayValue = hoveredIndex !== null ? hoveredIndex : value;

  // Active percentage (used for the physical position of the thumb)
  const activePercentage = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="space-y-1.5 px-0.5 group">
      {/* Slider track area */}
      <div className="relative h-4 flex items-center">
        {/* Segmented Track (cut and rounded pills) */}
        {max > 0 && (
          <div className="absolute inset-x-0 h-[4px] flex gap-[3px] pointer-events-none">
            {Array.from({ length: max }).map((_, i) => {
              const isActive = i < value;
              const isHovered = hoveredIndex !== null && i < hoveredIndex;

              let bgClass = "bg-border/60";
              if (hoveredIndex === null) {
                if (isActive) bgClass = "bg-primary/70";
              } else {
                if (isActive && isHovered) {
                  bgClass = "bg-primary/70";
                } else if (isActive && !isHovered) {
                  bgClass = "bg-primary/30";
                } else if (!isActive && isHovered) {
                  bgClass = "bg-primary/30";
                }
              }

              return (
                <div
                  key={i}
                  className={cn(
                    "flex-1 h-full rounded-full transition-colors duration-150",
                    bgClass,
                  )}
                />
              );
            })}
          </div>
        )}

        {/* Custom thumb */}
        <div
          className="absolute h-3.5 w-3.5 rounded-full bg-primary shadow-sm shadow-primary/30 ring-2 ring-background transition-all duration-150 z-10 pointer-events-none group-active:scale-110"
          style={{ left: `calc(${activePercentage}% - 7px)` }}
        />

        {/* Clickable Segments (Invisible hit areas) */}
        <div
          className="absolute inset-x-0 -inset-y-3 z-20 cursor-pointer"
          onMouseLeave={() => setHoveredIndex(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const pct = x / rect.width;
            let step = 0;
            if (max > 0) {
              if (pct < 0.05) {
                step = 0;
              } else {
                step = Math.floor(pct * max) + 1;
                step = Math.min(max, Math.max(1, step));
              }
            }
            setHoveredIndex(step);
          }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const pct = x / rect.width;
            let step = 0;
            if (max > 0) {
              if (pct < 0.05) {
                step = 0;
              } else {
                step = Math.floor(pct * max) + 1;
                step = Math.min(max, Math.max(1, step));
              }
            }
            onChange(step);
          }}
        />
      </div>
      {/* Labels */}
      <div className="flex justify-between px-0">
        {labels.map((label, i) => (
          <button
            key={i}
            type="button"
            className={cn(
              "text-[9px] font-medium transition-colors select-none cursor-pointer hover:text-primary bg-transparent border-0 p-0",
              i === displayValue ? "text-primary" : "text-muted-foreground/40",
            )}
            onClick={() => onChange(i)}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── FilterChip (kept for image + provider) ──────────────────────────────────

function FilterChip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-0.5 rounded-md text-[11px] font-medium transition-all duration-150 cursor-pointer",
        "border whitespace-nowrap",
        active
          ? "bg-primary/15 text-primary border-primary/30 shadow-sm shadow-primary/5"
          : "bg-muted/30 text-muted-foreground/60 border-transparent hover:bg-muted/60 hover:text-muted-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function FilterSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
        {label}
      </span>
      {children}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

interface ModelFiltersPanelProps {
  filters: ModelFilters;
  onChange: (filters: ModelFilters) => void;
  availableProviders: { id: string; label: string }[];
  filteredCount: number;
  totalCount: number;
  /** Current OpenRouter variant suffix (e.g. ":nitro", "" for standard) */
  selectedVariant?: string;
  /** Called when user changes the variant */
  onVariantChange?: (suffix: string) => void;
  /** Whether OpenRouter is among the available providers */
  showVariants?: boolean;
}

export function ModelFiltersPanel({
  filters,
  onChange,
  availableProviders,
  filteredCount,
  totalCount,
  selectedVariant = "",
  onVariantChange,
  showVariants = false,
}: ModelFiltersPanelProps) {
  const isDefault = useMemo(() => isDefaultFilters(filters), [filters]);
  const isFiltering = !isDefault;

  const toggleProvider = (id: string) => {
    const excluded = filters.excludedProviders;
    if (excluded.includes(id)) {
      // Re-include this provider
      onChange({
        ...filters,
        excludedProviders: excluded.filter((p) => p !== id),
      });
    } else {
      // Exclude this provider (but don't allow excluding ALL)
      const next = [...excluded, id];
      if (next.length >= availableProviders.length) return; // prevent excluding all
      onChange({ ...filters, excludedProviders: next });
    }
  };

  const resetFilters = () => {
    onChange({ ...DEFAULT_MODEL_FILTERS });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="typo-menu-header uppercase tracking-wider opacity-70">
            Filtros
          </span>
          {isFiltering && (
            <span className="px-1.5 py-0.5 rounded-sm bg-primary/15 text-primary border border-primary/20 text-[9px] font-semibold tracking-wider leading-none shadow-sm shadow-primary/5">
              {filteredCount} / {totalCount}
            </span>
          )}
        </div>
        {isFiltering && (
          <button
            type="button"
            onClick={resetFilters}
            className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
            title="Resetear filtros"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {/* Filter sections */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Sort */}
        <FilterSection label="Ordenar por">
          <Select
            value={
              filters.sortBy === "default" || !filters.sortBy
                ? "default"
                : `${filters.sortBy}-${filters.sortOrder}`
            }
            onValueChange={(val) => {
              if (val === "default") {
                onChange({ ...filters, sortBy: "default", sortOrder: "desc" });
              } else {
                const [by, order] = val.split("-");
                onChange({
                  ...filters,
                  sortBy: by as SortOption,
                  sortOrder: order as SortOrder,
                });
              }
            }}
          >
            <SelectTrigger className="w-full h-8 text-[11px] font-medium bg-muted/20 border-border/50">
              <SelectValue placeholder="Recomendados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Recomendados</SelectItem>
              <SelectItem value="price_input-asc">
                Precio entrada (Menor a mayor)
              </SelectItem>
              <SelectItem value="price_input-desc">
                Precio entrada (Mayor a menor)
              </SelectItem>
              <SelectItem value="price_output-asc">
                Precio salida (Menor a mayor)
              </SelectItem>
              <SelectItem value="price_output-desc">
                Precio salida (Mayor a menor)
              </SelectItem>
              <SelectItem value="context-desc">
                Contexto (Mayor a menor)
              </SelectItem>
              <SelectItem value="context-asc">
                Contexto (Menor a mayor)
              </SelectItem>
            </SelectContent>
          </Select>
        </FilterSection>

        {/* Opciones adicionales */}
        <FilterSection label="Opciones">
          <div className="flex flex-wrap gap-2">
            <FilterChip
              active={filters.imageInput}
              onClick={() =>
                onChange({ ...filters, imageInput: !filters.imageInput })
              }
            >
              <span className="flex items-center gap-1.5">
                <Image style={{ width: 10, height: 10 }} />
                Imagen
              </span>
            </FilterChip>
            <FilterChip
              active={filters.showFree !== false}
              onClick={() =>
                onChange({ ...filters, showFree: filters.showFree === false })
              }
            >
              <span className="flex items-center gap-1.5">
                <Sparkles style={{ width: 11, height: 11 }} />
                Modelos gratis
              </span>
            </FilterChip>
          </div>
        </FilterSection>

        {/* Input price — slider */}
        <FilterSection label="Precio entrada ($/M)">
          <PremiumSlider
            labels={INPUT_PRICE_STEPS.map((s) => s.label)}
            value={filters.priceInputStep}
            onChange={(step) => onChange({ ...filters, priceInputStep: step })}
          />
        </FilterSection>

        {/* Output price — slider */}
        <FilterSection label="Precio salida ($/M)">
          <PremiumSlider
            labels={OUTPUT_PRICE_STEPS.map((s) => s.label)}
            value={filters.priceOutputStep}
            onChange={(step) => onChange({ ...filters, priceOutputStep: step })}
          />
        </FilterSection>

        {/* Context — slider */}
        <FilterSection label="Contexto">
          <PremiumSlider
            labels={CONTEXT_STEPS.map((s) => s.label)}
            value={filters.contextStep}
            onChange={(step) => onChange({ ...filters, contextStep: step })}
          />
        </FilterSection>

        {/* Providers (only show if >1) */}
        {availableProviders.length > 1 && (
          <FilterSection label="Proveedores">
            <div className="flex flex-wrap gap-1">
              {availableProviders.map((prov) => (
                <FilterChip
                  key={prov.id}
                  active={!filters.excludedProviders.includes(prov.id)}
                  onClick={() => toggleProvider(prov.id)}
                >
                  {prov.label}
                </FilterChip>
              ))}
            </div>
          </FilterSection>
        )}
        {/* ── OpenRouter Variant ─────────────────────────────── */}
        {showVariants && onVariantChange && (
          <>
            <div className="my-1 border-t border-border/20" />
            <FilterSection label="Variante OpenRouter">
              <div className="space-y-0.5">
                {[
                  { suffix: "", label: "Estándar", desc: "Enrutamiento por defecto", Icon: Circle },
                  { suffix: ":nitro", label: "Nitro", desc: "Velocidad máxima", Icon: Zap },
                  { suffix: ":exacto", label: "Exacto", desc: "Tool-calling fiable", Icon: Crosshair },
                ].map(({ suffix, label, desc, Icon }) => {
                  const isActive = selectedVariant === suffix;
                  return (
                    <button
                      key={suffix}
                      type="button"
                      onClick={() => onVariantChange(suffix)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-all duration-150 cursor-pointer",
                        "border",
                        isActive
                          ? "bg-primary/8 border-primary/25 shadow-sm shadow-primary/5"
                          : "bg-transparent border-transparent hover:bg-muted/40",
                      )}
                    >
                      <div className={cn(
                        "w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-150",
                        isActive ? "border-primary" : "border-muted-foreground/30",
                      )}>
                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                      </div>
                      <Icon size={12} className={cn(
                        "shrink-0 transition-colors duration-150",
                        isActive ? "text-primary" : "text-muted-foreground/40",
                      )} />
                      <div className="min-w-0">
                        <div className={cn(
                          "text-[11px] font-semibold leading-tight transition-colors duration-150",
                          isActive ? "text-primary" : "text-foreground/70",
                        )}>{label}</div>
                        <div className="text-[9px] text-muted-foreground/50 leading-tight">{desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </FilterSection>
          </>
        )}
      </div>
    </div>
  );
}
