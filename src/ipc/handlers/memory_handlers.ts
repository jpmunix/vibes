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
import { decayMemories } from "../utils/memory_lifecycle";
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
        return buildMemoryContext(appId, userId);
    });

    // ── EXTRACT MEMORIES ─────────────────────────────────────────────────
    // Placeholder — will be implemented in Fase 2 (write pipeline)
    createTypedHandler(memoryContracts.extractMemories, async (_event, _params, _ctx) => {
        return [];
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
