import log from "electron-log";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import { createTypedHandler, HandlerContext } from "./base";
import { bunnyContracts } from "../types/bunny";

const logger = log.scope("bunny_handlers");

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
}
