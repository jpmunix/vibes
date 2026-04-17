import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import { generateProblemReport } from "../processors/tsc";
import { getVibesAppPath } from "@/paths/paths";
import log from "electron-log";
import { createTypedHandler, HandlerContext } from "./base";
import { miscContracts } from "../types/misc";

const logger = log.scope("problems_handlers");

/** Languages that support TSC problem checking */
const TSC_COMPATIBLE_LANGUAGES = new Set(["javascript", "typescript", "unknown"]);

export function registerProblemsHandlers() {
  createTypedHandler(miscContracts.checkProblems, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    try {
      // Get the app to find its path
      const app = await db.query.apps.findFirst({
        where: and(eq(remoteSchema.apps.id, params.appId), eq(remoteSchema.apps.userId, context.userId)),
      });

      if (!app) {
        throw new Error(`App not found: ${params.appId}`);
      }

      // Skip TSC for non-Node projects (e.g. PHP, Python, etc.)
      const lang = app.primaryLanguage?.toLowerCase() || "unknown";
      if (!TSC_COMPATIBLE_LANGUAGES.has(lang)) {
        logger.info(`Skipping TSC check for non-Node app ${params.appId} (${lang})`);
        return { problems: [] };
      }

      const appPath = getVibesAppPath(app.path);

      try {
        // Call autofix with empty full response to just run TypeScript checking
        const problemReport = await generateProblemReport({
          fullResponse: "",
          appPath,
        });
        return problemReport;
      } catch (tscError) {
        // Just log the error and return empty problems. We don't want a TSC failure to break the whole agent/chat UI
        logger.error(`Error generating problem report for app ${appPath}:`, tscError);
        return { problems: [] };
      }

    } catch (error) {
      logger.error("Error in checkProblems handler:", error);
      throw error;
    }
  });
}
