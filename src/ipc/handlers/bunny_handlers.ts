import log from "electron-log";
import fetch from "node-fetch";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import { createTypedHandler, HandlerContext } from "./base";
import { bunnyContracts } from "../types/bunny";

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
}
