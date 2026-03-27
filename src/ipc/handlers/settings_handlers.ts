import { createTypedHandler, HandlerContext } from "./base";
import { settingsContracts } from "../types/settings";
import { writeSettings, readSettings } from "../../main/settings";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq } from "drizzle-orm";
import log from "electron-log";

const logger = log.scope("settings_handlers");

export async function forceSyncRemoteSettingsToLocal(userId: string) {
  const db = getRemoteDb();
  try {
    const remoteRecord = await db.query.userSettings.findFirst({
      where: eq(remoteSchema.userSettings.userId, userId),
    });
    if (remoteRecord) {
      const remoteSettings = JSON.parse(remoteRecord.settingsJson);

      // --- SESSION DATA EXCLUSION ---
      // We must NEVER overwrite local session data with remote settings data.
      // Remote settings are for user preferences, not for session management.
      // If we overwrite these, the user will be logged out on the next launch.
      delete remoteSettings.userId;
      delete remoteSettings.sessionToken;

      // We must explicitly save these to disk so they immediately become the local truth
      // without needing an initial save from the React frontend.
      writeSettings(remoteSettings);
      return true;
    }
  } catch (error) {
    logger.error("Error force syncing remote user settings to local:", error);
  }
  return false;
}

export function registerSettingsHandlers() {
  // Note: Settings handlers intentionally use createTypedHandler without logging
  // to avoid logging sensitive data (API keys, tokens, etc.) from args/return values.

  createTypedHandler(settingsContracts.getUserSettings, async (_, __, context) => {
    const localSettings = readSettings();
    if (context.userId) {
      const db = getRemoteDb();
      try {
        const remoteRecord = await db.query.userSettings.findFirst({
          where: eq(remoteSchema.userSettings.userId, context.userId),
        });
        if (remoteRecord) {
          try {
            const remoteSettings = JSON.parse(remoteRecord.settingsJson);
            return { ...localSettings, ...remoteSettings };
          } catch (e) {
            logger.error("Failed to parse remote settings JSON", e);
          }
        }
      } catch (error) {
        logger.error("Error fetching remote user settings:", error);
      }
    }
    return localSettings;
  });

  createTypedHandler(settingsContracts.setUserSettings, async (_, settings, context) => {
    writeSettings(settings);
    const updated = readSettings();

    if (context.userId) {
      const db = getRemoteDb();
      try {
        // --- SESSION DATA EXCLUSION ---
        // We strip session data before saving to the remote DB to keep it clean.
        // This prevents stale/old session data from being synced to other devices
        // and causing unexpected logouts.
        const { userId: _u, sessionToken: _s, ...syncableSettings } = updated;
        const settingsJson = JSON.stringify(syncableSettings);

        // Find existing record to update or insert new one
        const existing = await db.query.userSettings.findFirst({
          where: eq(remoteSchema.userSettings.userId, context.userId),
        });

        if (existing) {
          await db
            .update(remoteSchema.userSettings)
            .set({
              settingsJson,
              updatedAt: new Date(),
            })
            .where(eq(remoteSchema.userSettings.userId, context.userId));
        } else {
          await db.insert(remoteSchema.userSettings).values({
            userId: context.userId,
            settingsJson,
            updatedAt: new Date(),
          });
        }
      } catch (error) {
        logger.error("Error syncing settings to remote DB:", error);
      }
    }
    return updated;
  });
}
