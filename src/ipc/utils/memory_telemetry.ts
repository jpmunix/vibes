/**
 * Memory Telemetry — Fire-and-forget logging for the memory pipeline.
 *
 * Two layers:
 * 1. memoryTelemetry — lightweight action counters (for the dashboard UI)
 * 2. memoryPipelineLogs — raw LLM call logs with full payloads (for deep analysis)
 *
 * All functions are async and should be called without await (fire-and-forget).
 */

import log from "electron-log";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";

const logger = log.scope("memory_telemetry");

export type TelemetryAction =
    | "skipped_trivial"
    | "skipped_no_tech"
    | "synthesized"
    | "routed"
    | "overwritten"
    | "merged"
    | "discarded_quality";

/**
 * Log a telemetry event. Fire-and-forget — never throws.
 */
export async function logTelemetry(params: {
    userId: string;
    appId?: number;
    action: TelemetryAction;
    reason?: string;
    extractedKeys?: string[];
}): Promise<void> {
    try {
        const db = getRemoteDb();
        await db.insert(remoteSchema.memoryTelemetry).values({
            userId: params.userId,
            appId: params.appId ?? null,
            action: params.action,
            reason: params.reason ?? null,
            extractedKeys: params.extractedKeys
                ? JSON.stringify(params.extractedKeys)
                : null,
            createdAt: new Date(),
        });
    } catch (err: any) {
        // Telemetry should never break the main flow
        logger.warn(`[Telemetry] Failed to log: ${err.message}`);
    }
}

/**
 * Log a raw pipeline call with full payloads. Fire-and-forget — never throws.
 */
export async function logPipelineCall(params: {
    userId: string;
    appId: number;
    chatId?: number;
    stage: "synthesis" | "router" | "guardian";
    model?: string;
    systemPrompt?: string;
    userMessage?: string;
    rawResponse?: string;
    parsedResult?: any;
    resultCount: number;
    durationMs?: number;
    success: boolean;
    error?: string;
}): Promise<void> {
    try {
        const db = getRemoteDb();
        await db.insert(remoteSchema.memoryPipelineLogs).values({
            userId: params.userId,
            appId: params.appId,
            chatId: params.chatId ?? null,
            stage: params.stage,
            model: params.model ?? null,
            systemPrompt: params.systemPrompt ?? null,
            userMessage: params.userMessage ?? null,
            rawResponse: params.rawResponse ?? null,
            parsedResult: params.parsedResult
                ? JSON.stringify(params.parsedResult)
                : null,
            resultCount: params.resultCount,
            durationMs: params.durationMs ?? null,
            success: params.success ? 1 : 0,
            error: params.error ?? null,
            createdAt: new Date(),
        });
    } catch (err: any) {
        logger.warn(`[Telemetry] Failed to log pipeline call: ${err.message}`);
    }
}
