import type { LanguageModel } from "../types/language-model";

// =============================================================================
// OpenRouter Model Variants
// =============================================================================

export interface ModelVariant {
    /** Suffix appended to the model ID (e.g. ":nitro"). Empty string for standard. */
    suffix: string;
    /** Short label for the UI */
    label: string;
    /** One-line description */
    description: string;
    /** Lucide icon name (used for import reference) */
    iconName: "circle" | "zap" | "crosshair";
    /** Whether this variant is available for a given model */
    isAvailable: (model: LanguageModel) => boolean;
}

/**
 * Returns true if a model is free (pricing = 0 or no pricing data with dollarSigns = 0).
 */
export function isFreeModel(model: LanguageModel): boolean {
    // Check actual pricing strings from OpenRouter
    if (model.pricingInput && model.pricingOutput) {
        const inPrice = parseFloat(model.pricingInput);
        const outPrice = parseFloat(model.pricingOutput);
        return (inPrice === 0 && outPrice === 0);
    }
    // Fallback: dollarSigns-based check
    return model.dollarSigns === 0;
}

/**
 * All available variants. The first entry (empty suffix) is the default "Standard".
 */
export const MODEL_VARIANTS: ModelVariant[] = [
    {
        suffix: "",
        label: "Estándar",
        description: "Enrutamiento por defecto",
        iconName: "circle",
        isAvailable: () => true,
    },
    {
        suffix: ":nitro",
        label: "Nitro",
        description: "Velocidad máxima",
        iconName: "zap",
        isAvailable: (m) => !isFreeModel(m),
    },
    {
        suffix: ":exacto",
        label: "Exacto",
        description: "Tool-calling fiable",
        iconName: "crosshair",
        isAvailable: (m) => !isFreeModel(m),
    },
];

/**
 * Strip any known variant suffix from a model name.
 * e.g. "google/gemini-3-flash-preview:nitro" → "google/gemini-3-flash-preview"
 */
export function stripVariantSuffix(modelName: string): string {
    for (const v of MODEL_VARIANTS) {
        if (v.suffix && modelName.endsWith(v.suffix)) {
            return modelName.slice(0, -v.suffix.length);
        }
    }
    return modelName;
}

/**
 * Extract the variant suffix from a model name.
 * e.g. "google/gemini-3-flash-preview:nitro" → ":nitro"
 * Returns empty string if no known variant suffix.
 */
export function getVariantSuffix(modelName: string): string {
    for (const v of MODEL_VARIANTS) {
        if (v.suffix && modelName.endsWith(v.suffix)) {
            return v.suffix;
        }
    }
    return "";
}

/**
 * Get the display label for a variant suffix.
 * Returns null if no variant (standard).
 */
export function getVariantLabel(suffix: string): string | null {
    if (!suffix) return null;
    const found = MODEL_VARIANTS.find((v) => v.suffix === suffix);
    return found?.label ?? null;
}

/**
 * Compose a model name with a variant suffix, respecting free model rules.
 * If the model is free, the variant is ignored.
 */
export function composeModelWithVariant(
    modelName: string,
    variant: string,
    model?: LanguageModel,
): string {
    if (!variant) return modelName;
    // Don't append variant to free models
    if (model && isFreeModel(model)) return modelName;
    // Don't double-append if already has a variant
    if (getVariantSuffix(modelName)) return modelName;
    return modelName + variant;
}
