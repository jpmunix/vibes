import * as React from "react";
import { useState, useRef, useEffect } from "react";
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
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Check, ChevronDown } from "@/components/ui/icons";

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SelectorOption {
  /** Unique value used for selection */
  value: string;
  /** Display label */
  label: string;
  /** Optional subtitle shown below the label */
  description?: string;
  /** Icon rendered to the left of the label */
  leftIcon?: React.ReactNode;
  /** Icon/button rendered to the right — use for info/delete actions */
  rightIcon?: React.ReactNode;
  /** Callback when rightIcon is clicked (isolated from row selection) */
  rightAction?: (e: React.MouseEvent) => void;
  /** Extra search keywords (not displayed) */
  keywords?: string[];
  /** If true the item is rendered as disabled */
  disabled?: boolean;
  /** Optional group this item belongs to */
  group?: string;
}

export interface SelectorGroup {
  /** Group identifier (matches SelectorOption.group) */
  id: string;
  /** Display heading */
  heading?: string;
}

export interface UnifiedSelectorProps {
  /* ── Data ────────────────────────────────────────────────────────────── */
  value: string | undefined;
  onChange: (value: string) => void;
  options: SelectorOption[];
  /** Optional grouping definitions. Items with matching `group` are grouped. */
  groups?: SelectorGroup[];

  /* ── Trigger ─────────────────────────────────────────────────────────── */
  /** Placeholder when nothing is selected */
  placeholder?: string;
  /**
   * Visual style of the trigger button:
   *  - "default"  → outlined, neutral bg
   *  - "pill"     → primary bg, bold text, rounded
   *  - "ghost"    → no border, transparent
   *  - "minimal"  → compact inline, icon-only capable
   */
  triggerVariant?: "default" | "pill" | "ghost" | "minimal" | "inline";
  triggerSize?: "xs" | "sm" | "md";
  /** Additional classes for the trigger */
  triggerClassName?: string;
  /** Override the entire trigger label render */
  customTriggerLabel?: React.ReactNode;
  /** Icon on the left side of the trigger */
  triggerLeftIcon?: React.ReactNode;
  /**
   * Icon on the right side of the trigger.
   * Defaults to ChevronDown. Pass `null` to hide.
   */
  triggerRightIcon?: React.ReactNode | null;

  /* ── Popover / List ──────────────────────────────────────────────────── */
  /** Show a search/filter input at the top */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Callback fired when the search input value changes */
  onSearchChange?: (search: string) => void;
  emptyMessage?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  popoverWidth?: string;
  popoverMaxHeight?: string;
  /** Extra classes on PopoverContent */
  popoverClassName?: string;

  /* ── Items ───────────────────────────────────────────────────────────── */
  /** Show a checkmark on the selected item */
  showCheckmark?: boolean;
  /**
   * Layout of each item row:
   * - "default"  → label + description stacked vertically
   * - "compact"  → label only, single line
   * - "custom"   → full control via renderItem
   */
  itemLayout?: "default" | "compact" | "custom";
  /** Custom renderer per item (overrides itemLayout) */
  renderItem?: (option: SelectorOption, isSelected: boolean) => React.ReactNode;

  /* ── Extras ──────────────────────────────────────────────────────────── */
  /** Footer content below the list (e.g. "Create new…" button) */
  footer?: React.ReactNode;
  /** Header content above the list (e.g. a heading label) */
  header?: React.ReactNode;
  /** data-testid on the trigger */
  "data-testid"?: string;
  /** Controlled open state */
  open?: boolean;
  className?: string;
  /** Whether to disable the font-bold formatting on selected items */
  disableBoldSelection?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Trigger size presets
 * ──────────────────────────────────────────────────────────────────────────── */

const SIZE_CLASSES: Record<NonNullable<UnifiedSelectorProps["triggerSize"]>, string> = {
  xs: "h-auto w-fit px-1.5 py-0.5 typo-micro gap-0.5",
  sm: "h-auto w-fit px-2.5 py-1 typo-select gap-1",
  md: "h-auto w-fit px-3 py-1.5 typo-select gap-2",
};

const VARIANT_CLASSES: Record<NonNullable<UnifiedSelectorProps["triggerVariant"]>, string> = {
  default:
    "border border-input bg-transparent hover:bg-muted/50 focus:bg-muted/50 rounded-md shadow-none transition-colors",
  pill:
    "border-0 bg-primary text-primary-foreground shadow-sm rounded-lg hover:brightness-110 transition-all duration-200",
  ghost:
    "border-0 bg-transparent hover:bg-muted/50 rounded-md transition-colors",
  minimal:
    "border border-input bg-transparent hover:bg-muted/50 rounded-md shadow-none transition-colors",
  inline:
    "border-0 bg-transparent hover:bg-muted/30 rounded-md transition-colors",
};

/* ────────────────────────────────────────────────────────────────────────────
 * Component
 * ──────────────────────────────────────────────────────────────────────────── */

export function UnifiedSelector({
  value,
  onChange,
  options,
  groups,
  placeholder = "Seleccionar…",
  triggerVariant = "default",
  triggerSize = "sm",
  triggerClassName,
  customTriggerLabel,
  triggerLeftIcon,
  triggerRightIcon,
  searchable = false,
  searchPlaceholder = "Buscar…",
  onSearchChange,
  emptyMessage = "Sin resultados",
  align: alignProp,
  side = "bottom",
  popoverWidth = "w-56",
  popoverMaxHeight = "max-h-[300px]",
  popoverClassName,
  showCheckmark: showCheckmarkProp,
  itemLayout = "default",
  renderItem,
  footer,
  header,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  className,
  disableBoldSelection = false,
  ...rest
}: UnifiedSelectorProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (!v && onSearchChange) {
      onSearchChange("");
    }
    if (isControlled) {
      controlledOnOpenChange?.(v);
    } else {
      setInternalOpen(v);
    }
  };

  /* ── Variant-driven defaults ─────────────────────────────────────────── */
  const isPill = triggerVariant === "pill";
  const isInline = triggerVariant === "inline";
  const align = alignProp ?? "start";
  const showCheckmark = showCheckmarkProp ?? (isPill ? true : false);
  const noTruncate = true; // Global forced behavior to avoid truncating

  // Resolve selected option for the trigger label
  const selectedOption = options.find((o) => o.value === value);

  // Build the trigger label
  const triggerLabel = customTriggerLabel ?? (
    <span className="flex-1 text-left whitespace-nowrap">
      {selectedOption?.label ?? placeholder}
    </span>
  );

  // Default right icon is a chevron (unless explicitly null or pill)
  const rightIcon =
    triggerRightIcon === null
      ? null
      : triggerRightIcon ?? (
          <ChevronDown
            size={triggerSize === "xs" ? 10 : 12}
            className="shrink-0 opacity-60"
          />
        );

  // Group items
  const hasGroups = groups && groups.length > 0;
  const ungroupedItems = hasGroups
    ? options.filter((o) => !o.group)
    : options;
  const groupedMap = new Map<string, SelectorOption[]>();
  if (hasGroups) {
    for (const opt of options) {
      if (opt.group) {
        const arr = groupedMap.get(opt.group) || [];
        arr.push(opt);
        groupedMap.set(opt.group, arr);
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center justify-between cursor-pointer",
            isInline 
              ? cn("px-1.5 py-0.5 gap-1", triggerSize === "xs" ? "typo-micro" : "typo-select") 
              : SIZE_CLASSES[triggerSize],
            VARIANT_CLASSES[triggerVariant],
            triggerClassName,
          )}
          data-testid={rest["data-testid"]}
        >
          {triggerLeftIcon && (
            <span className="shrink-0 flex items-center">{triggerLeftIcon}</span>
          )}
          {triggerLabel}
          {rightIcon && (
            <span className="shrink-0 flex items-center ml-0.5">
              {rightIcon}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        side={side}
        className={cn(
          popoverWidth ? popoverWidth.replace(/\bw-/g, "min-w-") : "",
          "w-max max-w-[90vw]",
          "p-0 overflow-hidden",
          popoverClassName,
        )}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command
          filter={(value, search, keywords) => {
            const haystack = [value, ...(keywords || [])].join(" ").toLowerCase();
            return haystack.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          {/* Optional header */}
          {header && (
            <div className="px-3 py-2 border-b border-border/40">
              {header}
            </div>
          )}

          {/* Optional search bar */}
          {searchable && (
            <CommandInput placeholder={searchPlaceholder} onValueChange={onSearchChange} />
          )}

          <CommandList className={popoverMaxHeight}>
            <CommandEmpty className="py-4 text-center typo-caption">
              {emptyMessage}
            </CommandEmpty>

            {/* Ungrouped items */}
            {!hasGroups && (
              <CommandGroup>
                {ungroupedItems.map((option) => (
                  <SelectorRow
                    key={option.value}
                    option={option}
                    isSelected={value === option.value}
                    showCheckmark={showCheckmark}
                    itemLayout={itemLayout}
                    renderItem={renderItem}
                    noTruncate={noTruncate}
                    disableBoldSelection={disableBoldSelection}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  />
                ))}
              </CommandGroup>
            )}

            {/* Grouped items */}
            {hasGroups &&
              groups!.map((group, gi) => {
                const items = groupedMap.get(group.id) || [];
                if (items.length === 0) return null;
                return (
                  <React.Fragment key={group.id}>
                    {gi > 0 && <CommandSeparator />}
                    <CommandGroup heading={group.heading}>
                      {items.map((option) => (
                        <SelectorRow
                          key={option.value}
                          option={option}
                          isSelected={value === option.value}
                          showCheckmark={showCheckmark}
                          itemLayout={itemLayout}
                          renderItem={renderItem}
                          noTruncate={noTruncate}
                          disableBoldSelection={disableBoldSelection}
                          onSelect={() => {
                            onChange(option.value);
                            setOpen(false);
                          }}
                        />
                      ))}
                    </CommandGroup>
                  </React.Fragment>
                );
              })}
          </CommandList>

          {/* Optional footer */}
          {footer && (
            <div className="border-t border-border/40 p-1">{footer}</div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SelectorRow — individual item inside the list
 * ──────────────────────────────────────────────────────────────────────────── */

function SelectorRow({
  option,
  isSelected,
  showCheckmark,
  itemLayout,
  renderItem,
  noTruncate,
  disableBoldSelection,
  onSelect,
}: {
  option: SelectorOption;
  isSelected: boolean;
  showCheckmark: boolean;
  itemLayout: "default" | "compact" | "custom";
  renderItem?: (option: SelectorOption, isSelected: boolean) => React.ReactNode;
  noTruncate?: boolean;
  disableBoldSelection?: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      value={option.value}
      keywords={[option.label, ...(option.keywords || []), option.description || ""]}
      onSelect={onSelect}
      disabled={option.disabled}
      className={cn(
        "cursor-pointer typo-dropdown",
        isSelected && "bg-primary/8",
        isSelected && !disableBoldSelection && "!font-bold",
      )}
    >
      {/* Checkmark column */}
      {showCheckmark && (
        <span className="w-4 shrink-0 flex items-center justify-center">
          {isSelected && <Check size={14} className="text-primary" />}
        </span>
      )}

      {/* Left icon */}
      {option.leftIcon && (
        <span className="shrink-0 flex items-center">{option.leftIcon}</span>
      )}

      {/* Content */}
      {renderItem ? (
        renderItem(option, isSelected)
      ) : itemLayout === "compact" ? (
        <span className={cn("flex-1", !noTruncate ? "truncate" : "whitespace-nowrap")}>
          {option.label}
        </span>
      ) : (
        <div className={cn("flex flex-col gap-0 flex-1 min-w-0")}>
          <span className={cn(!noTruncate ? "truncate" : "whitespace-nowrap")}>
            {option.label}
          </span>
          {option.description && (
            <span className={cn("typo-caption leading-tight opacity-80", !noTruncate ? "truncate" : "whitespace-nowrap")}>
              {option.description}
            </span>
          )}
        </div>
      )}

      {/* Right icon / action */}
      {option.rightIcon && (
        <span
          className="shrink-0 flex items-center ml-auto"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            option.rightAction?.(e);
          }}
        >
          {option.rightIcon}
        </span>
      )}
    </CommandItem>
  );
}
