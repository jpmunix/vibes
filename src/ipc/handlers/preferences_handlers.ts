import { createTypedHandler } from "./base";
import { miscContracts } from "../types/misc";
import { getRemoteDb } from "../../db/remote";
import { userPreferences } from "../../db/remote-schema";
import { eq, and, inArray } from "drizzle-orm";
import log from "electron-log";

const logger = log.scope("preferences");

export function registerPreferencesHandlers() {
  // Get a single preference value
  createTypedHandler(miscContracts.getPreference, async (_, { key, appId }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const effectiveAppId = appId ?? 0;
    const db = getRemoteDb();

    const rows = await db
      .select({ value: userPreferences.value })
      .from(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, context.userId),
          eq(userPreferences.key, key),
          eq(userPreferences.appId, effectiveAppId),
        ),
      );

    return rows.length > 0 ? rows[0].value : null;
  });

  // Set a preference (upsert via onConflictDoUpdate)
  createTypedHandler(miscContracts.setPreference, async (_, { key, value, appId }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const effectiveAppId = appId ?? 0;
    const db = getRemoteDb();
    const now = new Date();

    await db
      .insert(userPreferences)
      .values({
        userId: context.userId,
        appId: effectiveAppId,
        key,
        value,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userPreferences.userId, userPreferences.key, userPreferences.appId],
        set: {
          value,
          updatedAt: now,
        },
      });

    logger.log(`Preference set: ${key} (appId=${effectiveAppId})`);
  });

  // Get multiple preferences at once
  createTypedHandler(miscContracts.getPreferences, async (_, { keys, appId }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const effectiveAppId = appId ?? 0;
    const db = getRemoteDb();

    const rows = await db
      .select({
        key: userPreferences.key,
        value: userPreferences.value,
      })
      .from(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, context.userId),
          inArray(userPreferences.key, keys),
          eq(userPreferences.appId, effectiveAppId),
        ),
      );

    const result: Record<string, string | null> = {};
    for (const k of keys) {
      const row = rows.find((r) => r.key === k);
      result[k] = row ? row.value : null;
    }
    return result;
  });

  logger.info("Registered preferences handlers");
}
