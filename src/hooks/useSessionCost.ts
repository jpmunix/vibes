import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { chatMessagesByIdAtom } from "@/atoms/chatAtoms";
import type { Message } from "@/ipc/types";

/**
 * Regex to capture a single vibes-token-usage opening tag with all its attributes.
 * We only need the opening tag — the tag is always self-closing or empty.
 */
const TOKEN_USAGE_TAG_RE =
  /<vibes-token-usage([^>]*)>/g;

/** Extract a named attribute value from a tag attribute string. */
function getAttr(attrs: string, name: string): string {
  const m = attrs.match(
    new RegExp(`${name}="([^"]*)"`)
  );
  return m?.[1] ?? "";
}

export interface SessionCostResult {
  /** Total cost in USD across all messages in the chat. */
  totalCostUsd: number;
  /** Number of assistant messages that have pricing data. */
  pricedMessageCount: number;
  /** Whether any messages have pricing data at all. */
  hasPricing: boolean;
}

/**
 * Parses all <vibes-token-usage> tags from a message's content and
 * returns the summed cost for that message.
 *
 * Priority:
 *  1. `cost` attribute — set directly from OpenCode's reported usage.cost (ground truth).
 *     This matches exactly what OpenCode shows in its own UI.
 *  2. Fallback calculation when no direct cost is available (e.g. legacy messages):
 *     costInput  = (inputTokens - cachedTokens) * priceInput   (price per token)
 *     costCached = cachedTokens * priceInput * 0.5
 *     costOutput = outputTokens * priceOutput
 *     costSearches = webSearches * 0.02
 */
function extractMessageCost(content: string): {
  cost: number;
  hasPricing: boolean;
} {
  let totalCost = 0;
  let hasPricing = false;

  const regex = new RegExp(TOKEN_USAGE_TAG_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const attrs = match[1];

    // ── Path 1: direct cost from OpenCode (ground truth) ──────────────────
    const directCostStr = getAttr(attrs, "cost");
    if (directCostStr) {
      const directCost = parseFloat(directCostStr);
      if (!isNaN(directCost)) {
        hasPricing = true;
        totalCost += directCost;
        continue; // no need to compute from tokens
      }
    }

    // ── Path 2: legacy — compute from token counts × price per token ───────
    const inp = parseInt(getAttr(attrs, "input") || "0", 10);
    const out = parseInt(getAttr(attrs, "output") || "0", 10);
    const cached = parseInt(getAttr(attrs, "cached") || "0", 10);
    const webSearches = parseInt(getAttr(attrs, "web-searches") || "0", 10);
    const priceIn = parseFloat(getAttr(attrs, "price-input") || "0");
    const priceOut = parseFloat(getAttr(attrs, "price-output") || "0");

    if (priceIn > 0 || priceOut > 0 || webSearches > 0) {
      hasPricing = true;
      const costInput = (inp - cached) * priceIn;
      const costCached = cached * priceIn * 0.5;
      const costOutput = out * priceOut;
      const costWebSearches = webSearches * 0.02;
      totalCost += costInput + costCached + costOutput + costWebSearches;
    }
  }

  return { cost: totalCost, hasPricing };
}

/**
 * Returns the total session cost for the given chatId, computed from all
 * assistant messages already loaded in the chatMessagesByIdAtom.
 *
 * This is purely derived from in-memory state — no IPC call needed.
 * It recalculates whenever messages change (i.e. stream ends) and whenever
 * the chatId changes.
 */
export function useSessionCost(chatId: number | null | undefined): SessionCostResult {
  const messagesById = useAtomValue(chatMessagesByIdAtom);

  return useMemo<SessionCostResult>(() => {
    if (!chatId) {
      return { totalCostUsd: 0, pricedMessageCount: 0, hasPricing: false };
    }

    const messages: Message[] = messagesById.get(chatId) ?? [];
    let totalCostUsd = 0;
    let pricedMessageCount = 0;

    for (const msg of messages) {
      if (msg.role !== "assistant" || !msg.content) continue;
      const { cost, hasPricing } = extractMessageCost(msg.content);
      if (hasPricing) {
        totalCostUsd += cost;
        pricedMessageCount++;
      }
    }

    return {
      totalCostUsd,
      pricedMessageCount,
      hasPricing: pricedMessageCount > 0,
    };
  }, [chatId, messagesById]);
}
