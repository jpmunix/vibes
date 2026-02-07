/**
 * UI translations for chat components
 * Uses the chatLanguage setting to determine which language to use
 */

export type Language = "es" | "en";

interface UITranslations {
  thinking: string;
  searching: string;
  processing: string;
  loading: string;
  codeSearch: string;
  webSearch: string;
}

const translations: Record<Language, UITranslations> = {
  es: {
    thinking: "Pensando",
    searching: "Buscando...",
    processing: "Procesando...",
    loading: "Cargando...",
    codeSearch: "Búsqueda de Código",
    webSearch: "Búsqueda Web",
  },
  en: {
    thinking: "Thinking",
    searching: "Searching...",
    processing: "Processing...",
    loading: "Loading...",
    codeSearch: "Code Search",
    webSearch: "Web Search",
  },
};

/**
 * Get translated UI text based on the current language setting
 */
export function t(
  key: keyof UITranslations,
  language: Language = "es",
): string {
  return translations[language][key];
}

/**
 * Get all translations for a language
 */
export function getTranslations(language: Language = "es"): UITranslations {
  return translations[language];
}
