import { Check, RotateCcw } from "@/components/ui/icons";
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
 *
 * Layout: 8 columns × 7 rows = 56 vibrant colors, organized by hue from
 * warm → cool → purple → pink, with a final row for pastels & neutrals.
 */
export const COLOR_PALETTE = [
    // Row 1 — Reds & Oranges (warm spectrum)
    { id: "red",        name: "Rojo",         preview: "#EF4444", light: "oklch(0.50 0.22 25)",  dark: "oklch(0.60 0.18 25)" },
    { id: "crimson",    name: "Carmesí",      preview: "#DC2626", light: "oklch(0.47 0.22 22)",  dark: "oklch(0.57 0.18 22)" },
    { id: "tomato",     name: "Tomate",       preview: "#E84033", light: "oklch(0.52 0.20 30)",  dark: "oklch(0.62 0.16 30)" },
    { id: "coral",      name: "Coral",        preview: "#F87171", light: "oklch(0.54 0.18 35)",  dark: "oklch(0.64 0.15 35)" },
    { id: "vermilion",  name: "Bermellón",    preview: "#FF6B35", light: "oklch(0.54 0.20 42)",  dark: "oklch(0.64 0.16 42)" },
    { id: "orange",     name: "Naranja",      preview: "#F97316", light: "oklch(0.52 0.20 50)",  dark: "oklch(0.64 0.16 50)" },
    { id: "tangerine",  name: "Mandarina",    preview: "#FB923C", light: "oklch(0.56 0.18 55)",  dark: "oklch(0.66 0.15 55)" },
    { id: "amber",      name: "Ámbar",        preview: "#F59E0B", light: "oklch(0.50 0.18 75)",  dark: "oklch(0.68 0.15 75)" },

    // Row 2 — Yellows & Yellow-greens
    { id: "gold",       name: "Oro",          preview: "#EAB308", light: "oklch(0.48 0.16 90)",  dark: "oklch(0.68 0.14 90)" },
    { id: "yellow",     name: "Amarillo",     preview: "#FACC15", light: "oklch(0.52 0.16 95)",  dark: "oklch(0.70 0.14 95)" },
    { id: "canary",     name: "Canario",      preview: "#FDE047", light: "oklch(0.55 0.14 100)", dark: "oklch(0.72 0.12 100)" },
    { id: "chartreuse", name: "Chartreuse",   preview: "#A3E635", light: "oklch(0.50 0.16 120)", dark: "oklch(0.68 0.14 120)" },
    { id: "lime",       name: "Lima",         preview: "#84CC16", light: "oklch(0.48 0.16 130)", dark: "oklch(0.65 0.14 130)" },
    { id: "apple",      name: "Manzana",      preview: "#65A30D", light: "oklch(0.46 0.16 135)", dark: "oklch(0.63 0.14 135)" },
    { id: "green",      name: "Verde",        preview: "#22C55E", light: "oklch(0.48 0.18 155)", dark: "oklch(0.62 0.14 155)" },
    { id: "emerald",    name: "Esmeralda",    preview: "#10B981", light: "oklch(0.48 0.16 165)", dark: "oklch(0.60 0.14 165)" },

    // Row 3 — Greens & Teals
    { id: "mint",       name: "Menta",        preview: "#34D399", light: "oklch(0.52 0.14 168)", dark: "oklch(0.64 0.12 168)" },
    { id: "jade",       name: "Jade",         preview: "#059669", light: "oklch(0.44 0.14 170)", dark: "oklch(0.58 0.12 170)" },
    { id: "teal",       name: "Turquesa",     preview: "#14B8A6", light: "oklch(0.50 0.14 180)", dark: "oklch(0.60 0.12 180)" },
    { id: "aqua",       name: "Agua",         preview: "#2DD4BF", light: "oklch(0.54 0.12 185)", dark: "oklch(0.64 0.10 185)" },
    { id: "cyan",       name: "Cian",         preview: "#06B6D4", light: "oklch(0.50 0.14 200)", dark: "oklch(0.62 0.12 200)" },
    { id: "sky",        name: "Cielo",        preview: "#0EA5E9", light: "oklch(0.52 0.15 230)", dark: "oklch(0.62 0.13 230)" },
    { id: "celeste",    name: "Celeste",      preview: "#38BDF8", light: "oklch(0.54 0.14 225)", dark: "oklch(0.64 0.12 225)" },
    { id: "azure",      name: "Azur",         preview: "#0284C7", light: "oklch(0.46 0.14 235)", dark: "oklch(0.58 0.12 235)" },

    // Row 4 — Blues
    { id: "blue",       name: "Azul",         preview: "#3B82F6", light: "oklch(0.50 0.18 260)", dark: "oklch(0.60 0.14 260)" },
    { id: "cobalt",     name: "Cobalto",      preview: "#2563EB", light: "oklch(0.47 0.18 258)", dark: "oklch(0.58 0.14 258)" },
    { id: "royal",      name: "Real",         preview: "#1D4ED8", light: "oklch(0.44 0.18 262)", dark: "oklch(0.56 0.14 262)" },
    { id: "navy",       name: "Marino",       preview: "#1E40AF", light: "oklch(0.40 0.16 265)", dark: "oklch(0.54 0.14 265)" },
    { id: "indigo",     name: "Índigo",       preview: "#6366F1", light: "oklch(0.48 0.18 275)", dark: "oklch(0.60 0.15 275)" },
    { id: "violet",     name: "Violeta",      preview: "#8B5CF6", light: "oklch(0.48 0.20 285)", dark: "oklch(0.60 0.16 285)" },
    { id: "iris",       name: "Iris",         preview: "#7C3AED", light: "oklch(0.45 0.20 282)", dark: "oklch(0.58 0.16 282)" },
    { id: "purple",     name: "Púrpura",      preview: "#A855F7", light: "oklch(0.46 0.20 300)", dark: "oklch(0.60 0.16 300)" },

    // Row 5 — Purples & Magentas
    { id: "amethyst",   name: "Amatista",     preview: "#9333EA", light: "oklch(0.44 0.22 295)", dark: "oklch(0.58 0.18 295)" },
    { id: "grape",      name: "Uva",          preview: "#7E22CE", light: "oklch(0.42 0.20 298)", dark: "oklch(0.56 0.16 298)" },
    { id: "orchid",     name: "Orquídea",     preview: "#C084FC", light: "oklch(0.52 0.18 305)", dark: "oklch(0.64 0.14 305)" },
    { id: "fuchsia",    name: "Fucsia",       preview: "#D946EF", light: "oklch(0.50 0.24 315)", dark: "oklch(0.62 0.18 315)" },
    { id: "magenta",    name: "Magenta",      preview: "#E040FB", light: "oklch(0.52 0.24 320)", dark: "oklch(0.62 0.18 320)" },
    { id: "hotpink",    name: "Rosa Fuerte",  preview: "#EC4899", light: "oklch(0.50 0.22 335)", dark: "oklch(0.62 0.16 335)" },
    { id: "pink",       name: "Rosa",         preview: "#F472B6", light: "oklch(0.54 0.20 340)", dark: "oklch(0.64 0.16 340)" },
    { id: "rose",       name: "Rosado",       preview: "#F43F5E", light: "oklch(0.50 0.22 350)", dark: "oklch(0.60 0.16 350)" },

    // Row 6 — Warm pinks & Reds (closing the hue circle)
    { id: "cherry",     name: "Cereza",       preview: "#E11D48", light: "oklch(0.46 0.20 355)", dark: "oklch(0.58 0.16 355)" },
    { id: "raspberry",  name: "Frambuesa",    preview: "#BE185D", light: "oklch(0.42 0.20 350)", dark: "oklch(0.56 0.16 350)" },
    { id: "strawberry", name: "Fresa",        preview: "#FB7185", light: "oklch(0.56 0.18 5)",   dark: "oklch(0.64 0.14 5)" },
    { id: "salmon",     name: "Salmón",       preview: "#FDA4AF", light: "oklch(0.60 0.14 10)",  dark: "oklch(0.68 0.12 10)" },
    { id: "peach",      name: "Melocotón",    preview: "#FDBA74", light: "oklch(0.58 0.12 65)",  dark: "oklch(0.70 0.10 65)" },
    { id: "lavender",   name: "Lavanda",      preview: "#C4B5FD", light: "oklch(0.56 0.12 290)", dark: "oklch(0.66 0.10 290)" },
    { id: "periwinkle", name: "Pervinca",     preview: "#A5B4FC", light: "oklch(0.56 0.12 270)", dark: "oklch(0.66 0.10 270)" },
    { id: "babyblue",   name: "Celeste Claro",preview: "#93C5FD", light: "oklch(0.58 0.10 250)", dark: "oklch(0.68 0.08 250)" },

    // Row 7 — Neutrals & muted tones
    { id: "slate",      name: "Pizarra",      preview: "#64748B", light: "oklch(0.40 0.03 260)", dark: "oklch(0.60 0.03 260)" },
    { id: "steel",      name: "Acero",        preview: "#475569", light: "oklch(0.36 0.03 255)", dark: "oklch(0.56 0.03 255)" },
    { id: "zinc",       name: "Zinc",         preview: "#71717A", light: "oklch(0.40 0.01 0)",   dark: "oklch(0.60 0.01 0)" },
    { id: "graphite",   name: "Grafito",      preview: "#52525B", light: "oklch(0.35 0.01 0)",   dark: "oklch(0.55 0.01 0)" },
    { id: "stone",      name: "Piedra",       preview: "#78716C", light: "oklch(0.42 0.02 85)",  dark: "oklch(0.62 0.02 85)" },
    { id: "taupe",      name: "Taupé",        preview: "#A8A29E", light: "oklch(0.50 0.01 80)",  dark: "oklch(0.65 0.01 80)" },
    { id: "silver",     name: "Plata",        preview: "#9CA3AF", light: "oklch(0.50 0.01 250)", dark: "oklch(0.65 0.01 250)" },
    { id: "neutral",    name: "Gris",         preview: "#737373", light: "oklch(0.40 0 0)",      dark: "oklch(0.60 0 0)" },
] as const;

/**
 * Simplified swatch list derived from COLOR_PALETTE — for use in label dialogs
 * and other places that only need hex + name (no oklch theming).
 */
export const SWATCH_COLORS = COLOR_PALETTE.map(c => ({ hex: c.preview, name: c.name }));

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
    /** Position in a pill group: 'first' rounds left, 'last' rounds right, 'middle' no rounding */
    pillPosition?: "first" | "last" | "middle";
}

export function PrimaryColorPicker({
    selectedColor,
    onColorSelect,
    label,
    variant = "light",
    defaultColor,
    chroma = 100,
    onChromaChange,
    pillPosition,
}: PrimaryColorPickerProps) {
    const isDarkVariant = variant === "dark";
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

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

    return (
        <div
            ref={containerRef}
            className="relative inline-block"
        >
            {/* Compact pill trigger with color background */}
            <button
                type="button"
                onClick={() => setIsOpen(o => !o)}
                className={cn(
                    "px-4 py-1.5 typo-select !font-bold transition-all duration-200 cursor-pointer select-none",
                    pillPosition === "first" && "rounded-l-lg",
                    pillPosition === "last" && "rounded-r-lg",
                    !pillPosition && "rounded-lg",
                    isOpen
                        ? "shadow-sm ring-1 ring-white/30"
                        : "hover:brightness-110",
                )}
                style={{
                    backgroundColor: selectedEntry.preview,
                    color: "#fff",
                    textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                }}
            >
                {label || selectedEntry.name}
            </button>

            {/* Expandable palette popover */}
            <div
                className={cn(
                    "absolute z-50 right-0 top-full mt-2",
                    "bg-popover border border-border rounded-2xl shadow-2xl",
                    "p-5 origin-top-right",
                    "transition-all duration-200 ease-out",
                    isOpen
                        ? "opacity-100 scale-100 pointer-events-auto translate-y-0"
                        : "opacity-0 scale-95 pointer-events-none -translate-y-1",
                )}
                style={{ width: "max-content" }}
            >
                <div className="grid grid-cols-8 gap-2.5">
                    {COLOR_PALETTE.map((color) => {
                        const isSelected = selectedColor === color.id;
                        return (
                            <button
                                key={color.id}
                                onClick={() => {
                                    onColorSelect(color.id);
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
                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                                Intensidad
                            </span>
                            <span className="text-xs font-mono font-bold text-muted-foreground/40">
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
                            <span className="text-xs text-muted-foreground/30">Suave</span>
                            <span className="text-xs text-muted-foreground/30">Vívido</span>
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

