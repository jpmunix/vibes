/**
 * Memory System — IPC Handlers
 *
 * CRUD operations for the agent memory system.
 * Memories are persistent, structured units of knowledge
 * that provide context to the AI agent across sessions.
 */

import { createTypedHandler } from "./base";
import { memoryContracts } from "../types/memory";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and, or, sql, desc } from "drizzle-orm";
import { buildMemoryContext } from "../utils/memory_context_builder";
import { decayMemories, migrateLegacyTypesToSession, compactOldSessions } from "../utils/memory_lifecycle";
import { restorePendingBuffers } from "../utils/memory_extractor";
import log from "electron-log";

const logger = log.scope("memory_handlers");

export function registerMemoryHandlers(): void {
    // ── GET MEMORIES ─────────────────────────────────────────────────────
    // Returns all memories for the specified app only
    createTypedHandler(memoryContracts.getMemories, async (_event, appId, ctx) => {
        const db = getRemoteDb();
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");

        const rows = await db
            .select()
            .from(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    eq(remoteSchema.memories.appId, appId),
                ),
            );

        return rows.map(mapRowToEntry);
    });

    // ── CREATE MEMORY ────────────────────────────────────────────────────
    createTypedHandler(memoryContracts.createMemory, async (_event, params, ctx) => {
        const db = getRemoteDb();
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");

        const now = new Date();
        const [inserted] = await db
            .insert(remoteSchema.memories)
            .values({
                userId,
                appId: params.appId,
                type: params.type,
                key: params.key ?? null,
                content: params.content,
                importance: params.importance ?? 0.5,
                status: params.status ?? null,
                source: params.source ?? "manual",
                sourceChatId: params.sourceChatId ?? null,
                enabled: 1,
                createdAt: now,
                updatedAt: now,
                lastUsed: now,
            })
            .returning({ id: remoteSchema.memories.id });

        logger.info(`[Memory] Created: type=${params.type} key=${params.key ?? "—"} appId=${params.appId} id=${inserted.id}`);
        return inserted.id;
    });

    // ── UPDATE MEMORY ────────────────────────────────────────────────────
    createTypedHandler(memoryContracts.updateMemory, async (_event, params, ctx) => {
        const db = getRemoteDb();
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");

        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (params.type !== undefined) updates.type = params.type;
        if (params.key !== undefined) updates.key = params.key;
        if (params.content !== undefined) updates.content = params.content;
        if (params.importance !== undefined) updates.importance = params.importance;
        if (params.status !== undefined) updates.status = params.status;
        if (params.enabled !== undefined) updates.enabled = params.enabled ? 1 : 0;

        await db
            .update(remoteSchema.memories)
            .set(updates)
            .where(
                and(
                    eq(remoteSchema.memories.id, params.id),
                    eq(remoteSchema.memories.userId, userId),
                ),
            );

        logger.info(`[Memory] Updated: id=${params.id}`);
    });

    // ── DELETE MEMORY ────────────────────────────────────────────────────
    createTypedHandler(memoryContracts.deleteMemory, async (_event, memoryId, ctx) => {
        const db = getRemoteDb();
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");

        await db
            .delete(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.id, memoryId),
                    eq(remoteSchema.memories.userId, userId),
                ),
            );

        logger.info(`[Memory] Deleted: id=${memoryId}`);
    });

    // ── GET MEMORY CONTEXT ───────────────────────────────────────────────
    createTypedHandler(memoryContracts.getMemoryContext, async (_event, appId, ctx) => {
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");
        return (await buildMemoryContext(appId, userId)).block;
    });

    // ── EXTRACT MEMORIES ─────────────────────────────────────────────────
    // Placeholder — will be implemented in Fase 2 (write pipeline)
    createTypedHandler(memoryContracts.extractMemories, async (_event, _params, _ctx) => {
        return [];
    });

    // ── CONDENSE SESSION MEMORIES ──────────────────────────────────────────
    createTypedHandler(memoryContracts.condenseSessionMemories, async (_event, { appId, chatId }, ctx) => {
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");
        const { forceCondenseChatSession } = await import("../utils/memory_extractor");
        await forceCondenseChatSession({ appId, userId, chatId });
    });

    // ── DECAY MEMORIES ─────────────────────────────────────────────────────
    createTypedHandler(memoryContracts.decayMemories, async (_event, appId, ctx) => {
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");
        return decayMemories(appId, userId);
    });

    // ── GET ALL MEMORIES (global stats) ────────────────────────────────
    createTypedHandler(memoryContracts.getAllMemories, async (_event, _input, ctx) => {
        const db = getRemoteDb();
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");

        const rows = await db
            .select()
            .from(remoteSchema.memories)
            .where(eq(remoteSchema.memories.userId, userId));

        return rows.map(mapRowToEntry);
    });

    // ── DELETE ALL MEMORIES FOR APP ──────────────────────────────────────
    createTypedHandler(memoryContracts.deleteAllMemories, async (_event, appId, ctx) => {
        const db = getRemoteDb();
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");

        // Count first for the return value
        const existing = await db
            .select()
            .from(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    eq(remoteSchema.memories.appId, appId),
                ),
            );

        if (existing.length === 0) return 0;

        await db
            .delete(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    eq(remoteSchema.memories.appId, appId),
                ),
            );

        logger.info(`[Memory] Deleted all: ${existing.length} memories for appId=${appId}`);
        return existing.length;
    });

    // ── MEMORY TELEMETRY STATS ───────────────────────────────────────────
    createTypedHandler(memoryContracts.getMemoryTelemetryStats, async (_event, appId, ctx) => {
        const db = getRemoteDb();
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const conditions = [
            eq(remoteSchema.memoryTelemetry.userId, userId),
            sql`${remoteSchema.memoryTelemetry.createdAt} > ${Math.floor(thirtyDaysAgo.getTime() / 1000)}`,
        ];

        if (appId && appId > 0) {
            conditions.push(eq(remoteSchema.memoryTelemetry.appId, appId));
        }

        const rows = await db
            .select({
                action: remoteSchema.memoryTelemetry.action,
                count: sql<number>`COUNT(*)`,
            })
            .from(remoteSchema.memoryTelemetry)
            .where(and(...conditions))
            .groupBy(remoteSchema.memoryTelemetry.action);

        return rows.map(r => ({ action: r.action, count: Number(r.count) }));
    });

    // ── MEMORY TELEMETRY RECENT ─────────────────────────────────────────
    createTypedHandler(memoryContracts.getMemoryTelemetryRecent, async (_event, appId, ctx) => {
        const db = getRemoteDb();
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");

        const conditions = [
            eq(remoteSchema.memoryTelemetry.userId, userId),
        ];

        if (appId && appId > 0) {
            conditions.push(eq(remoteSchema.memoryTelemetry.appId, appId));
        }

        const rows = await db
            .select({
                action: remoteSchema.memoryTelemetry.action,
                reason: remoteSchema.memoryTelemetry.reason,
                extractedKeys: remoteSchema.memoryTelemetry.extractedKeys,
                createdAt: remoteSchema.memoryTelemetry.createdAt,
            })
            .from(remoteSchema.memoryTelemetry)
            .where(and(...conditions))
            .orderBy(desc(remoteSchema.memoryTelemetry.createdAt))
            .limit(50);

        return rows.map(r => ({
            action: r.action,
            reason: r.reason,
            extractedKeys: r.extractedKeys,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        }));
    });

    // ── PIPELINE LOGS (RAW) ─────────────────────────────────────────────
    createTypedHandler(memoryContracts.getPipelineLogs, async (_event, params, ctx) => {
        const db = getRemoteDb();
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");

        const conditions = [
            eq(remoteSchema.memoryPipelineLogs.userId, userId),
        ];

        if (params.appId && params.appId > 0) {
            conditions.push(eq(remoteSchema.memoryPipelineLogs.appId, params.appId));
        }

        if (params.stage) {
            conditions.push(eq(remoteSchema.memoryPipelineLogs.stage, params.stage));
        }

        const limit = params.limit || 100;

        const rows = await db
            .select()
            .from(remoteSchema.memoryPipelineLogs)
            .where(and(...conditions))
            .orderBy(desc(remoteSchema.memoryPipelineLogs.createdAt))
            .limit(limit);

        return rows.map(r => ({
            id: r.id,
            appId: r.appId,
            chatId: r.chatId,
            stage: r.stage,
            model: r.model,
            systemPrompt: r.systemPrompt,
            userMessage: r.userMessage,
            rawResponse: r.rawResponse,
            parsedResult: r.parsedResult,
            resultCount: r.resultCount,
            durationMs: r.durationMs,
            success: r.success,
            error: r.error,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        }));
    });

    // ── PURGE ALL STATS ──────────────────────────────────────────────────
    createTypedHandler(memoryContracts.purgeAllMemoryStats, async (_event, _input, ctx) => {
        const db = getRemoteDb();
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");

        const telemetryResult = await db
            .delete(remoteSchema.memoryTelemetry)
            .where(eq(remoteSchema.memoryTelemetry.userId, userId));

        const pipelineResult = await db
            .delete(remoteSchema.memoryPipelineLogs)
            .where(eq(remoteSchema.memoryPipelineLogs.userId, userId));

        const telemetryDeleted = (telemetryResult as any).rowsAffected ?? 0;
        const pipelineLogsDeleted = (pipelineResult as any).rowsAffected ?? 0;

        logger.info(`[Memory] Purged all stats: ${telemetryDeleted} telemetry + ${pipelineLogsDeleted} pipeline logs`);
        return { telemetryDeleted, pipelineLogsDeleted };
    });

    // ── APPS WITH ANALYZER DATA ─────────────────────────────────────────
    createTypedHandler(memoryContracts.getAppsWithAnalyzerData, async (_event, _input, ctx) => {
        const db = getRemoteDb();
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");

        // Get distinct appIds from both telemetry and pipeline logs, join with apps for name
        const rows = await db.all<{ id: number; name: string }>(sql`
            SELECT DISTINCT a.id, a.name
            FROM apps a
            WHERE a.user_id = ${userId}
              AND (
                EXISTS (SELECT 1 FROM memory_telemetry mt WHERE mt.app_id = a.id AND mt.user_id = ${userId})
                OR EXISTS (SELECT 1 FROM memory_pipeline_logs mpl WHERE mpl.app_id = a.id AND mpl.user_id = ${userId})
              )
            ORDER BY a.name COLLATE NOCASE
        `);

        return rows;
    });

    // ── BOOTSTRAP PROJECT MEMORIES ──────────────────────────────────────
    // Disabled — returns empty result
    createTypedHandler(memoryContracts.bootstrapProjectMemories, async (_event, _params, ctx) => {
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");
        return { phase1Count: 0, phase2Count: 0 };
    });

    // ── COMPACT MEMORIES (manual trigger) ───────────────────────────────
    createTypedHandler(memoryContracts.compactMemories, async (_event, params, ctx) => {
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");
        return compactOldSessions(params.appId, userId, { force: true });
    });

    // ── GET DEBUG LOGS ──────────────────────────────────────────────────
    createTypedHandler(memoryContracts.getDebugLogs, async (_event, params, ctx) => {
        const db = getRemoteDb();
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");

        const conditions = [
            eq(remoteSchema.memoryDebugLogs.userId, userId),
        ];

        if (params.appId && params.appId > 0) {
            conditions.push(eq(remoteSchema.memoryDebugLogs.appId, params.appId));
        }

        const limit = params.limit || 100;

        const rows = await db
            .select()
            .from(remoteSchema.memoryDebugLogs)
            .where(and(...conditions))
            .orderBy(desc(remoteSchema.memoryDebugLogs.createdAt))
            .limit(limit);

        return rows.map(r => ({
            id: r.id,
            appId: r.appId,
            appName: r.appName,
            filename: r.filename,
            contentMd: r.contentMd,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        }));
    });

    // ── PURGE OLD DEBUG LOGS (>180 days) ──────────────────────────────────
    createTypedHandler(memoryContracts.purgeDebugLogs, async (_event, _input, ctx) => {
        const db = getRemoteDb();
        const userId = ctx.userId;
        if (!userId) throw new Error("Unauthorized");

        const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

        const result = await db
            .delete(remoteSchema.memoryDebugLogs)
            .where(
                and(
                    eq(remoteSchema.memoryDebugLogs.userId, userId),
                    sql`${remoteSchema.memoryDebugLogs.createdAt} < ${Math.floor(cutoff.getTime() / 1000)}`,
                ),
            );

        const deleted = (result as any).rowsAffected ?? 0;
        logger.info(`[Memory] Purged ${deleted} debug logs older than 180 days`);
        return deleted;
    });

    // ── One-time migration: legacy types → session ──────────────────────
    // Fire-and-forget, idempotent, non-blocking
    (async () => {
        try {
            const db = getRemoteDb();
            // Get all distinct userIds to migrate
            const users = await db
                .selectDistinct({ userId: remoteSchema.memories.userId })
                .from(remoteSchema.memories)
                .where(sql`${remoteSchema.memories.type} IN ('fact', 'episode', 'decision')`);

            for (const { userId } of users) {
                if (userId) await migrateLegacyTypesToSession(userId);
            }
        } catch (e: any) {
            logger.warn(`[Memory] Legacy migration sweep failed: ${e.message}`);
        }
    })();

    // ── Restore pending memory buffers from previous session ──────────
    // If the app quit with unflushed rounds, process them now.
    restorePendingBuffers()
        .catch(e => logger.warn(`[Memory] Buffer restoration failed: ${e.message}`));

    // ── Startup cleanup: purge stale auxiliary data ──────────────────
    // Prevents unbounded growth of telemetry/log tables and cleans up
    // inactive memories that are no longer useful.
    (async () => {
        try {
            const db = getRemoteDb();
            const cutoff7d = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

            // Pipeline logs > 7 days → DELETE
            await db.delete(remoteSchema.memoryPipelineLogs)
                .where(sql`${remoteSchema.memoryPipelineLogs.createdAt} < ${cutoff7d}`);

            // Telemetry > 7 days → DELETE
            await db.delete(remoteSchema.memoryTelemetry)
                .where(sql`${remoteSchema.memoryTelemetry.createdAt} < ${cutoff7d}`);

            // Debug logs > 7 days → DELETE
            await db.delete(remoteSchema.memoryDebugLogs)
                .where(sql`${remoteSchema.memoryDebugLogs.createdAt} < ${cutoff7d}`);

            // Inactive memories > 7 days → hard DELETE
            await db.delete(remoteSchema.memories)
                .where(and(
                    eq(remoteSchema.memories.enabled, 0),
                    sql`${remoteSchema.memories.updatedAt} < ${cutoff7d}`,
                ));

            // Finished stream tasks > 7 days → DELETE (running tasks are never purged)
            await db.delete(remoteSchema.streamTasks)
                .where(and(
                    sql`${remoteSchema.streamTasks.status} != 'running'`,
                    sql`${remoteSchema.streamTasks.startedAt} < ${cutoff7d}`,
                ));

            logger.info("[Memory] Startup cleanup: purged stale pipeline logs, telemetry, debug logs, inactive memories, and old stream tasks (>7d)");
        } catch (e: any) {
            logger.warn(`[Memory] Startup cleanup failed: ${e.message}`);
        }
    })();

    // ── One-shot purge: delete all non-manual-preference memories ────
    // In this version, only manual preferences (directrices) are used.
    // All other memory types (session, issue, auto-extracted, etc.) are
    // legacy data that should be cleaned up once.
    (async () => {
        try {
            const { readSettings, writeSettings } = await import("../../main/settings");
            const settings = readSettings();
            if (settings.memoriesLegacyPurged) return; // Already done

            const db = getRemoteDb();
            const result = await db
                .delete(remoteSchema.memories)
                .where(
                    or(
                        sql`${remoteSchema.memories.type} != 'preference'`,
                        sql`${remoteSchema.memories.source} != 'manual'`,
                    ),
                );

            const deleted = (result as any).rowsAffected ?? (result as any).changes ?? 0;
            writeSettings({ memoriesLegacyPurged: true } as any);
            logger.info(`[Memory] One-shot legacy purge: deleted ${deleted} non-manual-preference memories`);
        } catch (e: any) {
            logger.warn(`[Memory] One-shot legacy purge failed: ${e.message}`);
        }
    })();

    logger.info("[Memory] Handlers registered");
}

// =============================================================================
// Helpers
// =============================================================================

function mapRowToEntry(row: typeof remoteSchema.memories.$inferSelect) {
    return {
        id: row.id,
        appId: row.appId,
        type: row.type as any,
        key: row.key,
        content: row.content,
        importance: row.importance,
        status: row.status as any,
        source: row.source as any,
        sourceChatId: row.sourceChatId,
        enabled: row.enabled === 1,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastUsed: row.lastUsed ?? row.createdAt, // Fallback for pre-migration rows
    };
}
