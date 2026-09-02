import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { chatMessagesByIdAtom } from "@/atoms/chatAtoms";
import type { Message } from "@/ipc/types";

/**
 * useSessionTokens — tokens de contexto reales de la sesión activa (#207).
 *
 * P1: la fuente de verdad son los tags `<vibes-token-usage>` que el runtime
 * (vía runtime_bridge) y el motor OpenCode persisten al final de cada mensaje
 * assistant (input/output reales por turno). Este hook deriva de
 * `chatMessagesByIdAtom` (sin IPC extra, mismo molde que useSessionCost).
 *
 * Con los totales se calcula el gauge: % consumido vs ventana de contexto del
 * modelo activo (128k por defecto vía token_utils), umbrales de aviso
 * (% restante) y umbral de "compactar" (recomendación de resumir a chat nuevo).
 */

/**
 * Regex to capture a single vibes-token-usage opening tag with all its attributes.
 * The tag is always self-closing or empty.
 */
export const TOKEN_USAGE_TAG_RE = /<vibes-token-usage([^>]*)>/g;

/** Extract a named attribute value from a tag attribute string. */
export function getTagAttr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return m?.[1] ?? "";
}

export interface MessageTokenUsage {
  /** Input tokens reported by the provider (prompt side). */
  input: number;
  /** Output tokens reported by the provider (completion side). */
  output: number;
  /** Cached input tokens (cache reads). */
  cached: number;
  /** Total = input + output (billable view, excludes nothing). */
  total: number;
  /** Whether the message had a real token-usage tag (vs zero-fallback). */
  hasUsage: boolean;
}

export interface SessionTokenSummary {
  /** Sum of input tokens across all assistant messages (acumulado histórico). */
  totalInput: number;
  /** Sum of output tokens across all assistant messages (coste). */
  totalOutput: number;
  /** Sum of cached tokens across all assistant messages. */
  totalCached: number;
  /** Sum of total (input + output) tokens across all assistant messages. */
  totalTokens: number;
  /**
   * #230: contexto real del último turno (input del último mensaje assistant
   * con tag, no la suma). Cada `input` ya es el contexto acumulado que el
   * runtime mandó en ese turno — sumarlos cuenta el mismo contexto N veces.
   * El gauge y el % de ventana deben usar este campo, no totalTokens.
   * Cero si ningún mensaje tiene dato real aún.
   */
  contextTokens: number;
  /**
   * #230: output del último turno (para que el gauge muestre los mismos
   * números que el log del runtime: Total input / Total output por turno).
   */
  contextOutput: number;
  /** Per-message breakdown (assistant messages only, with usage). */
  perMessage: Array<{
    messageId: number;
    usage: MessageTokenUsage;
    /** True cuando el dato de este mensaje es estimación chars/4. */
    estimated?: boolean;
  }>;
  /** Whether at least one assistant message carried a real usage tag. */
  hasUsage: boolean;
  /** True when the summary comes from chars/4 estimation (no real tags). */
  estimated?: boolean;
}

/** Empty summary for chats without data. */
export const EMPTY_SESSION_TOKENS: SessionTokenSummary = {
  totalInput: 0,
  totalOutput: 0,
  totalCached: 0,
  totalTokens: 0,
  contextTokens: 0,
  contextOutput: 0,
  perMessage: [],
  hasUsage: false,
  estimated: false,
};

/**
 * Parses all <vibes-token-usage> tags from a message's content and returns
 * the summed token usage for that message.
 *
 * If the message carries no tag (e.g. legacy messages without usage), returns
 * a zero usage with `hasUsage: false`.
 */
export function extractMessageTokenUsage(content: string): MessageTokenUsage {
  let input = 0;
  let output = 0;
  let cached = 0;
  let hasUsage = false;

  const regex = new RegExp(TOKEN_USAGE_TAG_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const attrs = match[1];
    const inp = parseInt(getTagAttr(attrs, "input") || "0", 10);
    const out = parseInt(getTagAttr(attrs, "output") || "0", 10);
    const cache = parseInt(getTagAttr(attrs, "cached") || "0", 10);
    if (inp > 0 || out > 0 || cache > 0) {
      hasUsage = true;
    }
    input += inp;
    output += out;
    cached += cache;
  }

  return { input, output, cached, total: input + output, hasUsage };
}

/**
 * Estimate tokens with the repo heuristic (4 chars per token).
 * Same rule as token_utils.estimateTokens — duplicated here to keep the
 * hook dependency-free (pure functions are unit-tested without IPC).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Computes the session token summary from the chat's messages.
 *
 * Fuente primaria (por prioridad):
 *  1. Tag `<vibes-token-usage>` en el content (flujo legacy persistido).
 *  2. `msg.totalTokens` (lo rellena el runtime en el end event — flujo nuevo).
 *  3. Estimación chars/4 como último recurso (chats sin ningún dato real),
 *     marcada con `estimated=true` para que la UI lo distinga.
 *
 * Pure function — exported for unit tests without mounting React.
 */
export function computeSessionTokens(messages: Message[]): SessionTokenSummary {
  let totalInput = 0;
  let totalOutput = 0;
  let totalCached = 0;
  const perMessage: SessionTokenSummary["perMessage"] = [];
  let hasUsage = false;
  let hasAnyReal = false;
  let lastRealInput: number | null = null;
  let lastRealOutput: number | null = null;

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;

    // 1) Tag real en el content (legacy).
    const usage = extractMessageTokenUsage(msg.content ?? "");
    if (usage.hasUsage) {
      totalInput += usage.input;
      totalOutput += usage.output;
      totalCached += usage.cached;
      hasUsage = true;
      hasAnyReal = true;
      lastRealInput = usage.input;
      lastRealOutput = usage.output;
      perMessage.push({
        messageId: msg.id,
        usage,
        estimated: false,
      });
      continue;
    }

    // 2) totalTokens real del mensaje (lo rellena el runtime en el end event).
    if (typeof msg.totalTokens === "number" && msg.totalTokens > 0) {
      totalInput += msg.totalTokens;
      hasAnyReal = true;
      lastRealInput = msg.totalTokens;
      lastRealOutput = null;
      perMessage.push({
        messageId: msg.id,
        usage: {
          input: msg.totalTokens,
          output: 0,
          cached: 0,
          total: msg.totalTokens,
          hasUsage: true,
        },
        estimated: false,
      });
      continue;
    }

    // 3) Último recurso: estimación chars/4 (el gauge sigue teniendo datos).
    const est = estimateTokens(msg.content ?? "");
    totalInput += est;
    perMessage.push({
      messageId: msg.id,
      usage: {
        input: est,
        output: 0,
        cached: 0,
        total: est,
        hasUsage: false,
      },
      estimated: true,
    });
  }

  const estimated = !hasAnyReal;
  // #230: contexto real del último turno (input + output del último mensaje
  // con tag, o su totalTokens). Es el contexto real que vio el runtime en el
  // último turno — no la suma de todos los turnos.
  const contextTokens = lastRealInput ?? 0;
  const contextOutput = lastRealOutput ?? 0;

  if (perMessage.length > 0) {
    return {
      totalInput,
      totalOutput,
      totalCached,
      totalTokens: totalInput + totalOutput,
      contextTokens,
      contextOutput,
      perMessage,
      hasUsage,
      estimated: !hasAnyReal,
    };
  }

  // Sin datos reales ni estimación utilizable (chat vacío).
  return {
    totalInput: 0,
    totalOutput: 0,
    totalCached: 0,
    totalTokens: 0,
    contextTokens: 0,
    contextOutput: 0,
    perMessage: [],
    hasUsage: false,
    estimated: false,
  };
}

// ── Gauge thresholds (#207) ──────────────────────────────────────────────────

/** Umbral de aviso visual: porcentaje de contexto restante bajo el que avisar. */
export const GAUGE_WARN_PCT_REMAINING = 15;
/** Umbral de recomendación de compactar: porcentaje de contexto consumido. */
export const GAUGE_COMPACT_PCT_USED = 70;

export type GaugeLevel = "ok" | "warn" | "critical";

/**
 * Calculates the gauge state from consumed/remaining tokens.
 *
 * Returns the percentage used (0-100), the level for styling, and flags for
 * the warning banner and the compact recommendation.
 *
 * Pure function — exported for unit tests.
 */
export function computeGauge(input: {
  totalTokens: number;
  contextWindow: number;
}): {
  pctUsed: number;
  pctRemaining: number;
  level: GaugeLevel;
  showWarning: boolean;
  showCompact: boolean;
} {
  const { totalTokens, contextWindow } = input;
  if (!contextWindow || contextWindow <= 0 || totalTokens <= 0) {
    return {
      pctUsed: 0,
      pctRemaining: 100,
      level: "ok",
      showWarning: false,
      showCompact: false,
    };
  }

  const pctUsed = Math.min(100, Math.round((totalTokens / contextWindow) * 100));
  const pctRemaining = 100 - pctUsed;
  const showCompact = pctUsed >= GAUGE_COMPACT_PCT_USED;
  // Aviso: cerca del límite (poco restante) o ya en zona de compactar.
  const showWarning = showCompact || pctRemaining <= GAUGE_WARN_PCT_REMAINING;
  const level: GaugeLevel =
    pctRemaining <= GAUGE_WARN_PCT_REMAINING
      ? "critical"
      : showCompact
        ? "warn"
        : "ok";

  return { pctUsed, pctRemaining, level, showWarning, showCompact };
}

/** Formats a token count as compact human-readable ("12.4k", "1.2M"). */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(".0", "")}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(".0", "")}k`;
  }
  return count.toString();
}

// ── Donut gauge helpers (#207) ───────────────────────────────────────────────

/** Radio del donut en el SVG (16px de diámetro visual con stroke 3). */
export const DONUT_RADIUS = 14;
/** Circunferencia del donut (2πr) — usada para el dashoffset del arco. */
export const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

/**
 * Calcula el dashoffset del arco del donut para un porcentaje dado.
 *
 * Con strokeDasharray = circumference y strokeDashoffset = offset, el arco
 * visible es `pct` de la circunferencia. El donut parte desde arriba (SVG
 * rotate -90deg en el componente).
 *
 * Pure function — exported for unit tests.
 */
export function computeDonutDashOffset(pctUsed: number): number {
  const clamped = Math.max(0, Math.min(100, pctUsed));
  return DONUT_CIRCUMFERENCE * (1 - clamped / 100);
}

/**
 * Returns the session token summary for the given chatId, computed from all
 * assistant messages already loaded in the chatMessagesByIdAtom.
 *
 * Purely derived from in-memory state — no IPC call needed. Recalculates
 * whenever messages change (i.e. stream ends) and whenever the chatId changes.
 */
export function useSessionTokens(
  chatId: number | null | undefined,
): SessionTokenSummary {
  const messagesById = useAtomValue(chatMessagesByIdAtom);

  return useMemo<SessionTokenSummary>(() => {
    if (!chatId) return EMPTY_SESSION_TOKENS;
    const messages: Message[] = messagesById.get(chatId) ?? [];
    return computeSessionTokens(messages);
  }, [chatId, messagesById]);
}
