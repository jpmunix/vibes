import { session } from "electron";
import fs from "node:fs/promises";
import { getTypeScriptCachePath } from "@/paths/paths";
import { createTypedHandler } from "./base";
import { systemContracts } from "../types/system";
import { readSettings } from "../../main/settings";
import log from "electron-log";
import { openRouterRequest } from "../utils/openrouter";

const logger = log.scope("session_handlers");

export const registerSessionHandlers = () => {
  createTypedHandler(systemContracts.clearSessionData, async () => {
    const defaultAppSession = session.defaultSession;

    await defaultAppSession.clearStorageData({
      storages: ["cookies", "localstorage"],
    });
    console.info(`[IPC] All session data cleared for default session`);

    // Clear custom cache data (like tsbuildinfo)
    try {
      await fs.rm(getTypeScriptCachePath(), { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  createTypedHandler(systemContracts.getOpenRouterCredits, async () => {
    const settings = readSettings();
    try {
      const response = await openRouterRequest("/credits", {
        method: "GET",
      });

      const body = await response.json();
      const totalCredits = body.data?.total_credits ?? 0;
      const totalUsage = body.data?.total_usage ?? 0;
      const availableCredits = totalCredits - totalUsage;

      return {
        totalCredits,
        totalUsage,
        availableCredits,
      };
    } catch (error: any) {
      logger.error("Failed to get OpenRouter credits:", error);
      throw new Error(error.message || "Failed to get OpenRouter credits.");
    }
  });
};
