/**
 * IPC handlers for custom auth system (Bunny SQLite).
 * Passwords hashed with bcrypt. Sessions tracked via session_token in users table.
 */
import log from "electron-log";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createTypedHandler } from "./base";
import { authContracts } from "../types/auth";
import { getRemoteDb, initializeRemoteSchema } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import type { VibesUserDto } from "../types/auth";
import fs from "node:fs";
import path from "node:path";
import { getUserDataPath } from "../../paths/paths";
import { writeSettings } from "../../main/settings";

const logger = log.scope("auth-handlers");
const SALT_ROUNDS = 10;

/**
 * Check if the user has a local SQLite database that needs migration
 */
function hasLocalDatabase(): boolean {
    try {
        const userDataPath = getUserDataPath();
        const dbPath = path.join(userDataPath, "sqlite.db");
        return fs.existsSync(dbPath);
    } catch {
        return false;
    }
}

/**
 * Convert a DB row to a VibesUserDto
 */
function toUserDto(row: typeof remoteSchema.users.$inferSelect): VibesUserDto {
    return {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        photoUrl: row.photoUrl ?? null,
        createdAt:
            row.createdAt instanceof Date
                ? row.createdAt.getTime()
                : Number(row.createdAt),
    };
}

export function registerAuthHandlers(): void {
    logger.info("Registering auth handlers...");

    // ─── REGISTER ──────────────────────────────────────────────────────────
    createTypedHandler(authContracts.register, async (_event, input) => {
        logger.info(`Registering user: ${input.email}`);

        // Ensure remote schema is initialized
        await initializeRemoteSchema();

        const db = getRemoteDb();

        // Check if email already exists
        const existing = await db
            .select()
            .from(remoteSchema.users)
            .where(eq(remoteSchema.users.email, input.email.toLowerCase().trim()))
            .limit(1);

        if (existing.length > 0) {
            throw new Error("Ya existe una cuenta con este email");
        }

        // Hash password with bcrypt
        const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
        const userId = uuidv4();
        const sessionToken = uuidv4();
        const now = new Date();
        const hasLocalDb = hasLocalDatabase();

        // Insert user
        await db.insert(remoteSchema.users).values({
            id: userId,
            email: input.email.toLowerCase().trim(),
            passwordHash,
            displayName: input.displayName || input.email.split("@")[0],
            photoUrl: null,
            createdAt: now,
            lastLoginAt: now,
            sessionToken,
            migrationStatus: hasLocalDb ? "pending" : "not_needed",
        });

        logger.info(`User registered successfully: ${userId}`);

        writeSettings({
            userId,
            sessionToken: { value: sessionToken, encryptionType: "plaintext" },
        });

        const user: VibesUserDto = {
            id: userId,
            email: input.email.toLowerCase().trim(),
            displayName: input.displayName || input.email.split("@")[0],
            photoUrl: null,
            createdAt: now.getTime(),
        };

        return {
            user,
            sessionToken,
            needsMigration: hasLocalDb,
        };
    });

    // ─── LOGIN ─────────────────────────────────────────────────────────────
    createTypedHandler(authContracts.login, async (_event, input) => {
        logger.info(`Login attempt: ${input.email}`);

        await initializeRemoteSchema();
        const db = getRemoteDb();

        // Find user by email
        const rows = await db
            .select()
            .from(remoteSchema.users)
            .where(eq(remoteSchema.users.email, input.email.toLowerCase().trim()))
            .limit(1);

        if (rows.length === 0) {
            throw new Error("Email o contraseña incorrectos");
        }

        const user = rows[0];

        // Verify password
        const passwordValid = await bcrypt.compare(
            input.password,
            user.passwordHash,
        );
        if (!passwordValid) {
            throw new Error("Email o contraseña incorrectos");
        }

        // Generate new session token and update last login
        const sessionToken = uuidv4();
        const now = new Date();
        await db
            .update(remoteSchema.users)
            .set({
                sessionToken,
                lastLoginAt: now,
            })
            .where(eq(remoteSchema.users.id, user.id));

        const hasLocalDb = hasLocalDatabase();
        const needsMigration =
            hasLocalDb && user.migrationStatus !== "completed";

        logger.info(`Login successful: ${user.id}`);

        writeSettings({
            userId: user.id,
            sessionToken: { value: sessionToken, encryptionType: "plaintext" },
        });

        return {
            user: toUserDto(user),
            sessionToken,
            needsMigration,
        };
    });

    // ─── VERIFY SESSION ────────────────────────────────────────────────────
    createTypedHandler(authContracts.verifySession, async (_event, input) => {
        try {
            await initializeRemoteSchema();
            const db = getRemoteDb();

            const rows = await db
                .select()
                .from(remoteSchema.users)
                .where(eq(remoteSchema.users.id, input.userId))
                .limit(1);

            if (rows.length === 0) {
                return { valid: false, user: null, needsMigration: false };
            }

            const user = rows[0];
            const valid = user.sessionToken === input.sessionToken;

            if (!valid) {
                return { valid: false, user: null, needsMigration: false };
            }

            const hasLocalDb = hasLocalDatabase();
            const needsMigration =
                hasLocalDb && user.migrationStatus !== "completed";

            // Ensure settings are synced
            writeSettings({
                userId: user.id,
                sessionToken: { value: sessionToken, encryptionType: "plaintext" },
            });

            return {
                valid: true,
                user: toUserDto(user),
                needsMigration,
            };
        } catch (error) {
            logger.error("Session verification failed:", error);
            return { valid: false, user: null, needsMigration: false };
        }
    });

    // ─── UPDATE PROFILE ────────────────────────────────────────────────────
    createTypedHandler(authContracts.updateProfile, async (_event, input) => {
        const db = getRemoteDb();

        const updates: Partial<typeof remoteSchema.users.$inferInsert> = {};
        if (input.displayName !== undefined) updates.displayName = input.displayName;
        if (input.photoUrl !== undefined) updates.photoUrl = input.photoUrl;

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

        return toUserDto(rows[0]);
    });

    // ─── CHANGE PASSWORD ───────────────────────────────────────────────────
    createTypedHandler(authContracts.changePassword, async (_event, input) => {
        const db = getRemoteDb();

        const rows = await db
            .select()
            .from(remoteSchema.users)
            .where(eq(remoteSchema.users.id, input.userId))
            .limit(1);

        if (rows.length === 0) {
            throw new Error("Usuario no encontrado");
        }

        const user = rows[0];

        // Verify current password
        const currentValid = await bcrypt.compare(
            input.currentPassword,
            user.passwordHash,
        );
        if (!currentValid) {
            throw new Error("La contraseña actual es incorrecta");
        }

        // Hash and set new password
        const newHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
        await db
            .update(remoteSchema.users)
            .set({ passwordHash: newHash })
            .where(eq(remoteSchema.users.id, input.userId));

        return { success: true };
    });

    // ─── LOGOUT ────────────────────────────────────────────────────────────
    createTypedHandler(authContracts.logout, async (_event, input) => {
        const db = getRemoteDb();

        // Clear session token on the server
        await db
            .update(remoteSchema.users)
            .set({ sessionToken: null })
            .where(eq(remoteSchema.users.id, input.userId));

        // Clear locally
        writeSettings({
            userId: undefined,
            sessionToken: undefined,
        });

        logger.info(`User logged out: ${input.userId}`);
    });

    logger.info("Auth handlers registered");
}
