import log from "electron-log";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { apps } from "../../db/schema";
import { createTypedHandler } from "./base";
import { bunnyContracts } from "../types/bunny";

const logger = log.scope("bunny_handlers");

export function registerBunnyHandlers() {
    // Get Bunny config for an app
    createTypedHandler(bunnyContracts.getConfig, async (_, params) => {
        const [app] = await db
            .select({ bunnyConfig: apps.bunnyConfig })
            .from(apps)
            .where(eq(apps.id, params.appId));

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
    createTypedHandler(bunnyContracts.setConfig, async (_, params) => {
        const { appId, config } = params;

        await db
            .update(apps)
            .set({ bunnyConfig: config })
            .where(eq(apps.id, appId));

        logger.info(
            `Updated Bunny.net config for app ${appId}: ${config.databases.length} DBs, ${config.storageZones.length} storage zones`,
        );
    });

    // Clear Bunny config for an app
    createTypedHandler(bunnyContracts.clearConfig, async (_, params) => {
        const { appId } = params;

        await db
            .update(apps)
            .set({ bunnyConfig: null })
            .where(eq(apps.id, appId));

        logger.info(`Cleared Bunny.net config for app ${appId}`);
    });
}
