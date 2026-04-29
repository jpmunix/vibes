/**
 * Admin IPC handlers — every handler verifies the caller is the admin user.
 */
import log from "electron-log";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
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

    // ─── GET KNOWLEDGE STATS ────────────────────────────────────────────
    createTypedHandler(adminContracts.getKnowledgeStats, async (_event, _input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();

        const [userRows, appRows, memoryRows, knowledgeRows, pipelineRows, telemetryRows] = await Promise.all([
            db.select().from(remoteSchema.users),
            db.select({ id: remoteSchema.apps.id, userId: remoteSchema.apps.userId, name: remoteSchema.apps.name }).from(remoteSchema.apps),
            db.select().from(remoteSchema.memories),
            db.select().from(remoteSchema.knowledgeEntries),
            db.select().from(remoteSchema.memoryPipelineLogs),
            db.select().from(remoteSchema.memoryTelemetry),
        ]);

        // Build lookup maps
        const appsByUser = new Map<string, typeof appRows>();
        for (const app of appRows) {
            if (!appsByUser.has(app.userId)) appsByUser.set(app.userId, []);
            appsByUser.get(app.userId)!.push(app);
        }

        // Serialize row helper — convert Date objects to ISO strings
        function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(row)) {
                out[k] = v instanceof Date ? v.toISOString() : v;
            }
            return out;
        }

        const users = userRows.map((user) => {
            const userApps = appsByUser.get(user.id) || [];
            const apps = userApps.map((app) => ({
                appId: app.id,
                appName: app.name,
                memories: memoryRows
                    .filter((r) => r.userId === user.id && r.appId === app.id)
                    .map((r) => serializeRow(r as unknown as Record<string, unknown>)),
                knowledgeEntries: knowledgeRows
                    .filter((r) => r.userId === user.id && r.appId === app.id)
                    .map((r) => serializeRow(r as unknown as Record<string, unknown>)),
                pipelineLogs: pipelineRows
                    .filter((r) => r.userId === user.id && r.appId === app.id)
                    .map((r) => serializeRow(r as unknown as Record<string, unknown>)),
                telemetry: telemetryRows
                    .filter((r) => r.userId === user.id && (r.appId === app.id || r.appId === null))
                    .map((r) => serializeRow(r as unknown as Record<string, unknown>)),
            }));

            return {
                userId: user.id,
                displayName: user.displayName,
                email: user.email,
                apps,
            };
        });

        return { users };
    });

    logger.info("Admin handlers registered");
}
