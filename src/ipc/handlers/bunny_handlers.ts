import log from "electron-log";
import fetch from "node-fetch";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import { createTypedHandler, HandlerContext } from "./base";
import { bunnyContracts, BunnyConfig } from "../types/bunny";
import { createClient, Client } from "@libsql/client";

const logger = log.scope("bunny_handlers");

// Bunny Storage Credentials for avatars
const BUNNY_STORAGE_API_KEY = "d77a3ad3-1def-4842-b4b2bda55195-7dd9-4647";
const BUNNY_STORAGE_URL = "https://storage.bunnycdn.com/minube-vibes/avatars/";
const CDN_BASE_URL = "https://minube-vibes.b-cdn.net/avatars/";

export function registerBunnyHandlers() {
    // Get Bunny config for an app
    createTypedHandler(bunnyContracts.getConfig, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const db = getRemoteDb();
        const [app] = await db
            .select({ bunnyConfig: remoteSchema.apps.bunnyConfig })
            .from(remoteSchema.apps)
            .where(and(eq(remoteSchema.apps.id, params.appId), eq(remoteSchema.apps.userId, context.userId)));

        if (!app || !app.bunnyConfig) {
            return null;
        }

        return app.bunnyConfig as {
            databases: {
                name: string;
                databaseUrl: string;
                fullAccessToken: string;
                readOnlyToken: string;
            }[];
            storageZones: {
                name: string;
                hostname: string;
                username: string;
                password: string;
                readonlyPassword: string;
            }[];
        };
    });

    // Set Bunny config for an app
    createTypedHandler(bunnyContracts.setConfig, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const db = getRemoteDb();
        const { appId, config } = params;

        await db
            .update(remoteSchema.apps)
            .set({ bunnyConfig: config })
            .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)));

        logger.info(
            `Updated Bunny.net config for app ${appId}: ${config.databases.length} DBs, ${config.storageZones.length} storage zones`,
        );
    });

    // Clear Bunny config for an app
    createTypedHandler(bunnyContracts.clearConfig, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const db = getRemoteDb();
        const { appId } = params;

        await db
            .update(remoteSchema.apps)
            .set({ bunnyConfig: null })
            .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)));

        logger.info(`Cleared Bunny.net config for app ${appId}`);
    });

    // Upload avatar to Bunny Storage
    createTypedHandler(bunnyContracts.uploadAvatar, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");

        const { fileName, data, contentType } = params;
        const uploadUrl = `${BUNNY_STORAGE_URL}${fileName}`;

        logger.info(`Uploading avatar to Bunny Storage: ${uploadUrl}`);

        try {
            // Convert data to Buffer if it's a Base64 string or similar
            let body = data;
            if (typeof data === "string" && data.includes(";base64,")) {
                body = Buffer.from(data.split(";base64,")[1], "base64");
            } else if (typeof data === "string") {
                // If it's a string but doesn't look like base64, we'll try to treat it as such if it matches base64 pattern
                // but usually the renderer sends it as a base64 string or the IPC layer handles TypedArrays.
                // To be safe, if it's a string and doesn't have the prefix, we treat it as potentially raw string data
                // or we expect base64 if it's binary data.
                if (data.length > 0 && /^[A-Za-z0-9+/=]+$/.test(data)) {
                    try {
                        body = Buffer.from(data, "base64");
                    } catch {
                        body = data;
                    }
                }
            }

            const response = await fetch(uploadUrl, {
                method: "PUT",
                headers: {
                    "AccessKey": BUNNY_STORAGE_API_KEY,
                    "Content-Type": contentType || "application/octet-stream",
                },
                body: body,
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`Bunny Storage upload failed: ${response.status} ${response.statusText}`, errorText);
                throw new Error(`Error al subir a Bunny Storage: ${response.statusText}`);
            }

            const cdnUrl = `${CDN_BASE_URL}${fileName}`;
            logger.info(`Successfully uploaded avatar. CDN URL: ${cdnUrl}`);

            return cdnUrl;
        } catch (error) {
            logger.error("Failed to upload avatar to Bunny Storage:", error);
            throw error;
        }
    });

    // ─── Database Viewer Handlers ───

    // Helper to get app's Bunny connection info
    async function getBunnyAppConfig(appId: number, userId: string): Promise<BunnyConfig> {
        const db = getRemoteDb();
        const [app] = await db
            .select({ bunnyConfig: remoteSchema.apps.bunnyConfig })
            .from(remoteSchema.apps)
            .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, userId)));

        if (!app || !app.bunnyConfig) {
            throw new Error("Bunny.net not configured for this app");
        }

        return app.bunnyConfig as BunnyConfig;
    }

    // Helper to get LibSQL client for the first database
    async function getLibSqlClient(appId: number, userId: string): Promise<{ client: Client, dbName: string }> {
        const config = await getBunnyAppConfig(appId, userId);
        if (!config.databases || config.databases.length === 0) {
            throw new Error("No Bunny databases configured");
        }

        const dbEntry = config.databases[0];
        return {
            client: createClient({
                url: dbEntry.databaseUrl,
                authToken: dbEntry.fullAccessToken,
            }),
            dbName: dbEntry.name,
        };
    }

    // List tables
    createTypedHandler(bunnyContracts.listTables, async (_, { appId }, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const { client } = await getLibSqlClient(appId, context.userId);

        try {
            // Get table names
            const tablesResult = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
            const tableNames = tablesResult.rows.map(r => r.name as string);

            const tables = await Promise.all(tableNames.map(async (name) => {
                // Get row count
                const countResult = await client.execute(`SELECT COUNT(*) as count FROM "${name}"`);
                const rowCount = Number(countResult.rows[0].count);

                // Get column info
                const infoResult = await client.execute(`PRAGMA table_info("${name}")`);
                const columns = infoResult.rows.map(c => ({
                    name: c.name as string,
                    type: c.type as string,
                    nullable: c.notnull === 0,
                    defaultValue: c.dflt_value,
                    isPrimaryKey: c.pk === 1,
                }));

                return { name, rowCount, columns };
            }));

            return { tables };
        } finally {
            client.close();
        }
    });

    // Query table
    createTypedHandler(bunnyContracts.queryTable, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const { appId, table, page = 1, pageSize = 50, orderBy, orderDir = "asc", filters } = params;
        const { client } = await getLibSqlClient(appId, context.userId);

        try {
            let whereClause = "";
            const args: any[] = [];
            if (filters && filters.length > 0) {
                const conditions = filters.map((f, i) => {
                    const col = `"${f.column}"`;
                    if (f.operator === "IS NULL") return `${col} IS NULL`;
                    if (f.operator === "IS NOT NULL") return `${col} IS NOT NULL`;

                    // Simple mapping for SQLite operators
                    let op = f.operator;
                    if (op === "ILIKE") op = "LIKE"; // SQLite LIKE is usually case-insensitive anyway or we just use LIKE

                    args.push(f.value);
                    return `${col} ${op} ?`;
                });
                whereClause = `WHERE ${conditions.join(" AND ")}`;
            }

            const orderClause = orderBy
                ? `ORDER BY "${orderBy}" ${orderDir === "desc" ? "DESC" : "ASC"}`
                : "";
            const offset = (page - 1) * pageSize;

            // Count query
            const countResult = await client.execute({
                sql: `SELECT COUNT(*) as total FROM "${table}" ${whereClause};`,
                args
            });
            const totalCount = Number(countResult.rows[0].total);

            // Data query
            const dataResult = await client.execute({
                sql: `SELECT * FROM "${table}" ${whereClause} ${orderClause} LIMIT ${pageSize} OFFSET ${offset};`,
                args
            });

            const rows = dataResult.rows.map(r => ({ ...r }));
            const columns = dataResult.columns;

            return { rows, totalCount, columns };
        } finally {
            client.close();
        }
    });

    // Execute raw SQL
    createTypedHandler(bunnyContracts.executeQuery, async (_, { appId, query }, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const { client } = await getLibSqlClient(appId, context.userId);

        try {
            const result = await client.execute(query);
            const rows = result.rows.map(r => ({ ...r }));
            const columns = result.columns;
            return { rows, columns, rowCount: rows.length };
        } catch (err: any) {
            return { rows: [], columns: [], rowCount: 0, error: err.message };
        } finally {
            client.close();
        }
    });

    // Insert row
    createTypedHandler(bunnyContracts.insertRow, async (_, { appId, table, data }, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const { client } = await getLibSqlClient(appId, context.userId);

        try {
            const keys = Object.keys(data);
            const cols = keys.map(k => `"${k}"`).join(", ");
            const placeholders = keys.map(() => "?").join(", ");
            const args = keys.map(k => data[k]);

            const query = `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) RETURNING *;`;
            const result = await client.execute({ sql: query, args });

            return { success: true, row: result.rows[0] ? { ...result.rows[0] } : undefined };
        } finally {
            client.close();
        }
    });

    // Update row
    createTypedHandler(bunnyContracts.updateRow, async (_, { appId, table, primaryKey, data }, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const { client } = await getLibSqlClient(appId, context.userId);

        try {
            const setKeys = Object.keys(data);
            const setClause = setKeys.map(k => `"${k}" = ?`).join(", ");
            const setArgs = setKeys.map(k => data[k]);

            const pkKeys = Object.keys(primaryKey);
            const whereClause = pkKeys.map(k => `"${k}" = ?`).join(" AND ");
            const pkArgs = pkKeys.map(k => primaryKey[k]);

            const query = `UPDATE "${table}" SET ${setClause} WHERE ${whereClause};`;
            await client.execute({ sql: query, args: [...setArgs, ...pkArgs] });

            return { success: true };
        } finally {
            client.close();
        }
    });

    // Delete rows
    createTypedHandler(bunnyContracts.deleteRows, async (_, { appId, table, primaryKeys }, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const { client } = await getLibSqlClient(appId, context.userId);

        try {
            let deletedCount = 0;
            for (const pk of primaryKeys) {
                const pkKeys = Object.keys(pk);
                const whereClause = pkKeys.map(k => `"${k}" = ?`).join(" AND ");
                const pkArgs = pkKeys.map(k => pk[k]);

                const query = `DELETE FROM "${table}" WHERE ${whereClause};`;
                await client.execute({ sql: query, args: pkArgs });
                deletedCount++;
            }

            return { deletedCount };
        } finally {
            client.close();
        }
    });
}
