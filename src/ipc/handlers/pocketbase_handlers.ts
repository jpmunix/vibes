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

    // List collections
    createTypedHandler(pocketbaseContracts.listCollections, async (_, params, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const config = await getPocketBaseAppConfig(params.appId, context.userId);

        try {
            // Using superuser auth
            // PocketBase SDK needs fetch natively, in Node we use cross-fetch or global fetch (Node 18+)
            const pb = new PocketBase(config.url);
            await pb.collection('_superusers').authWithPassword(config.adminEmail, config.adminPassword);

            // Get all collections
            const cols = await pb.collections.getFullList({ sort: '-created' });

            const collections = cols.map((c: any) => {
                // Determine fields based on version (PB v0.20+ has 'fields' instead of 'schema')
                const fieldsRaw = c.fields || c.schema || [];
                const fields = fieldsRaw.map((f: any) => ({
                    name: f.name,
                    type: f.type,
                    required: !!f.required,
                }));

                return {
                    id: c.id,
                    name: c.name,
                    type: c.type,
                    system: !!c.system,
                    fields,
                };
            });

            return { collections };
        } catch (err: any) {
            logger.error(`Error listing PocketBase collections for app ${params.appId}:`, err);
            return { collections: [], error: err.message || "Failed to list collections" };
        }
    });
}
