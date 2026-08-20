/**
 * i18n — shell (Vibes) UI translations.
 *
 * P1: localized strings live in the shell, never in the runtime (vibes-core).
 * The runtime only knows tool ids, categories, risk levels and schemas.
 *
 * Infrastructure (Slice 1 of #106):
 *  - `t(key, lang, params?)`           simple + interpolated strings
 *  - `tPlural(key, count, lang)`       {one,many} via Intl.PluralRules
 *  - `formatDate/DateTime/Number`      Intl with es-ES/en-US tags
 *  - `dateLocale(lang)`                date-fns locale (es/en) for the 9 files
 *                                       that currently hardcode `{ es }`
 *  - `useI18n()`                       React hook bound to `chatLanguage`
 *                                       (settings) — the thing components use
 */

import { useSettings } from "@/hooks/useSettings";
import { messagesEs, type MessageValue } from "./messages.es";
import { messagesEn } from "./messages.en";
import { toolTranslationsEs } from "./tools.es";
import { toolTranslationsEn } from "./tools.en";
import type { ToolTranslation } from "./tools.es";
import { es as dateFnsEs, enUS as dateFnsEn } from "date-fns/locale";

export type Language = "es" | "en";

const dictionaries: Record<Language, typeof messagesEs> = {
  es: messagesEs,
  en: messagesEn,
};

export const FALLBACK_LANGUAGE: Language = "es";

export const LOCALE_TAG: Record<Language, string> = {
  es: "es-ES",
  en: "en-US",
};

export const DATE_FNS_LOCALE: Record<Language, typeof dateFnsEs> = {
  es: dateFnsEs,
  en: dateFnsEn,
};

/** The date-fns locale for the given language (replaces `import { es }`). */
export function dateLocale(language: Language = FALLBACK_LANGUAGE) {
  return DATE_FNS_LOCALE[language];
}

/** Navigate a dotted key (`settings.sections.general`) down the dictionary tree. */
function lookup(
  key: string,
  language: Language,
): MessageValue | undefined {
  let node: unknown = dictionaries[language];
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node as MessageValue | undefined;
}

/** Replace `{param}` placeholders with values. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}

/**
 * Translate a key for a language. Keys are namespaced (`settings.title`,
 * `chat.thinking`, ...). Falls back to the key itself when missing
 * (fail-closed: never render an empty string for a known UI slot).
 */
export function t(
  key: string,
  language: Language = FALLBACK_LANGUAGE,
  params?: Record<string, string | number>,
): string {
  const value = lookup(key, language) ?? lookup(key, FALLBACK_LANGUAGE) ?? key;
  if (typeof value === "object") return key; // plural keys need tPlural
  return interpolate(value, params);
}

/**
 * Translate a plural key (`{count} file(s)`) for a language.
 * Uses Intl.PluralRules to pick the `one`/`many` form.
 */
export function tPlural(
  key: string,
  count: number,
  language: Language = FALLBACK_LANGUAGE,
): string {
  const value = lookup(key, language) ?? lookup(key, FALLBACK_LANGUAGE);
  if (!value || typeof value === "string") return t(key, language);
  if (typeof value !== "object" || !("one" in value) || !("many" in value)) {
    return t(key, language);
  }
  const plural = value as { one: string; many: string };
  const form = new Intl.PluralRules(language).select(count) === "one" ? "one" : "many";
  return interpolate(plural[form], { count });
}

/** Format a date with the locale of the given language. */
export function formatDate(
  date: Date | number | string,
  language: Language = FALLBACK_LANGUAGE,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[language], opts).format(new Date(date));
}

/** Format a date+time with the locale of the given language. */
export function formatDateTime(
  date: Date | number | string,
  language: Language = FALLBACK_LANGUAGE,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const base: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
    ...opts,
  };
  return new Intl.DateTimeFormat(LOCALE_TAG[language], base).format(new Date(date));
}

/** Format a number with the locale of the given language. */
export function formatNumber(
  value: number,
  language: Language = FALLBACK_LANGUAGE,
  opts?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(LOCALE_TAG[language], opts).format(value);
}

// ── Tool translations (P1: localized strings live in the shell) ──

const toolTranslations: Record<Language, Record<string, ToolTranslation>> = {
  es: toolTranslationsEs,
  en: toolTranslationsEn,
};

/**
 * Resolve the human label for a tool in the given language. Falls back to the
 * raw tool id for unknown tools (fail-closed, still identifiable).
 */
export function toolLabel(
  toolId: string,
  language: Language = FALLBACK_LANGUAGE,
): string {
  return toolTranslations[language]?.[toolId]?.label ?? toolId;
}

/**
 * Resolve the human description (tooltip) for a tool in the given language.
 * Returns empty string for unknown tools.
 */
export function toolDescription(
  toolId: string,
  language: Language = FALLBACK_LANGUAGE,
): string {
  return toolTranslations[language]?.[toolId]?.description ?? "";
}

// ── useI18n hook (bound to the active chatLanguage) ──

export interface I18nApi {
  language: Language;
  t: (key: string, params?: Record<string, string | number>) => string;
  tPlural: (key: string, count: number) => string;
  formatDate: (date: Date | number | string, opts?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (date: Date | number | string, opts?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, opts?: Intl.NumberFormatOptions) => string;
  dateLocale: () => typeof dateFnsEs;
  toolLabel: (toolId: string) => string;
  toolDescription: (toolId: string) => string;
}

/**
 * Build the i18n API bound to a fixed language. Pure function — testable
 * without React. `useI18n` wraps this with the active `chatLanguage`.
 */
export function createI18nApi(language: Language): I18nApi {
  return {
    language,
    t: (key, params) => t(key, language, params),
    tPlural: (key, count) => tPlural(key, count, language),
    formatDate: (date, opts) => formatDate(date, language, opts),
    formatDateTime: (date, opts) => formatDateTime(date, language, opts),
    formatNumber: (value, opts) => formatNumber(value, language, opts),
    dateLocale: () => dateLocale(language),
    toolLabel: (toolId) => toolLabel(toolId, language),
    toolDescription: (toolId) => toolDescription(toolId, language),
  };
}

/**
 * React hook exposing the i18n API bound to the current `chatLanguage`
 * setting. Re-renders when the setting changes (Jotai atom).
 */
export function useI18n(): I18nApi {
  const { settings } = useSettings();
  const language: Language = settings?.chatLanguage ?? FALLBACK_LANGUAGE;
  return createI18nApi(language);
}
