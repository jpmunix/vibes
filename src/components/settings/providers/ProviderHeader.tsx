import React from "react";
import { cn } from "@/lib/utils";
import { ChevronRight } from "@/components/ui/icons";

interface ProviderHeaderProps {
  name: string;
  /** Whether the provider is currently enabled */
  enabled: boolean;
  /** Toggle callback — null means toggle is not available */
  onToggle: ((enabled: boolean) => void) | null;
  /** Whether the section is expanded */
  expanded: boolean;
  onToggleExpand: () => void;
  /** Optional status indicator */
  statusDot?: "online" | "offline" | "checking" | null;
  /** Optional subtitle text */
  subtitle?: string;
  /** If true, toggle is disabled (safeguard: can't disable last provider) */
  toggleDisabled?: boolean;
  /** Extra content on the right (e.g. delete button) */
  rightActions?: React.ReactNode;
}

export function ProviderHeader({
  name,
  enabled,
  onToggle,
  expanded,
  onToggleExpand,
  statusDot,
  subtitle,
  toggleDisabled,
  rightActions,
}: ProviderHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between cursor-pointer group p-4 rounded-t-xl transition-colors gap-3",
        expanded ? "bg-muted/30" : "rounded-b-xl hover:bg-muted/30",
      )}
      onClick={onToggleExpand}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Status dot */}
        {statusDot && (
          <div
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              statusDot === "online" && "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]",
              statusDot === "offline" && "bg-red-400",
              statusDot === "checking" && "bg-muted-foreground/40 animate-pulse",
            )}
          />
        )}
        {/* Name */}
        <h3 className="typo-label font-semibold truncate">{name}</h3>
        {subtitle && (
          <span className="typo-caption text-muted-foreground/60 truncate hidden sm:block">
            {subtitle}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {rightActions}
        {/* Enable/disable toggle — badge/pill style */}
        {onToggle && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border"
          >
            {([false, true] as const).map((value) => (
              <button
                key={String(value)}
                disabled={value === false && toggleDisabled}
                onClick={() => {
                  if (value === false && toggleDisabled) return;
                  onToggle(value);
                }}
                className={cn(
                  "px-3 py-1 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer text-xs",
                  enabled === value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-primary/10",
                  value === false && toggleDisabled && "opacity-40 cursor-not-allowed",
                )}
                title={value === false && toggleDisabled ? "No puedes desactivar todos los proveedores" : undefined}
              >
                {value ? "Activado" : "Desactivado"}
              </button>
            ))}
          </div>
        )}
        {/* Expand chevron */}
        <ChevronRight
          className={cn(
            "size-4 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
            expanded && "rotate-90",
          )}
        />
      </div>
    </div>
  );
}
