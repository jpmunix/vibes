import { Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";

/**
 * Curated color palette for the primary accent color.
 * Each entry has:
 *  - id: unique key
 *  - name: display name  
 *  - preview: hex color for the swatch circle
 *  - light: oklch value for light mode
 *  - dark: oklch value for dark mode (slightly lower chroma for comfort)
 */
export const COLOR_PALETTE = [
    // Row 1 — Warm reds / oranges / yellows
    { id: "coral", name: "Coral", preview: "#F87171", light: "oklch(0.65 0.20 25)", dark: "oklch(0.62 0.15 25)" },
    { id: "tomato", name: "Tomate", preview: "#EF4444", light: "oklch(0.58 0.23 27)", dark: "oklch(0.55 0.18 27)" },
    { id: "orange", name: "Naranja", preview: "#F97316", light: "oklch(0.65 0.22 50)", dark: "oklch(0.62 0.17 50)" },
    { id: "amber", name: "Ámbar", preview: "#F59E0B", light: "oklch(0.72 0.19 75)", dark: "oklch(0.68 0.15 75)" },
    { id: "yellow", name: "Amarillo", preview: "#EAB308", light: "oklch(0.76 0.17 90)", dark: "oklch(0.72 0.14 90)" },
    { id: "lime", name: "Lima", preview: "#84CC16", light: "oklch(0.72 0.18 130)", dark: "oklch(0.68 0.14 130)" },
    { id: "green", name: "Verde", preview: "#22C55E", light: "oklch(0.65 0.19 155)", dark: "oklch(0.62 0.15 155)" },
    { id: "emerald", name: "Esmeralda", preview: "#10B981", light: "oklch(0.62 0.17 165)", dark: "oklch(0.60 0.13 165)" },

    // Row 2 — Teals / Cyans / Blues
    { id: "teal", name: "Turquesa", preview: "#14B8A6", light: "oklch(0.62 0.14 180)", dark: "oklch(0.60 0.11 180)" },
    { id: "cyan", name: "Cian", preview: "#06B6D4", light: "oklch(0.64 0.15 200)", dark: "oklch(0.62 0.12 200)" },
    { id: "sky", name: "Cielo", preview: "#0EA5E9", light: "oklch(0.60 0.16 230)", dark: "oklch(0.58 0.12 230)" },
    { id: "blue", name: "Azul", preview: "#3B82F6", light: "oklch(0.55 0.20 260)", dark: "oklch(0.58 0.12 260)" },
    { id: "indigo", name: "Índigo", preview: "#6366F1", light: "oklch(0.52 0.20 275)", dark: "oklch(0.56 0.14 275)" },
    { id: "violet", name: "Violeta", preview: "#8B5CF6", light: "oklch(0.54 0.22 285)", dark: "oklch(0.57 0.14 285)" },
    { id: "purple", name: "Púrpura", preview: "#7C3AED", light: "oklch(0.59 0.16 288)", dark: "oklch(0.58 0.13 288)" },
    { id: "fuchsia", name: "Fucsia", preview: "#D946EF", light: "oklch(0.60 0.24 310)", dark: "oklch(0.58 0.18 310)" },

    // Row 3 — Pinks / Roses / Neutrals
    { id: "pink", name: "Rosa", preview: "#EC4899", light: "oklch(0.58 0.22 340)", dark: "oklch(0.58 0.16 340)" },
    { id: "rose", name: "Rosado", preview: "#F43F5E", light: "oklch(0.58 0.23 355)", dark: "oklch(0.56 0.17 355)" },
    { id: "slate", name: "Pizarra", preview: "#64748B", light: "oklch(0.50 0.03 260)", dark: "oklch(0.55 0.03 260)" },
    { id: "zinc", name: "Zinc", preview: "#71717A", light: "oklch(0.50 0.01 0)", dark: "oklch(0.55 0.01 0)" },
] as const;

export type ColorId = typeof COLOR_PALETTE[number]["id"];

/** Default colors */
export const DEFAULT_LIGHT_COLOR = "purple";
export const DEFAULT_DARK_COLOR = "blue";

export function getColorById(id: string) {
    return COLOR_PALETTE.find(c => c.id === id);
}

/**
 * Adjust the chroma component of an oklch() string by a factor (0–1).
 * E.g. adjustChroma("oklch(0.59 0.16 288)", 0.5) → "oklch(0.59 0.080 288)"
 */
export function adjustChroma(oklchStr: string, factor: number): string {
    const match = oklchStr.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
    if (!match) return oklchStr;
    const [, l, c, h] = match;
    return `oklch(${l} ${(parseFloat(c) * factor).toFixed(3)} ${h})`;
}

interface PrimaryColorPickerProps {
    selectedColor: string;
    onColorSelect: (colorId: string) => void;
    label?: string;
    description?: string;
    /** Controls text colors explicitly — use 'dark' when the picker sits on a dark container */
    variant?: "light" | "dark";
    defaultColor?: string;
    /** Chroma factor 0–100 (default 100 = full saturation) */
    chroma?: number;
    onChromaChange?: (chroma: number) => void;
}

export function PrimaryColorPicker({
    selectedColor,
    onColorSelect,
    label,
    variant = "light",
    defaultColor,
    chroma = 100,
    onChromaChange,
}: PrimaryColorPickerProps) {
    const isDarkVariant = variant === "dark";
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const selectedEntry = getColorById(selectedColor) || COLOR_PALETTE[0];

    // Close on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsOpen(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => setIsOpen(false), 100);
    };

    return (
        <div
            ref={containerRef}
            className="relative inline-block"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Compact trigger — label + dot */}
            <button
                type="button"
                onClick={() => setIsOpen(o => !o)}
                className={cn(
                    "flex flex-col items-center gap-2 px-5 py-3 rounded-xl transition-all duration-200 cursor-pointer select-none",
                    "hover:bg-foreground/5",
                    isOpen && "bg-foreground/5",
                )}
            >
                {label && (
                    <span className={cn(
                        "text-xs font-bold uppercase tracking-widest",
                        isDarkVariant ? "text-zinc-400" : "text-muted-foreground/60",
                    )}>
                        {label}
                    </span>
                )}
                <div className="flex items-center gap-2.5">
                    <div
                        className="w-6 h-6 rounded-full ring-2 ring-offset-2 ring-offset-background shadow-md transition-transform duration-200"
                        style={{
                            backgroundColor: selectedEntry.preview,
                            "--tw-ring-color": selectedEntry.preview,
                        } as React.CSSProperties}
                    />
                    <span className={cn(
                        "text-sm font-semibold",
                        isDarkVariant ? "text-white" : "text-foreground",
                    )}>
                        {selectedEntry.name}
                    </span>
                </div>
            </button>

            {/* Expandable palette popover */}
            <div
                className={cn(
                    "absolute z-50 left-0 top-full mt-2",
                    "bg-popover border border-border rounded-2xl shadow-2xl",
                    "p-5 origin-top-left",
                    "transition-all duration-200 ease-out",
                    isOpen
                        ? "opacity-100 scale-100 pointer-events-auto translate-y-0"
                        : "opacity-0 scale-95 pointer-events-none -translate-y-1",
                )}
                style={{ width: "max-content" }}
            >
                <div className="grid grid-cols-5 gap-4">
                    {COLOR_PALETTE.map((color) => {
                        const isSelected = selectedColor === color.id;
                        return (
                            <button
                                key={color.id}
                                onClick={() => {
                                    onColorSelect(color.id);
                                    // Keep open briefly so user sees the feedback
                                    setTimeout(() => setIsOpen(false), 250);
                                }}
                                title={color.name}
                                className={cn(
                                    "w-8 h-8 rounded-full transition-all duration-150 flex items-center justify-center cursor-pointer",
                                    "hover:scale-110 hover:ring-2 hover:ring-offset-2 hover:ring-offset-background",
                                    isSelected
                                        ? "ring-2 ring-offset-2 ring-offset-background scale-110"
                                        : "hover:ring-foreground/30",
                                )}
                                style={{
                                    backgroundColor: color.preview,
                                    ...(isSelected ? { ["--tw-ring-color" as string]: color.preview } : {}),
                                }}
                            >
                                {isSelected && (
                                    <Check
                                        size={14}
                                        strokeWidth={3}
                                        className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Chroma / saturation slider */}
                {onChromaChange && (
                    <div className="mt-4 pt-4 border-t border-border">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                                Intensidad
                            </span>
                            <span className="text-[10px] font-mono font-bold text-muted-foreground/40">
                                {chroma}%
                            </span>
                        </div>
                        <input
                            type="range"
                            min="20"
                            max="100"
                            step="5"
                            value={chroma}
                            onChange={(e) => onChromaChange(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                        />
                        <div className="flex justify-between mt-1">
                            <span className="text-[9px] text-muted-foreground/30">Suave</span>
                            <span className="text-[9px] text-muted-foreground/30">Vívido</span>
                        </div>
                    </div>
                )}

                {defaultColor && (
                    <div className={cn("mt-4 pt-4 border-t border-border flex justify-center", !onChromaChange && "mt-4")}>
                        <button
                            type="button"
                            onClick={() => {
                                onColorSelect(defaultColor);
                                if (onChromaChange) onChromaChange(100);
                                setIsOpen(false);
                            }}
                            className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted"
                        >
                            <RotateCcw size={12} />
                            Restablecer
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

