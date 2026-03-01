import log from "electron-log";
import fetch from "node-fetch";
import PocketBase from "pocketbase";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import { createTypedHandler } from "./base";
import { pocketbaseContracts, PocketBaseConfig } from "../types/pocketbase";

const logger = log.scope("pocketbase_handlers");

// Helper to get app's PocketBase connection info
async function getPocketBaseAppConfig(appId: number, userId: string): Promise<PocketBaseConfig> {
    const db = getRemoteDb();
    const [app] = await db
        .select({ pocketbaseConfig: remoteSchema.apps.pocketbaseConfig })
        .from(remoteSchema.apps)
        .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, userId)));

    if (!app || !app.pocketbaseConfig) {
        throw new Error("PocketBase is not configured for this app");
    }

    return app.pocketbaseConfig as PocketBaseConfig;
}

export function registerPocketBaseHandlers() {
    // Get config
    createTypedHandler(pocketbaseContracts.getConfig, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const db = getRemoteDb();
        const [app] = await db
            .select({ pocketbaseConfig: remoteSchema.apps.pocketbaseConfig })
            .from(remoteSchema.apps)
            .where(and(eq(remoteSchema.apps.id, params.appId), eq(remoteSchema.apps.userId, context.userId)));

        if (!app || !app.pocketbaseConfig) {
            return null;
        }

        return app.pocketbaseConfig as PocketBaseConfig;
    });

    // Set config
    createTypedHandler(pocketbaseContracts.setConfig, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const db = getRemoteDb();
        const { appId, config } = params;

        // Optionally, test the connection before saving
        try {
            const pb = new PocketBase(config.url);
            await pb.collection('_superusers').authWithPassword(config.adminEmail, config.adminPassword);
        } catch (err: any) {
            logger.warn(`Failed to connect to PocketBase during config save: ${err.message}`);
            // We still save it, maybe the instance is down
        }

        await db
            .update(remoteSchema.apps)
            .set({ pocketbaseConfig: config })
            .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)));

        logger.info(`Updated PocketBase config for app ${appId}`);
    });

    // Clear config
    createTypedHandler(pocketbaseContracts.clearConfig, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const db = getRemoteDb();
        const { appId } = params;

        await db
            .update(remoteSchema.apps)
            .set({ pocketbaseConfig: null })
            .where(and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)));

        logger.info(`Cleared PocketBase config for app ${appId}`);
    });

    // List tables (collections)
    createTypedHandler(pocketbaseContracts.listTables, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const config = await getPocketBaseAppConfig(params.appId, context.userId);

        try {
            const pb = new PocketBase(config.url);
            await pb.collection('_superusers').authWithPassword(config.adminEmail, config.adminPassword);

            const collections = await pb.collections.getFullList({ sort: '-created' });

            const tables = await Promise.all(collections.map(async (c: any) => {
                const fieldsRaw = c.fields || c.schema || [];
                const columns = fieldsRaw.map((f: any) => ({
                    name: f.name,
                    type: f.type,
                    nullable: !f.required,
                    defaultValue: f.options?.defaultValue ?? null,
                    isPrimaryKey: f.name === 'id',
                }));

                // Add id field if not present in schema (it's always there in PB)
                if (!columns.find((col: any) => col.name === 'id')) {
                    columns.unshift({
                        name: 'id',
                        type: 'text',
                        nullable: false,
                        defaultValue: null,
                        isPrimaryKey: true,
                    });
                }

                // Get row count
                let rowCount = 0;
                try {
                    const result = await pb.collection(c.name).getList(1, 1);
                    rowCount = result.totalItems;
                } catch (e) {
                    // Ignore, might be empty or system collection
                }

                return {
                    name: c.name,
                    rowCount,
                    columns,
                };
            }));

            return { tables };
        } catch (err: any) {
            logger.error(`Error listing PocketBase tables for app ${params.appId}:`, err);
            throw err;
        }
    });

    // Query table (collection)
    createTypedHandler(pocketbaseContracts.queryTable, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const config = await getPocketBaseAppConfig(params.appId, context.userId);

        try {
            const pb = new PocketBase(config.url);
            await pb.collection('_superusers').authWithPassword(config.adminEmail, config.adminPassword);

            const { table, page = 1, pageSize = 50, orderBy, orderDir = "asc" } = params;

            let sort = "";
            if (orderBy) {
                sort = orderDir === "desc" ? `-${orderBy}` : orderBy;
            }

            const result = await pb.collection(table).getList(page, pageSize, {
                sort,
                // We could add filter handling here if needed
            });

            // Extract columns from the first row or result
            const columns = result.items.length > 0 ? Object.keys(result.items[0]) : [];

            return {
                rows: result.items,
                totalCount: result.totalItems,
                columns,
            };
        } catch (err: any) {
            logger.error(`Error querying PocketBase table ${params.table}:`, err);
            throw err;
        }
    });

    // Execute query (for PB we map it to list-collections as a diagnostic/placeholder)
    createTypedHandler(pocketbaseContracts.executeQuery, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const config = await getPocketBaseAppConfig(params.appId, context.userId);

        try {
            const pb = new PocketBase(config.url);
            await pb.collection('_superusers').authWithPassword(config.adminEmail, config.adminPassword);

            // Since PB doesn't have SQL, we just list collections as "results" if they ask something generic
            // or return an error if it looks like SQL.
            if (params.query.toLowerCase().includes("select")) {
                return {
                    rows: [],
                    columns: [],
                    rowCount: 0,
                    error: "PocketBase does not support raw SQL queries. Please use the collection browser.",
                };
            }

            const cols = await pb.collections.getFullList();
            return {
                rows: cols,
                columns: cols.length > 0 ? Object.keys(cols[0]) : [],
                rowCount: cols.length,
            };
        } catch (err: any) {
            return { rows: [], columns: [], rowCount: 0, error: err.message };
        }
    });

    // Insert row
    createTypedHandler(pocketbaseContracts.insertRow, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const config = await getPocketBaseAppConfig(params.appId, context.userId);

        try {
            const pb = new PocketBase(config.url);
            await pb.collection('_superusers').authWithPassword(config.adminEmail, config.adminPassword);

            const row = await pb.collection(params.table).create(params.data);
            return { success: true, row };
        } catch (err: any) {
            logger.error(`Error inserting into PocketBase ${params.table}:`, err);
            throw err;
        }
    });

    // Update row
    createTypedHandler(pocketbaseContracts.updateRow, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const config = await getPocketBaseAppConfig(params.appId, context.userId);

        try {
            const pb = new PocketBase(config.url);
            await pb.collection('_superusers').authWithPassword(config.adminEmail, config.adminPassword);

            const id = params.primaryKey.id;
            if (!id) throw new Error("Missing id in primary key for PocketBase update");

            await pb.collection(params.table).update(id as string, params.data);
            return { success: true };
        } catch (err: any) {
            logger.error(`Error updating PocketBase row in ${params.table}:`, err);
            throw err;
        }
    });

    // Delete rows
    createTypedHandler(pocketbaseContracts.deleteRows, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const config = await getPocketBaseAppConfig(params.appId, context.userId);

        try {
            const pb = new PocketBase(config.url);
            await pb.collection('_superusers').authWithPassword(config.adminEmail, config.adminPassword);

            let deletedCount = 0;
            for (const pk of params.primaryKeys) {
                if (pk.id) {
                    await pb.collection(params.table).delete(pk.id as string);
                    deletedCount++;
                }
            }

            return { deletedCount };
        } catch (err: any) {
            logger.error(`Error deleting from PocketBase ${params.table}:`, err);
            throw err;
        }
    });
}
