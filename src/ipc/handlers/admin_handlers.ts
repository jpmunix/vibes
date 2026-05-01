/**
 * Admin IPC handlers — every handler verifies the caller is the admin user.
 */
import log from "electron-log";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { eq, sql, max } from "drizzle-orm";
import { createTypedHandler } from "./base";
import { adminContracts } from "../types/admin";
import type { AdminUser } from "../types/admin";
import { getRemoteDb, initializeRemoteSchema } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { isAdmin } from "../../lib/admin";

const logger = log.scope("admin-handlers");
const SALT_ROUNDS = 10;

/**
 * Throw if the current session user is not the admin.
 */
function assertAdmin(context: { userId?: string }): void {
    if (!isAdmin(context.userId)) {
        throw new Error("Acceso denegado: privilegios de administrador requeridos");
    }
}

/**
 * Convert a DB user row to the AdminUser DTO.
 */
function toAdminUser(row: typeof remoteSchema.users.$inferSelect): AdminUser {
    return {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        photoUrl: row.photoUrl ?? null,
        createdAt:
            row.createdAt instanceof Date
                ? row.createdAt.getTime()
                : Number(row.createdAt),
        lastLoginAt: row.lastLoginAt
            ? row.lastLoginAt instanceof Date
                ? row.lastLoginAt.getTime()
                : Number(row.lastLoginAt)
            : null,
    };
}

export function registerAdminHandlers(): void {
    logger.info("Registering admin handlers...");

    // ─── LIST USERS ─────────────────────────────────────────────────────
    createTypedHandler(adminContracts.listUsers, async (_event, _input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();

        const rows = await db.select().from(remoteSchema.users);
        return { users: rows.map(toAdminUser) };
    });

    // ─── CREATE USER ────────────────────────────────────────────────────
    createTypedHandler(adminContracts.createUser, async (_event, input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();

        // Check if email already exists
        const existing = await db
            .select()
            .from(remoteSchema.users)
            .where(eq(remoteSchema.users.email, input.email.toLowerCase().trim()))
            .limit(1);

        if (existing.length > 0) {
            throw new Error("Ya existe un usuario con este email");
        }

        const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
        const userId = uuidv4();
        const now = new Date();

        await db.insert(remoteSchema.users).values({
            id: userId,
            email: input.email.toLowerCase().trim(),
            passwordHash,
            displayName: input.displayName.trim(),
            photoUrl: null,
            createdAt: now,
            lastLoginAt: null,
            sessionToken: null,
            migrationStatus: "not_needed",
        });

        logger.info(`Admin created user: ${userId} (${input.email})`);

        return {
            id: userId,
            email: input.email.toLowerCase().trim(),
            displayName: input.displayName.trim(),
            photoUrl: null,
            createdAt: now.getTime(),
            lastLoginAt: null,
        };
    });

    // ─── UPDATE USER ────────────────────────────────────────────────────
    createTypedHandler(adminContracts.updateUser, async (_event, input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();

        const updates: Partial<typeof remoteSchema.users.$inferInsert> = {};
        if (input.email !== undefined) updates.email = input.email.toLowerCase().trim();
        if (input.displayName !== undefined) updates.displayName = input.displayName.trim();

        if (Object.keys(updates).length === 0) {
            throw new Error("No se proporcionaron cambios");
        }

        // If email is being changed, verify it's not already taken by another user
        if (updates.email) {
            const existing = await db
                .select()
                .from(remoteSchema.users)
                .where(eq(remoteSchema.users.email, updates.email))
                .limit(1);

            if (existing.length > 0 && existing[0].id !== input.userId) {
                throw new Error("Ya existe un usuario con este email");
            }
        }

        await db
            .update(remoteSchema.users)
            .set(updates)
            .where(eq(remoteSchema.users.id, input.userId));

        const rows = await db
            .select()
            .from(remoteSchema.users)
            .where(eq(remoteSchema.users.id, input.userId))
            .limit(1);

        if (rows.length === 0) {
            throw new Error("Usuario no encontrado");
        }

        logger.info(`Admin updated user: ${input.userId}`);
        return toAdminUser(rows[0]);
    });

    // ─── RESET PASSWORD ─────────────────────────────────────────────────
    createTypedHandler(adminContracts.resetPassword, async (_event, input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();

        const rows = await db
            .select()
            .from(remoteSchema.users)
            .where(eq(remoteSchema.users.id, input.userId))
            .limit(1);

        if (rows.length === 0) {
            throw new Error("Usuario no encontrado");
        }

        const newHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
        await db
            .update(remoteSchema.users)
            .set({ passwordHash: newHash })
            .where(eq(remoteSchema.users.id, input.userId));

        logger.info(`Admin reset password for user: ${input.userId}`);
        return { success: true };
    });

    // ─── LIST APPS (all users) ──────────────────────────────────────────
    createTypedHandler(adminContracts.listApps, async (_event, _input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();

        const [appRows, userRows] = await Promise.all([
            db.select({
                id: remoteSchema.apps.id,
                userId: remoteSchema.apps.userId,
                name: remoteSchema.apps.name,
                path: remoteSchema.apps.path,
                createdAt: remoteSchema.apps.createdAt,
                updatedAt: remoteSchema.apps.updatedAt,
                primaryLanguage: remoteSchema.apps.primaryLanguage,
                projectType: remoteSchema.apps.projectType,
                githubOrg: remoteSchema.apps.githubOrg,
                githubRepo: remoteSchema.apps.githubRepo,
            }).from(remoteSchema.apps),
            db.select().from(remoteSchema.users),
        ]);

        // Compute last message timestamp per app (latest activity)
        const lastMsgRows = await db.select({
            appId: remoteSchema.chats.appId,
            lastMessageAt: max(remoteSchema.messages.createdAt).as("last_message_at"),
        })
            .from(remoteSchema.messages)
            .innerJoin(remoteSchema.chats, eq(remoteSchema.messages.chatId, remoteSchema.chats.id))
            .groupBy(remoteSchema.chats.appId);

        const lastMsgMap = new Map<number, number>();
        for (const row of lastMsgRows) {
            if (row.appId != null && row.lastMessageAt != null) {
                const ts = row.lastMessageAt instanceof Date ? row.lastMessageAt.getTime() : Number(row.lastMessageAt);
                if (!isNaN(ts)) lastMsgMap.set(row.appId, ts);
            }
        }

        const apps = appRows.map((a) => ({
            id: a.id,
            userId: a.userId,
            name: a.name,
            path: a.path,
            createdAt: a.createdAt instanceof Date ? a.createdAt.getTime() : Number(a.createdAt),
            updatedAt: a.updatedAt instanceof Date ? a.updatedAt.getTime() : Number(a.updatedAt),
            primaryLanguage: a.primaryLanguage ?? null,
            projectType: a.projectType ?? null,
            githubOrg: a.githubOrg ?? null,
            githubRepo: a.githubRepo ?? null,
            lastMessageAt: lastMsgMap.get(a.id) ?? null,
        }));

        return { apps, users: userRows.map(toAdminUser) };
    });

    // ─── GET USER SETTINGS ──────────────────────────────────────────────
    createTypedHandler(adminContracts.getUserSettings, async (_event, input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();

        const rows = await db
            .select({ settingsJson: remoteSchema.userSettings.settingsJson })
            .from(remoteSchema.userSettings)
            .where(eq(remoteSchema.userSettings.userId, input.userId))
            .limit(1);

        if (rows.length === 0) {
            return { settings: null };
        }

        try {
            const parsed = JSON.parse(rows[0].settingsJson);
            return { settings: parsed };
        } catch {
            logger.warn(`Failed to parse settings JSON for user ${input.userId}`);
            return { settings: null };
        }
    });

    // ─── GET ALL USERS SETTINGS ─────────────────────────────────────────
    createTypedHandler(adminContracts.getAllUsersSettings, async (_event, _input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();

        const [userRows, settingsRows] = await Promise.all([
            db.select().from(remoteSchema.users),
            db.select().from(remoteSchema.userSettings),
        ]);

        const settingsMap = new Map<string, string>();
        for (const row of settingsRows) {
            settingsMap.set(row.userId, row.settingsJson);
        }

        const usersSettings = userRows.map((user) => {
            const raw = settingsMap.get(user.id);
            let settings: Record<string, unknown> | null = null;
            if (raw) {
                try { settings = JSON.parse(raw); } catch { /* skip */ }
            }
            return {
                userId: user.id,
                displayName: user.displayName,
                email: user.email,
                settings,
            };
        });

        return { usersSettings };
    });

    // ─── ADMIN MEMORY STATS (per user, per app) ─────────────────────────
    createTypedHandler(adminContracts.getAdminMemoryStats, async (_event, _input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();

        const [userRows, appRows, memoryRows] = await Promise.all([
            db.select().from(remoteSchema.users),
            db.select({ id: remoteSchema.apps.id, userId: remoteSchema.apps.userId, name: remoteSchema.apps.name }).from(remoteSchema.apps),
            db.select({
                userId: remoteSchema.memories.userId,
                appId: remoteSchema.memories.appId,
                enabled: remoteSchema.memories.enabled,
                source: remoteSchema.memories.source,
            }).from(remoteSchema.memories),
        ]);

        const appsByUser = new Map<string, typeof appRows>();
        for (const app of appRows) {
            if (!appsByUser.has(app.userId)) appsByUser.set(app.userId, []);
            appsByUser.get(app.userId)!.push(app);
        }

        const users = userRows.map((user) => {
            const userApps = appsByUser.get(user.id) || [];
            const apps = userApps
                .map((app) => {
                    const appMems = memoryRows.filter((r) => r.userId === user.id && r.appId === app.id);
                    if (appMems.length === 0) return null;
                    let enabled = 0, disabled = 0, autoCount = 0, manualCount = 0;
                    for (const m of appMems) {
                        if (m.enabled) enabled++; else disabled++;
                        if (m.source === "auto") autoCount++; else manualCount++;
                    }
                    return { appId: app.id, appName: app.name, total: appMems.length, enabled, disabled, autoCount, manualCount };
                })
                .filter(Boolean) as { appId: number; appName: string; total: number; enabled: number; disabled: number; autoCount: number; manualCount: number }[];

            return { userId: user.id, displayName: user.displayName, apps };
        }).filter((u) => u.apps.length > 0);

        return { users };
    });

    // ─── ADMIN ANALYZER DATA (telemetry + pipeline for a user) ──────────
    createTypedHandler(adminContracts.getAdminAnalyzerData, async (_event, input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();
        const { eq, and, desc } = await import("drizzle-orm");

        const { userId, appId } = input;
        const filterApp = appId && appId > 0;

        // Get apps list for this user that have analyzer data
        const userApps = await db
            .select({ id: remoteSchema.apps.id, name: remoteSchema.apps.name })
            .from(remoteSchema.apps)
            .where(eq(remoteSchema.apps.userId, userId));

        // Filter to apps that actually have telemetry or pipeline data
        const telemetryAppIds = new Set(
            (await db
                .select({ appId: remoteSchema.memoryTelemetry.appId })
                .from(remoteSchema.memoryTelemetry)
                .where(eq(remoteSchema.memoryTelemetry.userId, userId))
            ).map((r) => r.appId)
        );
        const pipelineAppIds = new Set(
            (await db
                .select({ appId: remoteSchema.memoryPipelineLogs.appId })
                .from(remoteSchema.memoryPipelineLogs)
                .where(eq(remoteSchema.memoryPipelineLogs.userId, userId))
            ).map((r) => r.appId)
        );
        const apps = userApps.filter((a) => telemetryAppIds.has(a.id) || pipelineAppIds.has(a.id));

        // Telemetry stats — aggregate action counts
        const telWhere = filterApp
            ? and(eq(remoteSchema.memoryTelemetry.userId, userId), eq(remoteSchema.memoryTelemetry.appId, appId))
            : eq(remoteSchema.memoryTelemetry.userId, userId);

        const telRows = await db
            .select({ action: remoteSchema.memoryTelemetry.action })
            .from(remoteSchema.memoryTelemetry)
            .where(telWhere);

        const statsMap: Record<string, number> = {};
        for (const r of telRows) {
            statsMap[r.action] = (statsMap[r.action] || 0) + 1;
        }
        const stats = Object.entries(statsMap).map(([action, count]) => ({ action, count }));

        // Recent telemetry events (last 50)
        const recentRows = await db
            .select({
                action: remoteSchema.memoryTelemetry.action,
                reason: remoteSchema.memoryTelemetry.reason,
                extractedKeys: remoteSchema.memoryTelemetry.extractedKeys,
                createdAt: remoteSchema.memoryTelemetry.createdAt,
            })
            .from(remoteSchema.memoryTelemetry)
            .where(telWhere)
            .orderBy(desc(remoteSchema.memoryTelemetry.createdAt))
            .limit(50);

        const recent = recentRows.map((r) => ({
            action: r.action,
            reason: r.reason,
            extractedKeys: r.extractedKeys,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        }));

        // Pipeline logs (last 50)
        const plWhere = filterApp
            ? and(eq(remoteSchema.memoryPipelineLogs.userId, userId), eq(remoteSchema.memoryPipelineLogs.appId, appId))
            : eq(remoteSchema.memoryPipelineLogs.userId, userId);

        const plRows = await db
            .select()
            .from(remoteSchema.memoryPipelineLogs)
            .where(plWhere)
            .orderBy(desc(remoteSchema.memoryPipelineLogs.createdAt))
            .limit(50);

        const pipelineLogs = plRows.map((r) => ({
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

        return { apps, stats, recent, pipelineLogs };
    });

    // ─── ADMIN: LIST CHATS FOR AN APP ───────────────────────────────────
    createTypedHandler(adminContracts.getAppChats, async (_event, input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();
        const { eq, desc, count } = await import("drizzle-orm");

        // Get chats with message count using standard Drizzle aggregation
        const chats = await db
            .select({
                id: remoteSchema.chats.id,
                title: remoteSchema.chats.title,
                createdAt: remoteSchema.chats.createdAt,
                messageCount: count(remoteSchema.messages.id),
            })
            .from(remoteSchema.chats)
            .leftJoin(remoteSchema.messages, eq(remoteSchema.chats.id, remoteSchema.messages.chatId))
            .where(eq(remoteSchema.chats.appId, input.appId))
            .groupBy(remoteSchema.chats.id)
            .orderBy(desc(remoteSchema.chats.createdAt));

        return chats.map((c) => ({
            id: c.id,
            title: c.title,
            createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
            messageCount: Number(c.messageCount) || 0,
        }));
    });

    // ─── ADMIN: GET FULL CHAT WITH MESSAGES ─────────────────────────────
    createTypedHandler(adminContracts.getAdminChat, async (_event, input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();
        const { eq, asc } = await import("drizzle-orm");

        const chat = await db.query.chats.findFirst({
            where: eq(remoteSchema.chats.id, input.chatId),
            with: {
                messages: {
                    orderBy: (messages: any, ops: any) => [ops.asc(messages.createdAt)],
                },
            },
        });

        if (!chat) throw new Error("Chat not found");

        const { normalizeLegacyTags } = await import("../../../shared/normalizeLegacyTags");

        return {
            id: chat.id,
            title: chat.title ?? "",
            createdAt: chat.createdAt instanceof Date ? chat.createdAt.toISOString() : String(chat.createdAt),
            messages: chat.messages.map((m: any) => ({
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content ? normalizeLegacyTags(m.content) : "",
                model: m.model ?? null,
                createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt ? String(m.createdAt) : null,
                durationMs: m.durationMs ?? null,
                totalTokens: m.totalTokens ?? null,
            })),
        };
    });

    // ─── ADMIN: GET DEBUG LOGS ──────────────────────────────────────────
    createTypedHandler(adminContracts.getAdminDebugLogs, async (_event, input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();
        const { eq, and, desc } = await import("drizzle-orm");

        const conditions = [
            eq(remoteSchema.memoryDebugLogs.userId, input.userId),
        ];

        if (input.appId && input.appId > 0) {
            conditions.push(eq(remoteSchema.memoryDebugLogs.appId, input.appId));
        }

        const limit = input.limit || 500;

        const rows = await db
            .select()
            .from(remoteSchema.memoryDebugLogs)
            .where(and(...conditions))
            .orderBy(desc(remoteSchema.memoryDebugLogs.createdAt))
            .limit(limit);

        return rows.map(r => ({
            id: r.id,
            appId: r.appId,
            sessionId: r.sessionId,
            logType: r.logType,
            stage: r.stage,
            message: r.message,
            dataJson: r.dataJson,
            contentMd: r.contentMd,
            elapsedMs: r.elapsedMs,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        }));
    });

    logger.info("Admin handlers registered");
}
