/**
 * Memory Telemetry — Fire-and-forget logging for the memory pipeline.
 *
 * Inserts rows into memory_telemetry to track extraction/selection outcomes.
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
