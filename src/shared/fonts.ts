/**
 * Font configuration for the app UI.
 * Each font option defines how to load and apply the font.
 * Geist is bundled; others are loaded from Google Fonts on demand.
 */

export interface FontOption {
  /** Unique identifier persisted in settings */
  id: string;
  /** Display name in the selector */
  name: string;
  /** CSS font-family value (with fallback) */
  family: string;
  /** Google Fonts family string for URL construction (undefined = bundled) */
  googleFonts?: string;
  /** Short description / style category */
  category: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: "geist",
    name: "Geist",
    family: '"Geist", sans-serif',
    category: "Técnica · Neutra",
  },
  {
    id: "sora",
    name: "Sora",
    family: '"Sora", sans-serif',
    googleFonts: "Sora:wght@400;500;600;700",
    category: "Geométrica · Moderna",
  },
  {
    id: "inter",
    name: "Inter",
    family: '"Inter", sans-serif',
    googleFonts: "Inter:wght@400;500;600;700",
    category: "Humanista · Cálida",
  },
  {
    id: "plus-jakarta-sans",
    name: "Plus Jakarta Sans",
    family: '"Plus Jakarta Sans", sans-serif',
    googleFonts: "Plus+Jakarta+Sans:wght@400;500;600;700",
    category: "Humanista · Cálida",
  },
  {
    id: "onest",
    name: "Onest",
    family: '"Onest", sans-serif',
    googleFonts: "Onest:wght@400;500;600;700",
    category: "Geométrica · Moderna",
  },
  {
    id: "outfit",
    name: "Outfit",
    family: '"Outfit", sans-serif',
    googleFonts: "Outfit:wght@400;500;600;700",
    category: "Geométrica · Moderna",
  },
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono",
    family: '"JetBrains Mono", monospace',
    googleFonts: "JetBrains+Mono:wght@400;500;600;700",
    category: "Monoespaciada",
  },
  {
    id: "space-mono",
    name: "Space Mono",
    family: '"Space Mono", monospace',
    googleFonts: "Space+Mono:wght@400;700",
    category: "Monoespaciada",
  },
  {
    id: "roboto-mono",
    name: "Roboto Mono",
    family: '"Roboto Mono", monospace',
    googleFonts: "Roboto+Mono:wght@400;500;600;700",
    category: "Monoespaciada",
  },
  {
    id: "ibm-plex-mono",
    name: "IBM Plex Mono",
    family: '"IBM Plex Mono", monospace',
    googleFonts: "IBM+Plex+Mono:wght@400;500;600;700",
    category: "Monoespaciada",
  },
  {
    id: "space-grotesk",
    name: "Space Grotesk",
    family: '"Space Grotesk", sans-serif',
    googleFonts: "Space+Grotesk:wght@400;500;600;700",
    category: "Geométrica · Moderna",
  },
  {
    id: "bricolage-grotesque",
    name: "Bricolage Grotesque",
    family: '"Bricolage Grotesque", sans-serif',
    googleFonts: "Bricolage+Grotesque:wght@400;500;600;700",
    category: "Geométrica · Moderna",
  },
  {
    id: "host-grotesque",
    name: "Host Grotesque",
    family: '"Host Grotesque", sans-serif',
    googleFonts: "Host+Grotesque:wght@400;500;600;700",
    category: "Geométrica · Moderna",
  },
  {
    id: "public-sans",
    name: "Public Sans",
    family: '"Public Sans", sans-serif',
    googleFonts: "Public+Sans:wght@400;500;600;700",
    category: "Neutra · Funcional",
  },
  {
    id: "hanken-grotesk",
    name: "Hanken Grotesk",
    family: '"Hanken Grotesk", sans-serif',
    googleFonts: "Hanken+Grotesk:wght@400;500;600;700",
    category: "Humanista · Moderna",
  },
  {
    id: "urbanist",
    name: "Urbanist",
    family: '"Urbanist", sans-serif',
    googleFonts: "Urbanist:wght@400;500;600;700",
    category: "Geométrica · Moderna",
  },
  {
    id: "instrument-sans",
    name: "Instrument Sans",
    family: '"Instrument Sans", sans-serif',
    googleFonts: "Instrument+Sans:wght@400;500;600;700",
    category: "Neutra · Moderna",
  },
  {
    id: "schibsted-grotesk",
    name: "Schibsted Grotesk",
    family: '"Schibsted Grotesk", sans-serif',
    googleFonts: "Schibsted+Grotesk:wght@400;500;600;700",
    category: "Geométrica · Funcional",
  },
  {
    id: "manrope",
    name: "Manrope",
    family: '"Manrope", sans-serif',
    googleFonts: "Manrope:wght@400;500;600;700",
    category: "Geométrica · Moderna",
  },
];

export const DEFAULT_FONT_ID = "bricolage-grotesque";
export const DEFAULT_CHAT_FONT_ID = "jetbrains-mono";

/**
 * Find a font option by its id (falls back to the default font).
 */
export function getFontById(id: string | undefined): FontOption {
  return FONT_OPTIONS.find((f) => f.id === id)
    ?? FONT_OPTIONS.find((f) => f.id === DEFAULT_FONT_ID)!;
}

/**
 * Build the Google Fonts CSS URL for a given font option.
 * Returns undefined for bundled fonts (no external loading needed).
 */
export function getGoogleFontsUrl(font: FontOption): string | undefined {
  if (!font.googleFonts) return undefined;
  return `https://fonts.googleapis.com/css2?family=${font.googleFonts}&display=swap`;
}
