import { createTypedHandler, HandlerContext } from "./base";
import { settingsContracts } from "../types/settings";
import { writeSettings, readSettings } from "../../main/settings";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq } from "drizzle-orm";

export async function forceSyncRemoteSettingsToLocal(userId: string) {
  const db = getRemoteDb();
  try {
    const remoteRecord = await db.query.userSettings.findFirst({
      where: eq(remoteSchema.userSettings.userId, userId),
    });
    if (remoteRecord) {
      const remoteSettings = JSON.parse(remoteRecord.settingsJson);
      // We must explicitly save these to disk so they immediately become the local truth
      // without needing an initial save from the React frontend.
      writeSettings(remoteSettings);
      return true;
    }
  } catch (error) {
    console.error("Error force syncing remote user settings to local:", error);
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
            console.error("Failed to parse remote settings JSON", e);
          }
        }
      } catch (error) {
        console.error("Error fetching remote user settings:", error);
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
        const settingsJson = JSON.stringify(updated);
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
        console.error("Error syncing settings to remote DB:", error);
      }
    }
    return updated;
  });
}
