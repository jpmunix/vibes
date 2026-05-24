/**
 * Memory Extractor — DISABLED
 * 
 * The automatic memory extraction pipeline has been removed.
 * All functions are kept as no-op stubs for backward compatibility.
 */

import type { MemoryEntry } from "../types/memory";

export function bufferChatRound(_params: {
    chatId: string;
    appId: number;
    userId: string;
    userPrompt: string;
    assistantResponse: string;
}): void {
    // No-op: automatic extraction disabled
}

export function flushChatBuffer(_chatId: string): void {
    // No-op: automatic extraction disabled
}

export function serializePendingBuffers(): number {
    return 0;
}

export async function restorePendingBuffers(): Promise<void> {
    // No-op: automatic extraction disabled
}

export async function extractMemoriesFromBatch(_params: {
    appId: number;
    userId: string;
    chatId: string;
    rounds: { userPrompt: string; assistantResponse: string }[];
}): Promise<MemoryEntry[]> {
    return [];
}

export async function forceCondenseChatSession(_params: {
    appId: number;
    userId: string;
    chatId: number;
}): Promise<void> {
    // No-op: automatic extraction disabled
}

export async function extractMemoriesFromChatCycle(_params: {
    appId: number;
    userId: string;
    chatId: number;
    userPrompt: string;
    assistantResponse: string;
}): Promise<MemoryEntry[]> {
    return [];
}

export function isNoisy(_content: string): boolean {
    return false;
}
