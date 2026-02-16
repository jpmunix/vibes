import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
    { id: "purple", name: "Púrpura", preview: "#7C3AED", light: "oklch(0.59 0.16 288)", dark: "oklch(0.58 0.09 260)" },
    { id: "fuchsia", name: "Fucsia", preview: "#D946EF", light: "oklch(0.60 0.24 310)", dark: "oklch(0.58 0.18 310)" },

    // Row 3 — Pinks / Roses / Neutrals
    { id: "pink", name: "Rosa", preview: "#EC4899", light: "oklch(0.58 0.22 340)", dark: "oklch(0.58 0.16 340)" },
    { id: "rose", name: "Rosado", preview: "#F43F5E", light: "oklch(0.58 0.23 355)", dark: "oklch(0.56 0.17 355)" },
    { id: "slate", name: "Pizarra", preview: "#64748B", light: "oklch(0.50 0.03 260)", dark: "oklch(0.55 0.03 260)" },
    { id: "zinc", name: "Zinc", preview: "#71717A", light: "oklch(0.50 0.01 0)", dark: "oklch(0.55 0.01 0)" },
] as const;

export type ColorId = typeof COLOR_PALETTE[number]["id"];

/** Default colors (the current ones) */
export const DEFAULT_LIGHT_COLOR = "purple";
export const DEFAULT_DARK_COLOR = "purple";

export function getColorById(id: string) {
    return COLOR_PALETTE.find(c => c.id === id);
}

interface PrimaryColorPickerProps {
    selectedColor: string;
    onColorSelect: (colorId: string) => void;
    label?: string;
}

export function PrimaryColorPicker({
    selectedColor,
    onColorSelect,
    label,
}: PrimaryColorPickerProps) {
    return (
        <div className="space-y-3">
            {label && (
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                    {label}
                </span>
            )}
            <div className="grid grid-cols-8 gap-2">
                {COLOR_PALETTE.map((color) => {
                    const isSelected = selectedColor === color.id;
                    return (
                        <button
                            key={color.id}
                            onClick={() => onColorSelect(color.id)}
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
                                // ring color matches the swatch
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
        </div>
    );
}
