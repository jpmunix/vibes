import { createTypedHandler } from "./base";
import { miscContracts } from "../types/misc";
import { preferencesCache } from "../../main/preferences-cache";
import { BrowserWindow } from "electron";
import { safeSend } from "../utils/safe_sender";
import log from "electron-log";

const logger = log.scope("preferences");

export function registerPreferencesHandlers() {
  // Get a single preference value (from cache, 0 DB queries)
  createTypedHandler(miscContracts.getPreference, async (_, { key, appId }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    return preferencesCache.get(context.userId, key, appId ?? 0);
  });

  // Set a preference (cache update + async DB write + broadcast)
  createTypedHandler(miscContracts.setPreference, async (event, { key, value, appId }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    preferencesCache.set(context.userId, key, value, appId ?? 0);

    // Broadcast to ALL other windows for cross-window sync
    const senderWebContentsId = event?.sender?.id;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents && win.webContents.id !== senderWebContentsId) {
        safeSend(win.webContents, "preference:changed", { key, value });
      }
    }

    logger.log(`Preference set: ${key} (appId=${appId ?? 0})`);
  });

  // Get multiple preferences at once (from cache)
  createTypedHandler(miscContracts.getPreferences, async (_, { keys, appId }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const effectiveAppId = appId ?? 0;

    const result: Record<string, string | null> = {};
    for (const k of keys) {
      result[k] = preferencesCache.get(context.userId, k, effectiveAppId);
    }
    return result;
  });

  // Hydrate all preferences into the renderer (called once after auth)
  createTypedHandler(miscContracts.hydratePreferences, async (_, __, context) => {
    if (!context.userId) throw new Error("Unauthorized");

    // If cache isn't hydrated yet, hydrate it now
    if (!preferencesCache.isHydrated) {
      await preferencesCache.hydrate(context.userId);
    }

    // Return all global (appId=0) preferences as a flat map
    return preferencesCache.getAll(context.userId, 0);
  });

  logger.info("Registered preferences handlers");
}
