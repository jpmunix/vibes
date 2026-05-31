import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
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
import { Check, ChevronDown } from "@/components/ui/icons";
import type { LanguageModel } from "@/ipc/types";
import {
  ModelFiltersPanel,
  type ModelFilters,
} from "@/components/ModelFiltersPanel";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ModelVariantPickerProps {
  /** All model entries (already sorted & filtered) */
  models: Array<{ provider: string; model: LanguageModel }>;
  /** Currently selected model value as "provider|||apiName" */
  selectedValue: string;
  /** Called when user selects a model */
  onModelSelect: (value: string) => void;
  /** Custom trigger content */
  triggerContent: React.ReactNode;
  /** Render function for each model item */
  renderModelItem: (
    model: { provider: string; model: LanguageModel },
    isSelected: boolean,
  ) => React.ReactNode;
  /** Search state */
  searchPlaceholder?: string;
  onSearchChange?: (search: string) => void;
  emptyMessage?: string;
  /** Optional map of modelApiName → user-defined alias (for search keywords) */
  modelAliases?: Record<string, string>;
  /** Filter state */
  filters: ModelFilters;
  onFiltersChange: (filters: ModelFilters) => void;
  /** Available providers for the filter panel */
  availableProviders: { id: string; label: string }[];
  /** Total count of models before filtering (for filter panel display) */
  totalModelCount: number;
  /** Current OpenRouter variant suffix */
  selectedVariant?: string;
  /** Called when user changes the variant */
  onVariantChange?: (suffix: string) => void;
  /** Whether to show the variant selector */
  showVariants?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ModelVariantPicker({
  models,
  selectedValue,
  onModelSelect,
  triggerContent,
  renderModelItem,
  searchPlaceholder = "Buscar modelos...",
  onSearchChange,
  emptyMessage = "Sin resultados",
  filters,
  onFiltersChange,
  availableProviders,
  totalModelCount,
  selectedVariant,
  onVariantChange,
  showVariants,
}: ModelVariantPickerProps) {
  const [open, setOpen] = useState(false);
  // Controlled search value — must be managed here so we can reset it on close/select
  const [localSearch, setLocalSearch] = useState("");

  const handleModelSelect = useCallback(
    (value: string) => {
      onModelSelect(value);
      setLocalSearch("");
      onSearchChange?.("");
      setOpen(false);
    },
    [onModelSelect, onSearchChange],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setLocalSearch("");
          onSearchChange?.("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center justify-between cursor-pointer",
            "h-auto w-fit px-2.5 py-1 typo-select gap-1",
            "border-0 bg-primary text-primary-foreground shadow-sm rounded-lg hover:brightness-110 transition-all duration-200",
            "!bg-primary/20 !text-primary !border-primary/20 hover:!bg-primary/30",
          )}
        >
          {triggerContent}
          <span className="shrink-0 flex items-center ml-0.5">
            <ChevronDown size={12} className="shrink-0 opacity-60" />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="center"
        side="top"
        className="min-w-[660px] w-max max-w-[90vw] p-0 overflow-hidden"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex" style={{ height: "min(400px, 65vh)" }}>
          {/* ── Left panel: Model list ──────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col border-r border-border/40">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={searchPlaceholder}
                value={localSearch}
                onValueChange={(v) => {
                  setLocalSearch(v);
                  onSearchChange?.(v);
                }}
              />
              <CommandList className="max-h-none flex-1 overflow-y-auto">
                {models.length === 0 && (
                  <div className="py-4 text-center typo-caption">
                    {emptyMessage}
                  </div>
                )}
                <CommandGroup>
                  {models.map(({ provider, model }) => {
                    const value = `${provider}|||${model.apiName}`;
                    const isSelected = selectedValue === value;
                    return (
                      <CommandItem
                        key={value}
                        value={value}
                        onSelect={() => handleModelSelect(value)}
                        className={cn(
                          "cursor-pointer typo-dropdown",
                          isSelected && "bg-primary/8 !font-bold",
                        )}
                      >
                        <span className="w-4 shrink-0 flex items-center justify-center">
                          {isSelected && (
                            <Check size={14} className="text-primary" />
                          )}
                        </span>
                        {renderModelItem({ provider, model }, isSelected)}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>

          {/* ── Right panel: Filters ────────────────────────────── */}
          <div className="w-[280px] shrink-0 flex flex-col bg-muted/20">
            <ModelFiltersPanel
              filters={filters}
              onChange={onFiltersChange}
              availableProviders={availableProviders}
              filteredCount={models.length}
              totalCount={totalModelCount}
              selectedVariant={selectedVariant}
              onVariantChange={onVariantChange}
              showVariants={showVariants}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
