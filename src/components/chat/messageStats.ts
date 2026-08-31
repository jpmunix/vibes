import type { Message } from "@/ipc/types";

/**
 * messageStats — helpers puros para la modal de estadísticas mensaje (#221).
 *
 * Fuente de verdad de los datos por mensaje:
 *  1. Tag `<vibes-token-usage>` incrustado en `message.content` (píxeles del
 *     runtime/OpenCode). Aporta input/output/cached reales, web-searches,
 *     y coste bien directo (`cost`) o calculable (price-input/price-output).
 *  2. `message.durationMs` y `message.createdAt` (hora de fin del stream).
 *  3. `message.totalTokens` (fallback del runtime si no hay tag).
 *  4. `message.model`, `message.status`, `message.commitHash`,
 *     `message.approvalState`, `message.requestId`.
 *
 * La hora de inicio se DERIVA: `createdAt - durationMs`.
 *
 * Estos helpers son funciones puras (sin IPC, sin React) y se testean de forma
 * atómica en `messageStats.test.ts`.
 */

const TOKEN_USAGE_TAG_RE = /<vibes-token-usage([^>]*)>/g;

/** Extrae el valor de un atributo del tag. */
export function getTagAttr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return m?.[1] ?? "";
}

export interface MessageTokenBreakdown {
  /** Tokens de entrada (prompt) reportados por el provider. */
  input: number;
  /** Tokens de salida (respuesta, incluye reasoning billable). */
  output: number;
  /** Tokens de cache read. */
  cached: number;
  /** Total = input + output (excluye cached: no es consumo independiente). */
  total: number;
  /** Coste en USD reportado directamente por el provider. */
  directCost: number | null;
  /** Precio input del catálogo (fallback para calcular coste). */
  priceInput: number | null;
  /** Precio output del catálogo (fallback para calcular coste). */
  priceOutput: number | null;
  /** Nº de búsquedas web en la respuesta. */
  webSearches: number;
  /** True si el mensaje llevaba un tag real (vs fallback 0 / estimación). */
  hasUsage: boolean;
  /** True si el dato proviene de estimación chars/4 (sin tag ni totalTokens). */
  estimated: boolean;
}

/** Suma de tokens de la sesión completa (para la sección "Contexto del chat"). */
export interface MessageStats {
  /** Token breakdown del mensaje al que se le ha hecho click. */
  message: MessageTokenBreakdown;
  /** Tokens agregados de TODOS los mensajes assistant del chat. */
  session: {
    totalInput: number;
    totalOutput: number;
    totalCached: number;
    totalTokens: number;
  };
  /** Hora de inicio derivada (createdAt - durationMs). */
  startedAtMs: number | null;
  /** Duración en ms. */
  durationMs: number | null;
  /** Modelo usado. */
  model: string | null;
  /** Estado del mensaje. */
  status: string | null;
  /** Commit asociado (si tocó código). */
  commitHash: string | null;
  /** Estado de aprobación si hubo pill. */
  approvalState: string | null;
  /** Coste total de la sesión en USD (null si ningún mensaje tiene pricing). */
  sessionCostUsd: number | null;
}

/**
 * Extrae el desglose de tokens/coste de un mensaje desde su content.
 * Prioridad: tag real → totalTokens del runtime → estimación chars/4.
 */
export function extractMessageTokenBreakdown(
  message: Message,
): MessageTokenBreakdown {
  const content = message.content ?? "";
  const empty: MessageTokenBreakdown = {
    input: 0,
    output: 0,
    cached: 0,
    total: 0,
    directCost: null,
    priceInput: null,
    priceOutput: null,
    webSearches: 0,
    hasUsage: false,
    estimated: false,
  };

  // 1) Tag real en el content (flujo legacy / runtime).
  let input = 0;
  let output = 0;
  let cached = 0;
  let webSearches = 0;
  let directCost: number | null = null;
  let priceInput: number | null = null;
  let priceOutput: number | null = null;
  let hasUsage = false;

  const regex = new RegExp(TOKEN_USAGE_TAG_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const attrs = match[1];
    const inp = parseInt(getTagAttr(attrs, "input") || "0", 10);
    const out = parseInt(getTagAttr(attrs, "output") || "0", 10);
    const cache = parseInt(getTagAttr(attrs, "cached") || "0", 10);
    const web = parseInt(getTagAttr(attrs, "web-searches") || "0", 10);
    if (inp > 0 || out > 0 || cache > 0 || web > 0) {
      hasUsage = true;
    }
    input += inp;
    output += out;
    cached += cache;
    webSearches += web;

    const costStr = getTagAttr(attrs, "cost");
    if (costStr) {
      const c = parseFloat(costStr);
      if (!isNaN(c)) directCost = (directCost ?? 0) + c;
    }
    const pi = getTagAttr(attrs, "price-input");
    if (pi) {
      const v = parseFloat(pi);
      if (!isNaN(v)) priceInput = v;
    }
    const po = getTagAttr(attrs, "price-output");
    if (po) {
      const v = parseFloat(po);
      if (!isNaN(v)) priceOutput = v;
    }
  }

  if (hasUsage) {
    return {
      input,
      output,
      cached,
      total: input + output,
      directCost,
      priceInput,
      priceOutput,
      webSearches,
      hasUsage: true,
      estimated: false,
    };
  }

  // 2) totalTokens real del runtime (flujo nuevo, sin tag).
  if (typeof message.totalTokens === "number" && message.totalTokens > 0) {
    return {
      ...empty,
      input: message.totalTokens,
      total: message.totalTokens,
      hasUsage: true,
    };
  }

  // 3) Último recurso: estimación chars/4.
  const est = Math.ceil(content.length / 4);
  return { ...empty, input: est, total: est, estimated: true };
}

/**
 * Calcula el coste en USD de un mensaje.
 *  1. Si el provider reportó `cost` directo → ese manda.
 *  2. Si hay precio de catálogo → (input - cached)*priceIn + cached*priceIn*0.5
 *     + output*priceOut + webSearches*0.02.
 *  3. Sin datos → null (la UI muestra "—").
 */
export function computeMessageCost(
  breakdown: MessageTokenBreakdown,
): number | null {
  if (breakdown.directCost !== null) {
    return breakdown.directCost;
  }
  const { priceInput, priceOutput, input, output, cached, webSearches } =
    breakdown;
  if (
    (priceInput === null || priceInput === 0) &&
    (priceOutput === null || priceOutput === 0) &&
    webSearches === 0
  ) {
    return null;
  }
  const costInput = (input - cached) * (priceInput ?? 0);
  const costCached = cached * (priceInput ?? 0) * 0.5;
  const costOutput = output * (priceOutput ?? 0);
  const costWebSearches = webSearches * 0.02;
  return costInput + costCached + costOutput + costWebSearches;
}

/**
 * Calcula el coste total de la sesión desde todos los mensajes del chat.
 * Devuelve null si ningún mensaje tiene dato de coste.
 */
export function computeSessionCost(messages: Message[]): number | null {
  let total = 0;
  let hasAny = false;
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const breakdown = extractMessageTokenBreakdown(msg);
    const cost = computeMessageCost(breakdown);
    if (cost !== null) {
      total += cost;
      hasAny = true;
    }
  }
  return hasAny ? total : null;
}

/**
 * Suma los tokens de la sesión (todos los assistant messages).
 * Reutiliza la misma lógica que computeSessionTokens pero devuelve el
 * desglose por input/output/cached/total.
 */
export function computeSessionTokens(messages: Message[]): {
  totalInput: number;
  totalOutput: number;
  totalCached: number;
  totalTokens: number;
} {
  let totalInput = 0;
  let totalOutput = 0;
  let totalCached = 0;
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const b = extractMessageTokenBreakdown(msg);
    totalInput += b.input;
    totalOutput += b.output;
    totalCached += b.cached;
  }
  return {
    totalInput,
    totalOutput,
    totalCached,
    totalTokens: totalInput + totalOutput,
  };
}

/**
 * Construye las estadísticas completas de un mensaje individual + totales de
 * sesión. Función pura para la modal #221.
 */
export function buildMessageStats(
  message: Message,
  allMessages: Message[],
): MessageStats {
  const breakdown = extractMessageTokenBreakdown(message);
  const session = computeSessionTokens(allMessages);
  const sessionCost = computeSessionCost(allMessages);

  const createdAt = message.createdAt
    ? new Date(message.createdAt).getTime()
    : null;
  const durationMs = message.durationMs ?? null;
  const startedAtMs =
    createdAt !== null && durationMs !== null
      ? createdAt - durationMs
      : null;

  return {
    message: breakdown,
    session: { ...session, totalTokens: session.totalTokens },
    startedAtMs,
    durationMs,
    model: message.model ?? null,
    status: message.status ?? null,
    commitHash: message.commitHash ?? null,
    approvalState: message.approvalState ?? null,
    sessionCostUsd: sessionCost,
  };
}
